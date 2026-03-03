import Flutter
import UIKit
import CoreBluetooth

@main
@objc class AppDelegate: FlutterAppDelegate {
    
    // MARK: - BLE UUIDs (shared with professor app)
    static let serviceUUID = CBUUID(string: "12345678-1234-1234-1234-123456789abc")
    static let matriculaCharUUID = CBUUID(string: "12345678-1234-1234-1234-000000000001") // READ
    static let confirmCharUUID = CBUUID(string: "12345678-1234-1234-1234-000000000002")   // WRITE
    
    private var peripheralManager: CBPeripheralManager?
    private var flutterChannel: FlutterMethodChannel?
    
    private var matriculaChar: CBMutableCharacteristic?
    private var confirmChar: CBMutableCharacteristic?
    
    private var isAdvertising = false
    private var isServiceAdded = false
    
    override func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        GeneratedPluginRegistrant.register(with: self)
        
        // Initialize CBPeripheralManager for GATT server + advertising
        peripheralManager = CBPeripheralManager(
            delegate: self,
            queue: nil,
            options: [
                CBPeripheralManagerOptionRestoreIdentifierKey: "com.presencia.alumno.peripheral"
            ]
        )
        
        // Flutter method channel
        if let controller = window?.rootViewController as? FlutterViewController {
            flutterChannel = FlutterMethodChannel(
                name: "com.presencia.alumno/ble_advertiser",
                binaryMessenger: controller.binaryMessenger
            )
            
            flutterChannel?.setMethodCallHandler { [weak self] (call, result) in
                switch call.method {
                case "startAdvertising":
                    self?.startAdvertising()
                    result(true)
                case "stopAdvertising":
                    self?.stopAdvertising()
                    result(true)
                case "isAdvertising":
                    result(self?.isAdvertising ?? false)
                case "getBluetoothState":
                    let state = self?.peripheralManager?.state ?? .unknown
                    result(state == .poweredOn ? "on" : "off")
                case "setMatricula":
                    if let matricula = call.arguments as? String {
                        UserDefaults.standard.set(matricula, forKey: "student_matricula")
                        self?.updateMatriculaCharacteristic()
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
    
    // MARK: - GATT Service Setup
    
    private func setupGATTService() {
        guard !isServiceAdded else { return }
        
        let matricula = UserDefaults.standard.string(forKey: "student_matricula") ?? ""
        
        // Matrícula characteristic — READ (professor reads this)
        matriculaChar = CBMutableCharacteristic(
            type: AppDelegate.matriculaCharUUID,
            properties: [.read],
            value: nil, // nil = dynamic value via delegate callback
            permissions: [.readable]
        )
        
        // Confirmation characteristic — WRITE (professor writes confirmation)
        confirmChar = CBMutableCharacteristic(
            type: AppDelegate.confirmCharUUID,
            properties: [.write, .writeWithoutResponse],
            value: nil,
            permissions: [.writeable]
        )
        
        let service = CBMutableService(type: AppDelegate.serviceUUID, primary: true)
        service.characteristics = [matriculaChar!, confirmChar!]
        
        peripheralManager?.add(service)
        NSLog("[BLE] 📋 Adding GATT service (matrícula: %@)", matricula)
    }
    
    private func updateMatriculaCharacteristic() {
        // Value is served dynamically in didReceiveRead, no update needed on the characteristic itself.
        // If we had subscribers we'd notify here, but READ-only doesn't need it.
        NSLog("[BLE] 📝 Matrícula updated for GATT reads")
    }
    
    // MARK: - Advertising
    
    private func startAdvertising() {
        guard let pm = peripheralManager, pm.state == .poweredOn else {
            NSLog("[BLE] ⚠️ Bluetooth not ready for advertising")
            return
        }
        
        if isAdvertising {
            NSLog("[BLE] ℹ️ Already advertising")
            return
        }
        
        // Advertise the service UUID so the professor app can discover us
        pm.startAdvertising([
            CBAdvertisementDataServiceUUIDsKey: [AppDelegate.serviceUUID],
            CBAdvertisementDataLocalNameKey: "PRES"
        ])
        
        NSLog("[BLE] 📡 Started BLE advertising")
    }
    
    private func stopAdvertising() {
        peripheralManager?.stopAdvertising()
        isAdvertising = false
        NSLog("[BLE] 🛑 Stopped advertising")
        
        DispatchQueue.main.async { [weak self] in
            self?.flutterChannel?.invokeMethod("onAdvertisingStateChanged", arguments: false)
        }
    }
}

// MARK: - CBPeripheralManagerDelegate
extension AppDelegate: CBPeripheralManagerDelegate {
    
    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        let stateStr: String
        switch peripheral.state {
        case .poweredOn:
            stateStr = "poweredOn"
            NSLog("[BLE] ✅ Bluetooth ON — setting up GATT + advertising")
            setupGATTService()
        case .poweredOff:
            stateStr = "poweredOff"
            isAdvertising = false
            isServiceAdded = false
            NSLog("[BLE] ❌ Bluetooth OFF")
        case .unauthorized:
            stateStr = "unauthorized"
            NSLog("[BLE] ⚠️ Bluetooth unauthorized")
        case .unsupported:
            stateStr = "unsupported"
            NSLog("[BLE] ❌ Bluetooth unsupported")
        default:
            stateStr = "unknown"
            NSLog("[BLE] ℹ️ Bluetooth state: %d", peripheral.state.rawValue)
        }
        
        DispatchQueue.main.async { [weak self] in
            self?.flutterChannel?.invokeMethod("onBluetoothStateChanged", arguments: stateStr)
        }
    }
    
    func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
        if let error = error {
            NSLog("[BLE] ❌ Failed to add GATT service: %@", error.localizedDescription)
            return
        }
        isServiceAdded = true
        NSLog("[BLE] ✅ GATT service added — starting advertising")
        startAdvertising()
    }
    
    func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
        if let error = error {
            NSLog("[BLE] ❌ Failed to start advertising: %@", error.localizedDescription)
            isAdvertising = false
        } else {
            isAdvertising = true
            NSLog("[BLE] ✅ Advertising started successfully")
        }
        
        DispatchQueue.main.async { [weak self] in
            self?.flutterChannel?.invokeMethod("onAdvertisingStateChanged", arguments: self?.isAdvertising ?? false)
        }
    }
    
    // Professor reads matrícula
    func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveRead request: CBATTRequest) {
        if request.characteristic.uuid == AppDelegate.matriculaCharUUID {
            let matricula = UserDefaults.standard.string(forKey: "student_matricula") ?? ""
            guard let data = matricula.data(using: .utf8) else {
                peripheral.respond(to: request, withResult: .unlikelyError)
                return
            }
            
            if request.offset > data.count {
                peripheral.respond(to: request, withResult: .invalidOffset)
                return
            }
            
            request.value = data.subdata(in: request.offset..<data.count)
            peripheral.respond(to: request, withResult: .success)
            NSLog("[BLE] 📖 Matrícula read by professor: %@", matricula)
        } else {
            peripheral.respond(to: request, withResult: .attributeNotFound)
        }
    }
    
    // Professor writes attendance confirmation
    func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
        for request in requests {
            if request.characteristic.uuid == AppDelegate.confirmCharUUID {
                if let data = request.value, let message = String(data: data, encoding: .utf8) {
                    NSLog("[BLE] ✅ Confirmation received from professor: %@", message)
                    
                    DispatchQueue.main.async { [weak self] in
                        self?.flutterChannel?.invokeMethod("onAttendanceConfirmed", arguments: message)
                    }
                }
            }
        }
        
        // Respond to the first request (required for write-with-response)
        if let first = requests.first {
            peripheral.respond(to: first, withResult: .success)
        }
    }
    
    // State restoration for background peripheral
    func peripheralManager(_ peripheral: CBPeripheralManager, willRestoreState dict: [String: Any]) {
        NSLog("[BLE] 🔄 Peripheral state restored — re-setting up GATT")
        // After restore, peripheralManagerDidUpdateState will fire and we'll re-add the service
    }
}
