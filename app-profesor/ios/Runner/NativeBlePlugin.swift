import Flutter
import UIKit
import CoreBluetooth
import CoreLocation

class NativeBlePlugin: NSObject, FlutterStreamHandler, CBCentralManagerDelegate, CBPeripheralDelegate, CLLocationManagerDelegate {

    private var centralManager: CBCentralManager!
    private var locationManager: CLLocationManager!
    private var eventSink: FlutterEventSink?
    private var methodChannel: FlutterMethodChannel!
    private var eventChannel: FlutterEventChannel!

    // Para conectar y leer nombre GAP
    private var connectCompletion: ((String) -> Void)?
    private var connectedPeripheral: CBPeripheral?
    private var connectTimeoutTimer: Timer?

    // Peripherals descubiertos (necesario para mantener referencia fuerte)
    private var discoveredPeripherals: [String: CBPeripheral] = [:]

    // iBeacon ranging
    private var beaconConstraint: CLBeaconIdentityConstraint?
    private var isRangingBeacons = false

    // UUIDs de filtro para escaneo dual (iBeacon + GATT service)
    private var targetServiceUuids: [String]?

    func register(with messenger: FlutterBinaryMessenger) {
        centralManager = CBCentralManager(delegate: self, queue: nil, options: [
            CBCentralManagerOptionShowPowerAlertKey: false
        ])

        locationManager = CLLocationManager()
        locationManager.delegate = self

        methodChannel = FlutterMethodChannel(name: "com.presencia/ble", binaryMessenger: messenger)
        eventChannel = FlutterEventChannel(name: "com.presencia/ble_scan", binaryMessenger: messenger)

        eventChannel.setStreamHandler(self)
        methodChannel.setMethodCallHandler(handleMethodCall)
    }

    // MARK: - FlutterStreamHandler

    func onListen(withArguments arguments: Any?, eventSink events: @escaping FlutterEventSink) -> FlutterError? {
        self.eventSink = events
        return nil
    }

    func onCancel(withArguments arguments: Any?) -> FlutterError? {
        self.eventSink = nil
        return nil
    }

    // MARK: - MethodChannel Handler

    private func handleMethodCall(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        switch call.method {
        case "checkBluetoothState":
            result(bluetoothStateString())

        case "startScan":
            let args = call.arguments as? [String: Any]
            let serviceUuids = args?["serviceUuids"] as? [String]
            let status = startScan(serviceUuids: serviceUuids)
            result(status)

        case "stopScan":
            stopAllScanning()
            result(nil)

        case "connectAndReadName":
            guard let args = call.arguments as? [String: Any],
                  let deviceId = args["deviceId"] as? String,
                  let peripheral = discoveredPeripherals[deviceId] else {
                result("")
                return
            }
            connectAndReadName(peripheral: peripheral) { name in
                result(name)
            }

        case "disconnect":
            if let args = call.arguments as? [String: Any],
               let deviceId = args["deviceId"] as? String,
               let peripheral = discoveredPeripherals[deviceId] {
                centralManager.cancelPeripheralConnection(peripheral)
            }
            result(nil)

        default:
            result(FlutterMethodNotImplemented)
        }
    }

    // MARK: - Bluetooth State

    private func bluetoothStateString() -> String {
        switch centralManager.state {
        case .poweredOn: return "poweredOn"
        case .poweredOff: return "poweredOff"
        case .unauthorized: return "unauthorized"
        case .unsupported: return "unsupported"
        case .resetting: return "resetting"
        case .unknown: return "unknown"
        @unknown default: return "unknown"
        }
    }

    // MARK: - Scanning

    private var pendingScanUuids: [String]? = nil
    private var hasPendingScan = false

