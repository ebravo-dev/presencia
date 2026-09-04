import CoreBluetooth
import CoreLocation
import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterStreamHandler {
  private let advertiserChannelName = "com.presencia.alumno/ble_advertiser"
  private let scannerMethodChannelName = "com.presencia/altbeacon"
  private let scannerEventChannelName = "com.presencia/altbeacon_events"
  private let attendanceServiceUuid = CBUUID(string: "9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c1")
  private let attendanceUuidCharacteristicUuid = CBUUID(string: "9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c2")
  private let confirmationCharacteristicUuid = CBUUID(string: "9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c3")

  private var advertiserChannel: FlutterMethodChannel?
  private var scannerEventSink: FlutterEventSink?

  private var peripheralManager: CBPeripheralManager?
  private var pendingAdvertisementData: [String: Any]?
  private var isAdvertising = false
  private var activeAttendanceUuid: String?
  private var attendanceUuidValue: Data?
  private var waitingForGattService = false
  private var pendingAdvertiserBluetoothResults: [FlutterResult] = []
  private var pendingScannerBluetoothResults: [FlutterResult] = []
  private var pendingBluetoothPermissionResults: [FlutterResult] = []

  private var locationManager: CLLocationManager?
  private var pendingLocationPermissionResult: FlutterResult?
  private var activeConstraints: [String: CLBeaconIdentityConstraint] = [:]
  private var monitoredRegions: [String: CLBeaconRegion] = [:]
  private var backgroundTaskIdentifier: UIBackgroundTaskIdentifier = .invalid

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GeneratedPluginRegistrant.register(with: self)
    configureLocationManager()

    if let controller = window?.rootViewController as? FlutterViewController {
      registerAdvertiserChannel(controller.binaryMessenger)
      registerScannerChannels(controller.binaryMessenger)
    }

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  private func registerAdvertiserChannel(_ messenger: FlutterBinaryMessenger) {
    let channel = FlutterMethodChannel(
      name: advertiserChannelName,
      binaryMessenger: messenger
    )
    advertiserChannel = channel

    channel.setMethodCallHandler { [weak self] call, result in
      guard let self = self else {
        result(FlutterError(code: "UNAVAILABLE", message: "BLE no disponible", details: nil))
        return
      }

      switch call.method {
      case "startAdvertising":
        guard
          let args = call.arguments as? [String: Any],
          let uuidString = args["uuid"] as? String,
          let uuid = UUID(uuidString: uuidString)
        else {
          result(FlutterError(code: "INVALID_ARGS", message: "UUID de asistencia invalido", details: nil))
          return
        }

        let major = UInt16(args["major"] as? Int ?? 1)
        let minor = UInt16(args["minor"] as? Int ?? 1)
        let measuredPower = Int8(args["measuredPower"] as? Int ?? -59)
        self.startBeacon(uuid: uuid, major: major, minor: minor, measuredPower: measuredPower)
        result(true)

      case "stopAdvertising":
        self.stopBeacon()
        result(true)

      case "isAdvertising":
        result(self.isAdvertising)

      case "getBluetoothState":
        self.checkPeripheralBluetoothState(result: result, scannerFormat: false)

      case "setStudentIdentity":
        if let args = call.arguments as? [String: Any] {
          if let matricula = args["matricula"] as? String {
            UserDefaults.standard.set(matricula, forKey: "student_matricula")
          }
          if let attendanceUuid = args["attendanceUuid"] as? String {
            UserDefaults.standard.set(attendanceUuid, forKey: "student_attendance_uuid")
          }
          if let deviceBindingId = args["deviceBindingId"] as? String {
            UserDefaults.standard.set(deviceBindingId, forKey: "student_device_binding_id")
          }
        }
        result(true)

      default:
        result(FlutterMethodNotImplemented)
      }
    }
  }

  private func registerScannerChannels(_ messenger: FlutterBinaryMessenger) {
    let methodChannel = FlutterMethodChannel(
      name: scannerMethodChannelName,
      binaryMessenger: messenger
    )
    methodChannel.setMethodCallHandler { [weak self] call, result in
      guard let self = self else {
        result(FlutterError(code: "UNAVAILABLE", message: "Scanner no disponible", details: nil))
        return
      }

      DispatchQueue.main.async {
        self.handleScannerCall(call, result: result)
      }
    }

    let eventChannel = FlutterEventChannel(
      name: scannerEventChannelName,
      binaryMessenger: messenger
    )
    eventChannel.setStreamHandler(self)
  }

  func onListen(withArguments arguments: Any?, eventSink events: @escaping FlutterEventSink)
    -> FlutterError?
  {
    scannerEventSink = events
    return nil
  }

  func onCancel(withArguments arguments: Any?) -> FlutterError? {
    scannerEventSink = nil
    return nil
  }

  private func handleScannerCall(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    configureLocationManager()

    switch call.method {
    case "checkBluetoothState":
      checkPeripheralBluetoothState(result: result, scannerFormat: true)

    case "checkLocationServices":
      result(CLLocationManager.locationServicesEnabled())

    case "checkBluetoothPermission":
      result(bluetoothAuthorizationName())

    case "requestBluetoothPermission":
      requestBluetoothPermission(result: result)

    case "checkLocationPermission":
      guard let manager = locationManager else {
        result("unknown")
        return
      }
      result(locationAuthorizationName(authorizationStatus(for: manager)))

    case "requestLocationPermission":
      requestNativeLocationPermission(result: result)

    case "openBluetoothSettings", "openLocationSettings":
      guard let url = URL(string: UIApplication.openSettingsURLString) else {
        result(false)
        return
      }
      UIApplication.shared.open(url, options: [:]) { opened in
        result(opened)
      }

    case "requestPermissions":
      requestNativeLocationPermission(result: result)

    case "startScanning":
      guard let args = call.arguments as? [String: Any] else {
        result(FlutterError(code: "INVALID_ARGUMENT", message: "Argumentos invalidos", details: nil))
        return
      }
      let singleUuid = args["uuid"] as? String
      let uuids = args["uuids"] as? [String] ?? singleUuid.map { [$0] } ?? []
      startScanning(uuidStrings: uuids, result: result)

    case "stopScanning":
      stopScanning(result: result)

    default:
      result(FlutterMethodNotImplemented)
    }
  }

  private func configurePeripheralManager() {
    if peripheralManager != nil { return }
    peripheralManager = CBPeripheralManager(delegate: self, queue: nil, options: nil)
  }

  private func checkPeripheralBluetoothState(
    result: @escaping FlutterResult,
    scannerFormat: Bool
  ) {
    configurePeripheralManager()
    let state = peripheralManager?.state ?? .unknown
    if state == .unknown || state == .resetting {
      if scannerFormat {
        pendingScannerBluetoothResults.append(result)
      } else {
        pendingAdvertiserBluetoothResults.append(result)
      }
      return
    }
    result(scannerFormat ? scannerBluetoothStateName(state) : advertiserBluetoothStateName(state))
  }

  private func scannerBluetoothStateName(_ state: CBManagerState) -> String {
    switch state {
    case .poweredOn: return "poweredOn"
    case .poweredOff: return "poweredOff"
    case .unauthorized: return "unauthorized"
    case .unsupported: return "unsupported"
    default: return "unknown"
    }
  }

  private func advertiserBluetoothStateName(_ state: CBManagerState) -> String {
    state == .poweredOn ? "on" : "off"
  }

  private func bluetoothAuthorizationName() -> String {
    switch CBManager.authorization {
    case .allowedAlways: return "granted"
    case .notDetermined: return "notDetermined"
    case .denied: return "denied"
    case .restricted: return "restricted"
    @unknown default: return "unknown"
    }
  }

  private func requestBluetoothPermission(result: @escaping FlutterResult) {
    let status = bluetoothAuthorizationName()
    guard status == "notDetermined" else {
      result(status)
      return
    }
    pendingBluetoothPermissionResults.append(result)
    configurePeripheralManager()
  }

  private func startBeacon(uuid: UUID, major: UInt16, minor: UInt16, measuredPower: Int8) {
    configurePeripheralManager()
    activeAttendanceUuid = uuid.uuidString
    attendanceUuidValue = uuid.uuidString.data(using: .utf8)
    pendingAdvertisementData = [
      CBAdvertisementDataServiceUUIDsKey: [attendanceServiceUuid],
      CBAdvertisementDataLocalNameKey: "Presencia"
    ]
    waitingForGattService = true
    configureAttendanceGattService()
  }

  private func stopBeacon() {
    peripheralManager?.stopAdvertising()
    peripheralManager?.removeAllServices()
    pendingAdvertisementData = nil
    activeAttendanceUuid = nil
    attendanceUuidValue = nil
    waitingForGattService = false
    isAdvertising = false
    advertiserChannel?.invokeMethod("onAdvertisingStateChanged", arguments: false)
  }

  private func configureAttendanceGattService() {
    guard let manager = peripheralManager, manager.state == .poweredOn else { return }
    manager.removeAllServices()

    let uuidCharacteristic = CBMutableCharacteristic(
      type: attendanceUuidCharacteristicUuid,
      properties: [.read],
      value: attendanceUuidValue,
      permissions: [.readable]
    )
    let confirmationCharacteristic = CBMutableCharacteristic(
      type: confirmationCharacteristicUuid,
      properties: [.write],
      value: nil,
      permissions: [.writeable]
    )
    let service = CBMutableService(type: attendanceServiceUuid, primary: true)
    service.characteristics = [uuidCharacteristic, confirmationCharacteristic]
    manager.add(service)
  }

  private func triggerAdvertisingIfPossible() {
    guard
      let manager = peripheralManager,
      manager.state == .poweredOn,
      !waitingForGattService,
      let data = pendingAdvertisementData
    else {
      return
    }

    if manager.isAdvertising {
      manager.stopAdvertising()
    }
    manager.startAdvertising(data)
  }

  private func buildIBeaconAdvertisement(
    uuid: UUID,
    major: UInt16,
    minor: UInt16,
    measuredPower: Int8
  ) -> [String: Any] {
    var buffer = [UInt8](repeating: 0, count: 21)
    let uuidBytes = uuid.uuid
    buffer[0] = uuidBytes.0
    buffer[1] = uuidBytes.1
    buffer[2] = uuidBytes.2
    buffer[3] = uuidBytes.3
    buffer[4] = uuidBytes.4
    buffer[5] = uuidBytes.5
    buffer[6] = uuidBytes.6
    buffer[7] = uuidBytes.7
    buffer[8] = uuidBytes.8
    buffer[9] = uuidBytes.9
    buffer[10] = uuidBytes.10
    buffer[11] = uuidBytes.11
    buffer[12] = uuidBytes.12
    buffer[13] = uuidBytes.13
    buffer[14] = uuidBytes.14
    buffer[15] = uuidBytes.15
    buffer[16] = UInt8((major >> 8) & 0xff)
    buffer[17] = UInt8(major & 0xff)
    buffer[18] = UInt8((minor >> 8) & 0xff)
    buffer[19] = UInt8(minor & 0xff)
    buffer[20] = UInt8(bitPattern: measuredPower)
    return ["kCBAdvDataAppleBeaconKey": Data(buffer)]
  }

  private func configureLocationManager() {
    if locationManager != nil { return }
    let manager = CLLocationManager()
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyBest
    manager.pausesLocationUpdatesAutomatically = false
    locationManager = manager
  }

  private func requestNativeLocationPermission(result: @escaping FlutterResult) {
    guard let manager = locationManager else {
      result("unknown")
      return
    }
    let status = authorizationStatus(for: manager)
    if status == .notDetermined {
      pendingLocationPermissionResult = result
      manager.requestWhenInUseAuthorization()
      return
    }
    result(locationAuthorizationName(status))
  }

  private func locationAuthorizationName(_ status: CLAuthorizationStatus) -> String {
    switch status {
    case .authorizedAlways, .authorizedWhenInUse: return "granted"
    case .notDetermined: return "notDetermined"
    case .denied: return "denied"
    case .restricted: return "restricted"
    @unknown default: return "unknown"
    }
  }

  private func startScanning(uuidStrings: [String], result: @escaping FlutterResult) {
    guard let manager = locationManager else {
      result(FlutterError(code: "UNINITIALIZED", message: "CoreLocation no disponible", details: nil))
      return
    }
    guard CLLocationManager.isRangingAvailable() else {
      result(FlutterError(code: "UNSUPPORTED", message: "Ranging iBeacon no disponible", details: nil))
      return
    }

    let status = authorizationStatus(for: manager)
    if status == .notDetermined {
      manager.requestWhenInUseAuthorization()
      result(false)
      return
    }
    guard status == .authorizedAlways || status == .authorizedWhenInUse else {
      result(FlutterError(code: "PERMISSION_DENIED", message: "Permiso de ubicacion denegado", details: nil))
      return
    }

    stopScanning(result: nil)

    let uniqueUuids = Array(Set(uuidStrings.map { $0.uppercased() })).sorted()
    guard !uniqueUuids.isEmpty else {
      result(FlutterError(code: "INVALID_ARGUMENT", message: "Se requiere al menos un UUID", details: nil))
      return
    }

    if status == .authorizedAlways {
      manager.allowsBackgroundLocationUpdates = true
    }

    for uuidString in uniqueUuids {
      guard let uuid = UUID(uuidString: uuidString) else {
        stopScanning(result: nil)
        result(FlutterError(code: "INVALID_UUID", message: "UUID invalido: \(uuidString)", details: nil))
        return
      }

      let constraint = CLBeaconIdentityConstraint(uuid: uuid)
      let identifier = uuid.uuidString
      activeConstraints[identifier] = constraint
      manager.startRangingBeacons(satisfying: constraint)

      let region = CLBeaconRegion(beaconIdentityConstraint: constraint, identifier: identifier)
      region.notifyOnEntry = true
      region.notifyOnExit = true
      region.notifyEntryStateOnDisplay = true
      monitoredRegions[identifier] = region
      manager.startMonitoring(for: region)
      manager.requestState(for: region)
    }

    result(true)
  }

  private func stopScanning(result: FlutterResult?) {
    guard let manager = locationManager else {
      result?(false)
      return
    }

    for constraint in activeConstraints.values {
      manager.stopRangingBeacons(satisfying: constraint)
    }
    for region in monitoredRegions.values {
      manager.stopMonitoring(for: region)
    }

    activeConstraints.removeAll()
    monitoredRegions.removeAll()
    endBackgroundTaskIfNeeded()
    result?(true)
  }

  private func authorizationStatus(for manager: CLLocationManager) -> CLAuthorizationStatus {
    if #available(iOS 14.0, *) {
      return manager.authorizationStatus
    }
    return CLLocationManager.authorizationStatus()
  }

  private func requestExecutionTimeExtension() {
    guard backgroundTaskIdentifier == .invalid else { return }
    backgroundTaskIdentifier = UIApplication.shared.beginBackgroundTask(
      withName: "StudentRoomBeaconRanging"
    ) { [weak self] in
      self?.endBackgroundTaskIfNeeded()
    }

    DispatchQueue.main.asyncAfter(deadline: .now() + 25) { [weak self] in
      self?.endBackgroundTaskIfNeeded()
    }
  }

  private func endBackgroundTaskIfNeeded() {
    guard backgroundTaskIdentifier != .invalid else { return }
    UIApplication.shared.endBackgroundTask(backgroundTaskIdentifier)
    backgroundTaskIdentifier = .invalid
  }
}

