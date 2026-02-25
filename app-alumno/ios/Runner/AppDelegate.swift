import Flutter
import UIKit
import CoreBluetooth

@main
@objc class AppDelegate: FlutterAppDelegate {
    
    static let restoreIdentifier = "com.presencia.alumno.ble"
    static let beaconServiceUUID = CBUUID(string: "12345678-1234-1234-1234-123456789abc")
    static let beaconName = "ESP32-C3_BLE"
    static let backendURL = "https://apipresencia.110694.xyz/api/student-attendance"
    
    var centralManager: CBCentralManager?
    private var flutterChannel: FlutterMethodChannel?
    
    // Cooldown: don't register same detection within 5 minutes
    private let cooldownSeconds: TimeInterval = 300
    
    // Track if a foreground scan was requested
    private var isForegroundScanActive = false
    private var foregroundScanTimer: Timer?
    private var scanRestartTimer: Timer?
    
    override func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        GeneratedPluginRegistrant.register(with: self)
        
        if let keys = launchOptions?[.bluetoothCentrals] as? [String] {
            NSLog("[BLE] 🔵 App relaunched by CoreBluetooth: %@", keys.description)
        }
        
        // ONE central manager for everything (foreground + background)
        centralManager = CBCentralManager(
            delegate: self,
            queue: nil,
            options: [
                CBCentralManagerOptionRestoreIdentifierKey: AppDelegate.restoreIdentifier,
                CBCentralManagerOptionShowPowerAlertKey: true
            ]
        )
        
        // Flutter method channel
        if let controller = window?.rootViewController as? FlutterViewController {
            flutterChannel = FlutterMethodChannel(
                name: "com.presencia.alumno/ble_background",
                binaryMessenger: controller.binaryMessenger
            )
            
            flutterChannel?.setMethodCallHandler { [weak self] (call, result) in
                switch call.method {
                case "startBackgroundScan":
                    self?.startContinuousScan()
                    result(true)
                case "startForegroundScan":
                    // Foreground scan with timeout — Flutter wants a result
                    let timeout = (call.arguments as? [String: Any])?["timeout"] as? Double ?? 8.0
                    self?.startForegroundScan(timeout: timeout)
                    result(true)
                case "stopScan":
                    self?.stopForegroundScan()
                    result(true)
                case "isScanning":
                    result(self?.centralManager?.isScanning ?? false)
                case "getBluetoothState":
                    result(self?.centralManager?.state == .poweredOn ? "on" : "off")
                case "getPendingDetections":
                    let detections = self?.getPendingDetections() ?? []
                    result(detections)
                case "clearPendingDetections":
                    self?.clearPendingDetections()
                    result(true)
                case "setMatricula":
                    if let matricula = call.arguments as? String {
                        UserDefaults.standard.set(matricula, forKey: "student_matricula")
                        NSLog("[BLE] 📝 Matrícula set: %@", matricula)
                    }
                    result(true)
                default:
                    result(FlutterMethodNotImplemented)
                }
            }
        }
        