    private func startScan(serviceUuids: [String]?) -> String {
        // Si hay UUIDs de filtro, usar AMBOS: CLLocationManager (iBeacon) + CBCentralManager (GATT service UUID)
        if let uuids = serviceUuids, !uuids.isEmpty {
            targetServiceUuids = uuids
            let rangingStatus = startBeaconRanging(uuidString: uuids.first!)

            // También iniciar CBCentralManager scan con el UUID como service UUID filter
            // Esto detecta beacons que anuncian el UUID como GATT service (no iBeacon)
            if centralManager.state == .poweredOn {
                centralManager.stopScan()
                let cbuuids = uuids.compactMap { CBUUID(string: formatAsStandardUuid($0)) }
                // Escanear SIN filtro pero comparar manualmente (algunos beacons no anuncian service UUIDs)
                centralManager.scanForPeripherals(
                    withServices: nil,
                    options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
                )
                sendDebugEvent("Also started CBCentralManager scan (all devices, will match by service UUID or manufacturer data)")
            }

            return rangingStatus
        }

        // Sin filtro → CBCentralManager para escaneo BLE general
        targetServiceUuids = nil
        if centralManager.state != .poweredOn {
            NSLog("[NativeBLE] BT not ready yet (\(bluetoothStateString())), queueing scan...")
            hasPendingScan = true
            pendingScanUuids = serviceUuids
            return "bt_not_ready:\(bluetoothStateString())"
        }
        doStartBleScan()
        return "ble_scan_started"
    }

    private func doStartBleScan() {
        guard centralManager.state == .poweredOn else {
            NSLog("[NativeBLE] Cannot scan — BT state: \(bluetoothStateString())")
            return
        }

        centralManager.stopScan()
        NSLog("[NativeBLE] Starting BLE scan without filter (all devices)")

        centralManager.scanForPeripherals(
            withServices: nil,
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
        )
        NSLog("[NativeBLE] scanForPeripherals called, isScanning: \(centralManager.isScanning)")
    }

    // MARK: - iBeacon Ranging via CLLocationManager

    /// Helper para enviar eventos de debug al Flutter a través del eventSink
    private func sendDebugEvent(_ message: String) {
        NSLog("[NativeBLE] \(message)")
        let debugData: [String: Any] = [
            "type": "debug",
            "message": message,
        ]
        DispatchQueue.main.async { [weak self] in
            self?.eventSink?(debugData)
        }
    }

    private func startBeaconRanging(uuidString: String) -> String {
        let formatted = formatAsStandardUuid(uuidString)
        guard let uuid = UUID(uuidString: formatted) else {
            let msg = "Invalid beacon UUID: \(uuidString) (formatted: \(formatted))"
            sendDebugEvent(msg)
            return "error:invalid_uuid:\(formatted)"
        }

        // Pedir permiso de ubicación si es necesario
        let status: CLAuthorizationStatus
        if #available(iOS 14.0, *) {
            status = locationManager.authorizationStatus
        } else {
            status = CLLocationManager.authorizationStatus()
        }
        sendDebugEvent("Location auth status: \(status.rawValue) (3=authorizedWhenInUse, 4=authorizedAlways)")

        if status == .notDetermined {
            sendDebugEvent("Requesting location permission...")
            locationManager.requestWhenInUseAuthorization()
        } else if status == .denied || status == .restricted {
            sendDebugEvent("Location permission DENIED or RESTRICTED — iBeacon ranging will NOT work")
            return "error:location_denied:\(status.rawValue)"
        }

        // Detener ranging previo
        stopBeaconRanging()