extension AppDelegate: CBPeripheralManagerDelegate {
  func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
    if bluetoothAuthorizationName() != "notDetermined" &&
       !pendingBluetoothPermissionResults.isEmpty {
      let results = pendingBluetoothPermissionResults
      pendingBluetoothPermissionResults.removeAll()
      let permission = bluetoothAuthorizationName()
      results.forEach { $0(permission) }
    }
    if !pendingScannerBluetoothResults.isEmpty {
      let results = pendingScannerBluetoothResults
      pendingScannerBluetoothResults.removeAll()
      let state = scannerBluetoothStateName(peripheral.state)
      results.forEach { $0(state) }
    }
    if !pendingAdvertiserBluetoothResults.isEmpty {
      let results = pendingAdvertiserBluetoothResults
      pendingAdvertiserBluetoothResults.removeAll()
      let state = advertiserBluetoothStateName(peripheral.state)
      results.forEach { $0(state) }
    }

    let state: String
    switch peripheral.state {
    case .poweredOn:
      state = "poweredOn"
      if activeAttendanceUuid != nil {
        configureAttendanceGattService()
      }
    case .poweredOff:
      state = "poweredOff"
      isAdvertising = false
    case .unauthorized:
      state = "unauthorized"
      isAdvertising = false
    case .unsupported:
      state = "unsupported"
      isAdvertising = false
    default:
      state = "unknown"
      isAdvertising = false
    }

