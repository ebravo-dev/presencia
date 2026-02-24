import Flutter
import UIKit
import CoreBluetooth

@main
@objc class AppDelegate: FlutterAppDelegate {
    
    // CoreBluetooth state restoration key — iOS uses this to relaunch the app
    static let restoreIdentifier = "com.presencia.alumno.ble"
    
    // ESP32 beacon config (same as Flutter side)
    static let beaconServiceUUID = CBUUID(string: "12345678-1234-1234-1234-123456789abc")
    static let beaconName = "ESP32-C3_BLE"
    
    var centralManager: CBCentralManager?
    
    override func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        GeneratedPluginRegistrant.register(with: self)
        
        // Check if app was relaunched by CoreBluetooth
        if let centralManagerKeys = launchOptions?[.bluetoothCentrals] as? [String] {
            NSLog("[BLE] 🔵 App relaunched by CoreBluetooth: %@", centralManagerKeys.description)
        }
        
        // Initialize CBCentralManager with state restoration
        // This enables iOS to relaunch this app when it finds our beacon
        centralManager = CBCentralManager(
            delegate: self,
            queue: nil,
            options: [
                CBCentralManagerOptionRestoreIdentifierKey: AppDelegate.restoreIdentifier,
                CBCentralManagerOptionShowPowerAlertKey: true
            ]
        )
        
        // Set up Flutter method channel for communication
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
                default:
                    result(FlutterMethodNotImplemented)
                }
            }
        }
        
        return super.application(application, didFinishLaunchingWithOptions: launchOptions)
    }
    
    private func startBackgroundScan() {
        guard let cm = centralManager, cm.state == .poweredOn else {
            NSLog("[BLE] ⚠️ Bluetooth not ready, will scan when powered on")
            return
        }
        
        if !cm.isScanning {
            NSLog("[BLE] 🔍 Starting background BLE scan for %@", AppDelegate.beaconName)
            cm.scanForPeripherals(
                withServices: [AppDelegate.beaconServiceUUID],
                options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
            )
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
        case .unsupported:
            NSLog("[BLE] ❌ Bluetooth unsupported")
        default:
            NSLog("[BLE] ℹ️ Bluetooth state: %d", central.state.rawValue)
        }
    }
    
    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                         advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let name = peripheral.name ?? advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? ""
        
        NSLog("[BLE] 📡 Discovered: %@ (%@)", name, peripheral.identifier.uuidString)
        
        // Check if this is our beacon
        let isBeacon = name.lowercased() == AppDelegate.beaconName.lowercased()
        
        if isBeacon {
            NSLog("[BLE] ✅ BEACON DETECTED! %@", name)
            
            // Notify Flutter via method channel
            if let controller = window?.rootViewController as? FlutterViewController {
                let channel = FlutterMethodChannel(
                    name: "com.presencia.alumno/ble_background",
                    binaryMessenger: controller.binaryMessenger
                )
                channel.invokeMethod("onBeaconDetected", arguments: [
                    "name": name,
                    "deviceId": peripheral.identifier.uuidString,
                    "rssi": RSSI.intValue,
                    "timestamp": ISO8601DateFormatter().string(from: Date())
                ] as [String : Any])
            }
        }
    }
    
    // MARK: - State Restoration (key for wake-from-killed)
    func centralManager(_ central: CBCentralManager, willRestoreState dict: [String: Any]) {
        NSLog("[BLE] 🔄 CoreBluetooth state restored — app was relaunched")
        
        if let peripherals = dict[CBCentralManagerRestoredStatePeripheralsKey] as? [CBPeripheral] {
            NSLog("[BLE] 📱 Restored %d peripherals", peripherals.count)
        }
    }
}
