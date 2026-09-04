import CoreLocation
import Flutter
import UIKit

final class IosBeaconPlugin: NSObject, FlutterStreamHandler, CLLocationManagerDelegate {
  private let methodChannelName = "com.presencia/altbeacon"
  private let eventChannelName = "com.presencia/altbeacon_events"
  private let maxMonitoredRegions = 20

  private var locationManager: CLLocationManager?
  private var eventSink: FlutterEventSink?
  private var activeConstraints: [String: CLBeaconIdentityConstraint] = [:]
  private var monitoredRegions: [String: CLBeaconRegion] = [:]
  private var backgroundTaskIdentifier: UIBackgroundTaskIdentifier = .invalid
  private var pendingLocationPermissionResults: [FlutterResult] = []

  override init() {
    super.init()
    DispatchQueue.main.async {
      self.configureLocationManager()
    }
  }

  func register(with messenger: FlutterBinaryMessenger) {
    let methodChannel = FlutterMethodChannel(
      name: methodChannelName,
      binaryMessenger: messenger
    )
    methodChannel.setMethodCallHandler { [weak self] call, result in
      guard let self = self else {
        result(FlutterError(code: "UNAVAILABLE", message: "Plugin no disponible", details: nil))
        return
      }

      if Thread.isMainThread {
        self.handle(call, result: result)
      } else {
        DispatchQueue.main.async {
          self.handle(call, result: result)
        }
      }
    }

    let eventChannel = FlutterEventChannel(
      name: eventChannelName,
      binaryMessenger: messenger
    )
    eventChannel.setStreamHandler(self)
  }

  private func configureLocationManager() {
    if locationManager != nil { return }

    let manager = CLLocationManager()
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyBest
    manager.pausesLocationUpdatesAutomatically = false
    locationManager = manager
  }

  private func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    configureLocationManager()

    switch call.method {
    case "checkBluetoothState":
      result(currentBeaconState())

    case "checkLocationServices":
      result(CLLocationManager.locationServicesEnabled())

    case "checkLocationPermission":
      guard let manager = locationManager else {
        result("unknown")
        return
      }
      result(locationAuthorizationName(authorizationStatus(for: manager)))

    case "requestLocationPermission", "requestPermissions":
      requestLocationPermission(result: result)

    case "startScanning":
      guard let args = call.arguments as? [String: Any] else {
        result(FlutterError(code: "INVALID_ARGUMENT", message: "Argumentos invalidos", details: nil))
        return
      }

      let singleUuid = args["uuid"] as? String
      let uuidStrings = args["uuids"] as? [String] ?? singleUuid.map { [$0] } ?? []
      startScanning(uuidStrings: uuidStrings, result: result)

    case "stopScanning":
      stopScanning(result: result)

    default:
      result(FlutterMethodNotImplemented)
    }
  }

  func onListen(withArguments arguments: Any?, eventSink events: @escaping FlutterEventSink)
    -> FlutterError?
  {
    eventSink = events
    return nil
  }

  func onCancel(withArguments arguments: Any?) -> FlutterError? {
    eventSink = nil
    return nil
  }

  private func currentBeaconState() -> String {
    guard CLLocationManager.isRangingAvailable() else {
      return "unsupported"
    }
    return CLLocationManager.locationServicesEnabled() ? "poweredOn" : "poweredOff"
  }

  private func requestLocationPermission(result: @escaping FlutterResult) {
    guard let manager = locationManager else {
      result("unknown")
      return
    }

    let status = authorizationStatus(for: manager)
    if status == .notDetermined {
      pendingLocationPermissionResults.append(result)
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
      manager.requestAlwaysAuthorization()
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

    for (index, uuidString) in uniqueUuids.enumerated() {
      guard let uuid = UUID(uuidString: uuidString) else {
        result(FlutterError(code: "INVALID_UUID", message: "UUID invalido: \(uuidString)", details: nil))
        stopScanning(result: nil)
        return
      }

      let constraint = CLBeaconIdentityConstraint(uuid: uuid)
      let identifier = uuid.uuidString
      activeConstraints[identifier] = constraint
      manager.startRangingBeacons(satisfying: constraint)

      if index < maxMonitoredRegions {
        let region = CLBeaconRegion(beaconIdentityConstraint: constraint, identifier: identifier)
        region.notifyOnEntry = true
        region.notifyOnExit = true
        region.notifyEntryStateOnDisplay = true
        monitoredRegions[identifier] = region
        manager.startMonitoring(for: region)
        manager.requestState(for: region)
      }
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
          "distance": beacon.accuracy,
        ]
      }

    guard !payload.isEmpty else { return }

    DispatchQueue.main.async { [weak self] in
      self?.eventSink?(payload)
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
      self?.eventSink?(
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
      self?.eventSink?(
        FlutterError(
          code: "MONITORING_FAILED",
          message: error.localizedDescription,
          details: region?.identifier
        )
      )
    }
  }

  private func authorizationStatus(for manager: CLLocationManager) -> CLAuthorizationStatus {
    if #available(iOS 14.0, *) {
      return manager.authorizationStatus
    }
    return CLLocationManager.authorizationStatus()
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    let status = authorizationStatus(for: manager)
    guard status != .notDetermined, !pendingLocationPermissionResults.isEmpty else {
      return
    }
    let results = pendingLocationPermissionResults
    pendingLocationPermissionResults.removeAll()
    let permission = locationAuthorizationName(status)
    results.forEach { $0(permission) }
  }

  private func requestExecutionTimeExtension() {
    guard backgroundTaskIdentifier == .invalid else { return }

    backgroundTaskIdentifier = UIApplication.shared.beginBackgroundTask(
      withName: "BeaconRangingExtension"
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