        return super.application(application, didFinishLaunchingWithOptions: launchOptions)
    }
    
    // MARK: - Scanning
    
    /// Start continuous background scan (runs until app is killed)
    /// Restarts scan every 30s to clear CoreBluetooth's duplicate cache
    private func startContinuousScan() {
        guard let cm = centralManager, cm.state == .poweredOn else {
            NSLog("[BLE] ⚠️ Bluetooth not ready")
            return
        }
        
        // Stop existing scan to reset duplicate filter
        if cm.isScanning {
            cm.stopScan()
        }
        
        NSLog("[BLE] 🔍 Starting BLE scan (foreground + background)")
        cm.scanForPeripherals(
            withServices: [AppDelegate.beaconServiceUUID],
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
        )
        
        // Schedule periodic restart to clear duplicate cache
        scheduleScanRestart()
    }
    
    private func scheduleScanRestart() {
        scanRestartTimer?.invalidate()
        scanRestartTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: false) { [weak self] _ in
            guard let self = self, self.centralManager?.isScanning == true else { return }
            NSLog("[BLE] 🔄 Restarting scan to reset duplicate filter")
            self.startContinuousScan()
        }
    }
    
    /// Foreground scan with timeout — notifies Flutter of result
    private func startForegroundScan(timeout: Double) {
        isForegroundScanActive = true
        
        // Force restart scan to clear duplicate cache (ensures re-detection)
        startContinuousScan()
        
        // Set timeout
        foregroundScanTimer?.invalidate()
        foregroundScanTimer = Timer.scheduledTimer(withTimeInterval: timeout, repeats: false) { [weak self] _ in
            guard let self = self, self.isForegroundScanActive else { return }
            self.isForegroundScanActive = false
            NSLog("[BLE] ⏰ Foreground scan timed out")
            self.flutterChannel?.invokeMethod("onScanResult", arguments: ["result": "timeout"])
        }
    }
    
    private func stopForegroundScan() {
        isForegroundScanActive = false
        foregroundScanTimer?.invalidate()
        foregroundScanTimer = nil
        // NOTE: We do NOT stop the CBCentralManager scan — it continues for background detection
    }
    
    // MARK: - Detection Handling
    
    private func handleBeaconDetected(name: String, deviceId: String, rssi: Int) {
        let now = Date()
        
        // Cooldown check
        let lastKey = "lastDetection"
        if let lastDetection = UserDefaults.standard.object(forKey: lastKey) as? Date {
            if now.timeIntervalSince(lastDetection) < cooldownSeconds {
                NSLog("[BLE] ⏳ Cooldown active, skipping (last: %.0f sec ago)", now.timeIntervalSince(lastDetection))
                
                // Still notify foreground scan to show "already registered"
                if isForegroundScanActive {
                    isForegroundScanActive = false
                    foregroundScanTimer?.invalidate()
                    flutterChannel?.invokeMethod("onScanResult", arguments: ["result": "cooldown"])
                }
                return
            }
        }
        
        // Save timestamp for cooldown
        UserDefaults.standard.set(now, forKey: lastKey)
        
        let matricula = UserDefaults.standard.string(forKey: "student_matricula") ?? "unknown"
        let timestamp = ISO8601DateFormatter().string(from: now)
        
        NSLog("[BLE] ✅ BEACON DETECTED! Matrícula: %@, RSSI: %d", matricula, rssi)
        
        // 1. Save to UserDefaults (Flutter will pick these up when it resumes)
        savePendingDetection(name: name, deviceId: deviceId, rssi: rssi, timestamp: timestamp)
        
        // 2. POST to backend directly
        postToBackend(matricula: matricula, beaconId: name, timestamp: timestamp)
        
        // 3. Notify Flutter if foreground scan is active
        if isForegroundScanActive {
            isForegroundScanActive = false
            foregroundScanTimer?.invalidate()
            DispatchQueue.main.async { [weak self] in
                self?.flutterChannel?.invokeMethod("onScanResult", arguments: [
                    "result": "detected",
                    "name": name,
                    "deviceId": deviceId,
                    "rssi": rssi,
                    "timestamp": timestamp
                ] as [String: Any])
            }
        }
        
        // 4. Also notify background detection stream
        DispatchQueue.main.async { [weak self] in
            self?.flutterChannel?.invokeMethod("onBeaconDetected", arguments: [
                "name": name,
                "deviceId": deviceId,
                "rssi": rssi,
                "timestamp": timestamp
            ] as [String: Any])
        }
    }
    
    // MARK: - UserDefaults Persistence
    
    private func savePendingDetection(name: String, deviceId: String, rssi: Int, timestamp: String) {
        var pending = UserDefaults.standard.array(forKey: "pending_detections") as? [[String: Any]] ?? []
        let matricula = UserDefaults.standard.string(forKey: "student_matricula") ?? "unknown"
        pending.append([
            "name": name,
            "deviceId": deviceId,
            "rssi": rssi,
            "timestamp": timestamp,
            "matricula": matricula
        ])
        UserDefaults.standard.set(pending, forKey: "pending_detections")
        NSLog("[BLE] 💾 Saved to UserDefaults (%d pending)", pending.count)
    }
    
    private func getPendingDetections() -> [[String: Any]] {
        return UserDefaults.standard.array(forKey: "pending_detections") as? [[String: Any]] ?? []
    }
    
    private func clearPendingDetections() {
        UserDefaults.standard.removeObject(forKey: "pending_detections")
    }
    
    // MARK: - Native HTTP POST
    
    private func postToBackend(matricula: String, beaconId: String, timestamp: String) {
        guard let url = URL(string: AppDelegate.backendURL) else { return }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 10
        
        let body: [String: Any] = [
            "studentName": matricula,
            "matricula": matricula,
            "beaconId": beaconId,
            "detectedAt": timestamp,
            "deviceInfo": "iOS (background)"
        ]
        
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        // Use shared session for immediate dispatch
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let httpResponse = response as? HTTPURLResponse {
                NSLog("[BLE] 📤 Backend POST: HTTP %d", httpResponse.statusCode)
            }
            if let error = error {
                NSLog("[BLE] ❌ Backend POST failed: %@", error.localizedDescription)
            }
        }.resume()
        
        NSLog("[BLE] 📤 Sending to backend...")
    }
}

