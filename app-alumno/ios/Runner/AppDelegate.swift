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
    
    // Cooldown: don't register same detection within 5 minutes
    private let cooldownSeconds: TimeInterval = 300
    
    override func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        GeneratedPluginRegistrant.register(with: self)
        
        if let keys = launchOptions?[.bluetoothCentrals] as? [String] {
            NSLog("[BLE] 🔵 App relaunched by CoreBluetooth: %@", keys.description)
        }
        
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
            let channel = FlutterMethodChannel(
                name: "com.presencia.alumno/ble_background",
                binaryMessenger: controller.binaryMessenger
            )
            
            channel.setMethodCallHandler { [weak self] (call, result) in
                switch call.method {
                case "startBackgroundScan":
                    self?.startBackgroundScan()
                    result(true)
                case "isScanning":
                    result(self?.centralManager?.isScanning ?? false)
                case "getPendingDetections":
                    // Return detections saved natively while Flutter was suspended
                    let detections = self?.getPendingDetections() ?? []
                    result(detections)
                case "clearPendingDetections":
                    self?.clearPendingDetections()
                    result(true)
                default:
                    result(FlutterMethodNotImplemented)
                }
            }
        }
        
        return super.application(application, didFinishLaunchingWithOptions: launchOptions)
    }
    
    private func startBackgroundScan() {
        guard let cm = centralManager, cm.state == .poweredOn else {
            NSLog("[BLE] ⚠️ Bluetooth not ready")
            return
        }
        
        if !cm.isScanning {
            NSLog("[BLE] 🔍 Starting BLE scan")
            cm.scanForPeripherals(
                withServices: [AppDelegate.beaconServiceUUID],
                options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
            )
        }
    }
    
    // MARK: - Native Detection Handling (works even when Flutter is suspended)
    
    private func handleBeaconDetected(name: String, deviceId: String, rssi: Int) {
        let now = Date()
        
        // Cooldown check
        let lastKey = "lastDetection_\(getMatricula())"
        if let lastDetection = UserDefaults.standard.object(forKey: lastKey) as? Date {
            if now.timeIntervalSince(lastDetection) < cooldownSeconds {
                NSLog("[BLE] ⏳ Cooldown active, skipping")
                return
            }
        }
        
        // Save timestamp for cooldown
        UserDefaults.standard.set(now, forKey: lastKey)
        
        let matricula = getMatricula()
        let timestamp = ISO8601DateFormatter().string(from: now)
        
        NSLog("[BLE] ✅ BEACON DETECTED — saving natively. Matrícula: %@", matricula)
        
        // 1. Save to UserDefaults (Flutter will pick these up when it resumes)
        savePendingDetection(name: name, deviceId: deviceId, rssi: rssi, timestamp: timestamp)
        
        // 2. POST to backend directly from native (background URLSession)
        postToBackend(matricula: matricula, beaconId: name, timestamp: timestamp)
        
        // 3. Try to notify Flutter (may work if Flutter engine is alive)
        notifyFlutter(name: name, deviceId: deviceId, rssi: rssi, timestamp: timestamp)
    }
    
    // MARK: - UserDefaults Persistence
    
    private func getMatricula() -> String {
        // Read from Hive's SharedPreferences-like storage
        // Hive stores student_profile box — we read the matricula from UserDefaults
        // that we'll sync from Flutter
        return UserDefaults.standard.string(forKey: "student_matricula") ?? "unknown"
    }
    
    private func savePendingDetection(name: String, deviceId: String, rssi: Int, timestamp: String) {
        var pending = UserDefaults.standard.array(forKey: "pending_detections") as? [[String: Any]] ?? []
        pending.append([
            "name": name,
            "deviceId": deviceId,
            "rssi": rssi,
            "timestamp": timestamp,
            "matricula": getMatricula()
        ])
        UserDefaults.standard.set(pending, forKey: "pending_detections")
        NSLog("[BLE] 💾 Saved to UserDefaults (%d pending)", pending.count)
    }
    
    private func getPendingDetections() -> [[String: Any]] {
        return UserDefaults.standard.array(forKey: "pending_detections") as? [[String: Any]] ?? []
    }
    
    private func clearPendingDetections() {
        UserDefaults.standard.removeObject(forKey: "pending_detections")
        NSLog("[BLE] 🧹 Cleared pending detections")
    }
    
    // MARK: - Native HTTP POST (works in background)
    
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
        
        // Use background URLSession so it completes even if app gets suspended again
        let config = URLSessionConfiguration.background(withIdentifier: "com.presencia.alumno.sync.\(UUID().uuidString)")
        config.isDiscretionary = false
        config.sessionSendsLaunchEvents = true
        let session = URLSession(configuration: config)
        
        let task = session.dataTask(with: request) { data, response, error in
            if let httpResponse = response as? HTTPURLResponse {
                NSLog("[BLE] 📤 Backend POST: HTTP %d", httpResponse.statusCode)
            }
            if let error = error {
                NSLog("[BLE] ❌ Backend POST failed: %@", error.localizedDescription)
            }
        }
        task.resume()
        NSLog("[BLE] 📤 Sending POST to backend...")
    }
    
    // MARK: - Flutter Notification (best-effort)
    
    private func notifyFlutter(name: String, deviceId: String, rssi: Int, timestamp: String) {
        DispatchQueue.main.async { [weak self] in
            guard let controller = self?.window?.rootViewController as? FlutterViewController else { return }
            let channel = FlutterMethodChannel(
                name: "com.presencia.alumno/ble_background",
                binaryMessenger: controller.binaryMessenger
            )
            channel.invokeMethod("onBeaconDetected", arguments: [
                "name": name,
                "deviceId": deviceId,
                "rssi": rssi,
                "timestamp": timestamp
            ] as [String : Any])
        }
    }
}

// MARK: - CBCentralManagerDelegate
extension AppDelegate: CBCentralManagerDelegate {
    
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        switch central.state {
        case .poweredOn:
            NSLog("[BLE] ✅ Bluetooth powered on — starting scan")
            startBackgroundScan()
        case .poweredOff:
            NSLog("[BLE] ❌ Bluetooth powered off")
        case .unauthorized:
            NSLog("[BLE] ⚠️ Bluetooth unauthorized")
        default:
            NSLog("[BLE] ℹ️ Bluetooth state: %d", central.state.rawValue)
        }
    }
    
    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                         advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let name = peripheral.name ?? advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? ""
        
        if name.lowercased() == AppDelegate.beaconName.lowercased() {
            handleBeaconDetected(name: name, deviceId: peripheral.identifier.uuidString, rssi: RSSI.intValue)
        }
    }
    
    func centralManager(_ central: CBCentralManager, willRestoreState dict: [String: Any]) {
        NSLog("[BLE] 🔄 CoreBluetooth state restored — app relaunched")
    }
}