        let constraint = CLBeaconIdentityConstraint(uuid: uuid)
        beaconConstraint = constraint
        isRangingBeacons = true
        locationManager.startRangingBeacons(satisfying: constraint)
        sendDebugEvent("Started iBeacon ranging for UUID: \(formatted)")
        sendDebugEvent("eventSink is \(eventSink != nil ? "SET" : "NIL")")
        return "ibeacon_ranging_started:\(formatted):auth=\(status.rawValue)"
    }

    private func stopBeaconRanging() {
        if let constraint = beaconConstraint {
            locationManager.stopRangingBeacons(satisfying: constraint)
            NSLog("[NativeBLE] Stopped iBeacon ranging")
        }
        beaconConstraint = nil
        isRangingBeacons = false
    }

    private func stopAllScanning() {
        centralManager.stopScan()
        stopBeaconRanging()
        targetServiceUuids = nil
        NSLog("[NativeBLE] All scanning stopped")
    }

    /// Convierte UUID sin guiones a formato estándar con guiones
    private func formatAsStandardUuid(_ raw: String) -> String {
        let clean = raw.lowercased().replacingOccurrences(of: "-", with: "")
        guard clean.count == 32 else { return raw }
        let chars = Array(clean)
        // 8-4-4-4-12
        return "\(String(chars[0..<8]))-\(String(chars[8..<12]))-\(String(chars[12..<16]))-\(String(chars[16..<20]))-\(String(chars[20..<32]))"
    }

    // MARK: - CLLocationManagerDelegate

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status: CLAuthorizationStatus
        if #available(iOS 14.0, *) {
            status = manager.authorizationStatus
        } else {
            status = CLLocationManager.authorizationStatus()
        }
        NSLog("[NativeBLE] Location auth changed: \(status.rawValue)")
    }

    func locationManager(_ manager: CLLocationManager, didRange beacons: [CLBeacon], satisfying beaconConstraint: CLBeaconIdentityConstraint) {
        sendDebugEvent("didRange: \(beacons.count) beacons found (eventSink: \(eventSink != nil ? "SET" : "NIL"))")
        if beacons.isEmpty {
            sendDebugEvent("didRange: 0 beacons — beacon might be too far or not advertising iBeacon")
        }
        for beacon in beacons {
            let uuidStr = beacon.uuid.uuidString.lowercased()
            sendDebugEvent("iBeacon FOUND: uuid=\(uuidStr) major=\(beacon.major) minor=\(beacon.minor) proximity=\(beacon.proximity.rawValue) rssi=\(beacon.rssi)")

            let deviceData: [String: Any] = [
                "type": "device",
                "deviceId": "\(uuidStr)_\(beacon.major)_\(beacon.minor)",
                "name": "iBeacon",
                "rssi": beacon.rssi,
                "serviceUuids": [uuidStr],
            ]

            DispatchQueue.main.async { [weak self] in
                self?.eventSink?(deviceData)
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailRangingFor beaconConstraint: CLBeaconIdentityConstraint, error: Error) {
        sendDebugEvent("Beacon ranging FAILED: \(error.localizedDescription)")
    }

    // MARK: - CBCentralManagerDelegate

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        NSLog("[NativeBLE] BT state changed: \(bluetoothStateString())")
        if central.state == .poweredOn && hasPendingScan {
            NSLog("[NativeBLE] BT now ready, executing pending scan")
            hasPendingScan = false
            pendingScanUuids = nil
            doStartBleScan()
        }
    }

    func centralManager(_ central: CBCentralManager,
                         didDiscover peripheral: CBPeripheral,
                         advertisementData: [String: Any],
                         rssi RSSI: NSNumber) {
        let deviceId = peripheral.identifier.uuidString
        discoveredPeripherals[deviceId] = peripheral

        let name = peripheral.name ?? advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? ""
        let rssi = RSSI.intValue

        var serviceUuids: [String] = []
        if let uuids = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] {
            serviceUuids = uuids.map { $0.uuidString.lowercased() }
        }

        // Si hay filtro activo (escaneo dual), solo emitir si coincide
        if let targets = targetServiceUuids, !targets.isEmpty {
            let normalizedTargets = targets.map { formatAsStandardUuid($0).lowercased() }

            // Verificar coincidencia por service UUID
            let matchedByService = serviceUuids.contains { svc in
                normalizedTargets.contains { target in
                    svc.replacingOccurrences(of: "-", with: "") == target.replacingOccurrences(of: "-", with: "")
                }
            }

            // Verificar coincidencia por manufacturer data (no-Apple, algunos beacons usan custom mfg data)
            var matchedByMfg = false
            var mfgUuid: String? = nil
            if let mfgDataDict = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data, mfgDataDict.count >= 18 {
                // Intentar parsear UUID de manufacturer data genérico
                // (Nota: iOS oculta mfg data de Apple/iBeacon, pero muestra de otros fabricantes)
                let bytes = [UInt8](mfgDataDict)
                // Saltar 2 bytes de company ID, buscar UUID en los siguientes 16 bytes
                if bytes.count >= 18 {
                    var uuidHex = ""
                    for i in 2..<18 {
                        uuidHex += String(format: "%02x", bytes[i])
                    }
                    let formatted = formatAsStandardUuid(uuidHex)
                    mfgUuid = formatted
                    matchedByMfg = normalizedTargets.contains { target in
                        uuidHex == target.replacingOccurrences(of: "-", with: "")
                    }
                }
            }

            if matchedByService || matchedByMfg {
                let matchType = matchedByService ? "service_uuid" : "manufacturer_data"
                sendDebugEvent("CBCentralManager MATCH (\(matchType)): \"\(name)\" (\(deviceId)) services: \(serviceUuids) mfgUuid: \(mfgUuid ?? "none")")

                let matchedUuid = matchedByService
                    ? serviceUuids.first { svc in normalizedTargets.contains { t in svc.replacingOccurrences(of: "-", with: "") == t.replacingOccurrences(of: "-", with: "") } } ?? ""
                    : (mfgUuid ?? "")

                let deviceData: [String: Any] = [
                    "type": "device",
                    "deviceId": deviceId,
                    "name": "BLE-Beacon (\(name))",
                    "rssi": rssi,
                    "serviceUuids": [matchedUuid],
                ]
                DispatchQueue.main.async { [weak self] in
                    self?.eventSink?(deviceData)
                }
            }
            // No emitir dispositivos que no coinciden cuando hay filtro
            return
        }

        // Sin filtro → emitir todo
        let deviceData: [String: Any] = [
            "type": "device",
            "deviceId": deviceId,
            "name": name,
            "rssi": rssi,
            "serviceUuids": serviceUuids,
        ]

        NSLog("[NativeBLE] Discovered: \"\(name)\" (\(deviceId)) RSSI: \(rssi) services: \(serviceUuids) eventSink: \(eventSink != nil)")

        DispatchQueue.main.async { [weak self] in
            self?.eventSink?(deviceData)
        }
    }

    // MARK: - Connect & Read GAP Name

    private func connectAndReadName(peripheral: CBPeripheral, completion: @escaping (String) -> Void) {
        connectedPeripheral = peripheral
        connectCompletion = completion
        peripheral.delegate = self

        // Timeout de 5 segundos
        connectTimeoutTimer?.invalidate()
        connectTimeoutTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: false) { [weak self] _ in
            guard let self = self else { return }
            NSLog("[NativeBLE] Connect timeout for \(peripheral.identifier.uuidString)")
            self.centralManager.cancelPeripheralConnection(peripheral)
            let cb = self.connectCompletion
            self.connectCompletion = nil
            self.connectedPeripheral = nil
            cb?("")
        }

        centralManager.connect(peripheral, options: nil)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        NSLog("[NativeBLE] Connected to \(peripheral.identifier.uuidString)")
        // Descubrir servicio GAP (0x1800)
        peripheral.discoverServices([CBUUID(string: "1800")])
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        NSLog("[NativeBLE] Failed to connect: \(error?.localizedDescription ?? "unknown")")
        connectTimeoutTimer?.invalidate()
        let cb = connectCompletion
        connectCompletion = nil
        connectedPeripheral = nil
        cb?("")
    }

    // MARK: - CBPeripheralDelegate (GAP name reading)

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard error == nil else {
            finishReadName(peripheral: peripheral, name: "")
            return
        }
        for service in peripheral.services ?? [] {
            if service.uuid == CBUUID(string: "1800") {
                // Buscar Device Name characteristic (0x2A00)
                peripheral.discoverCharacteristics([CBUUID(string: "2A00")], for: service)
                return
            }
        }
        finishReadName(peripheral: peripheral, name: "")
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard error == nil else {
            finishReadName(peripheral: peripheral, name: "")
            return
        }
        for char in service.characteristics ?? [] {
            if char.uuid == CBUUID(string: "2A00") {
                peripheral.readValue(for: char)
                return
            }
        }
        finishReadName(peripheral: peripheral, name: "")
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        var name = ""
        if error == nil, let data = characteristic.value {
            name = String(data: data, encoding: .utf8) ?? ""
        }
        finishReadName(peripheral: peripheral, name: name)
    }

    private func finishReadName(peripheral: CBPeripheral, name: String) {
        connectTimeoutTimer?.invalidate()
        centralManager.cancelPeripheralConnection(peripheral)
        let cb = connectCompletion
        connectCompletion = nil
        connectedPeripheral = nil
        if !name.isEmpty {
            NSLog("[NativeBLE] Resolved name: \"\(name)\" for \(peripheral.identifier.uuidString)")
        }
        cb?(name)
    }
}