// MARK: - CBCentralManagerDelegate
extension AppDelegate: CBCentralManagerDelegate {
    
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        let stateStr: String
        switch central.state {
        case .poweredOn:
            stateStr = "poweredOn"
            NSLog("[BLE] ✅ Bluetooth ON — starting continuous scan")
            startContinuousScan()
        case .poweredOff:
            stateStr = "poweredOff"
            NSLog("[BLE] ❌ Bluetooth OFF")
        case .unauthorized:
            stateStr = "unauthorized"
            NSLog("[BLE] ⚠️ Bluetooth unauthorized")
        case .unsupported:
            stateStr = "unsupported"
            NSLog("[BLE] ❌ Bluetooth unsupported")
        default:
            stateStr = "unknown"
            NSLog("[BLE] ℹ️ Bluetooth state: %d", central.state.rawValue)
        }
        
        // Notify Flutter of state change
        DispatchQueue.main.async { [weak self] in
            self?.flutterChannel?.invokeMethod("onBluetoothStateChanged", arguments: stateStr)
        }
    }
    
    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                         advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let name = peripheral.name ?? advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? ""
        
        // We already filter by service UUID in scanForPeripherals.
        // In background, name may be empty but service UUID still matches.
        let hasServiceUuid = (advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID])?
            .contains(AppDelegate.beaconServiceUUID) ?? false
        let nameMatches = !name.isEmpty && name.lowercased() == AppDelegate.beaconName.lowercased()
        
        if !name.isEmpty {
            NSLog("[BLE] 📡 Found: %@ (RSSI: %d, svcUUID: %@)", name, RSSI.intValue, hasServiceUuid ? "yes" : "no")
        }
        
        if hasServiceUuid || nameMatches {
            handleBeaconDetected(
                name: name.isEmpty ? AppDelegate.beaconName : name,
                deviceId: peripheral.identifier.uuidString,
                rssi: RSSI.intValue
            )
        }
    }
    
    func centralManager(_ central: CBCentralManager, willRestoreState dict: [String: Any]) {
        NSLog("[BLE] 🔄 CoreBluetooth state restored — app relaunched from killed")
        // State restoration: we just need the delegate set (already done by init)
        // When centralManagerDidUpdateState fires with .poweredOn, we'll start scanning again
    }
}