    advertiserChannel?.invokeMethod("onBluetoothStateChanged", arguments: state)
  }

  func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
    isAdvertising = error == nil
    if error != nil {
      pendingAdvertisementData = nil
    }
    advertiserChannel?.invokeMethod("onAdvertisingStateChanged", arguments: isAdvertising)
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
    guard service.uuid == attendanceServiceUuid else { return }

    if error != nil {
      waitingForGattService = false
      pendingAdvertisementData = nil
      isAdvertising = false
      advertiserChannel?.invokeMethod("onAdvertisingStateChanged", arguments: false)
      return
    }

    waitingForGattService = false
    triggerAdvertisingIfPossible()
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveRead request: CBATTRequest) {
    guard request.characteristic.uuid == attendanceUuidCharacteristicUuid,
          let value = attendanceUuidValue
    else {
      peripheral.respond(to: request, withResult: .attributeNotFound)
      return
    }
    request.value = value
    peripheral.respond(to: request, withResult: .success)
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
    for request in requests {
      guard request.characteristic.uuid == confirmationCharacteristicUuid else {
        peripheral.respond(to: request, withResult: .attributeNotFound)
        continue
      }
      guard let value = request.value,
            let message = String(data: value, encoding: .utf8),
            isConfirmationForCurrentStudent(value)
      else {
        peripheral.respond(to: request, withResult: .unlikelyError)
        continue
      }
      advertiserChannel?.invokeMethod("onAttendanceConfirmed", arguments: message)
      peripheral.respond(to: request, withResult: .success)
      stopBeacon()
    }
  }

  private func isConfirmationForCurrentStudent(_ data: Data) -> Bool {
    guard let expected = UserDefaults.standard.string(forKey: "student_matricula")?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased(),
          !expected.isEmpty,
          let jsonObject = try? JSONSerialization.jsonObject(with: data),
          let payload = jsonObject as? [String: Any],
          let matricula = payload["id"] as? String,
          let materia = payload["materia"] as? String
    else {
      return false
    }

    let validShape = payload.count == 2 ||
      (payload.count == 3 && isValidGattDay(payload["dia"] as? String))

    return validShape &&
      matricula.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() == expected &&
      !materia.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  private func isValidGattDay(_ value: String?) -> Bool {
    guard let value = value else { return false }
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.isLenient = false
    guard let parsed = formatter.date(from: value) else { return false }
    return formatter.string(from: parsed) == value
  }
}

extension AppDelegate: CLLocationManagerDelegate {
  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    guard let result = pendingLocationPermissionResult else { return }

    let status = authorizationStatus(for: manager)
    guard status != .notDetermined else { return }

    pendingLocationPermissionResult = nil
    result(locationAuthorizationName(status))
  }

  func locationManager(
    _ manager: CLLocationManager,
    didRange beacons: [CLBeacon],
    satisfying beaconConstraint: CLBeaconIdentityConstraint
  ) {
    if UIApplication.shared.applicationState != .active {
      requestExecutionTimeExtension()
    }

    let payload = beacons
      .filter { $0.rssi != 0 }
      .map { beacon -> [String: Any] in
        [
          "uuid": beacon.uuid.uuidString,
          "major": beacon.major.intValue,
          "minor": beacon.minor.intValue,
          "rssi": beacon.rssi,
          "distance": beacon.accuracy
        ]
      }

    guard !payload.isEmpty else { return }

    DispatchQueue.main.async { [weak self] in
      self?.scannerEventSink?(payload)
    }
  }

  func locationManager(_ manager: CLLocationManager, didDetermineState state: CLRegionState, for region: CLRegion) {
    guard let beaconRegion = region as? CLBeaconRegion else { return }

    if UIApplication.shared.applicationState != .active {
      requestExecutionTimeExtension()
    }

    switch state {
    case .inside:
      manager.startRangingBeacons(satisfying: beaconRegion.beaconIdentityConstraint)
    case .outside:
      manager.stopRangingBeacons(satisfying: beaconRegion.beaconIdentityConstraint)
    default:
      break
    }
  }

  func locationManager(
    _ manager: CLLocationManager,
    didFailRangingFor beaconConstraint: CLBeaconIdentityConstraint,
    error: Error
  ) {
    DispatchQueue.main.async { [weak self] in
      self?.scannerEventSink?(
        FlutterError(
          code: "RANGING_FAILED",
          message: error.localizedDescription,
          details: beaconConstraint.uuid.uuidString
        )
      )
    }
  }

  func locationManager(_ manager: CLLocationManager, monitoringDidFailFor region: CLRegion?, withError error: Error) {
    DispatchQueue.main.async { [weak self] in
      self?.scannerEventSink?(
        FlutterError(
          code: "MONITORING_FAILED",
          message: error.localizedDescription,
          details: region?.identifier
        )
      )
    }
  }
}
