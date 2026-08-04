import CoreBluetooth
import Flutter
import UIKit

final class StudentAttendanceBlePlugin: NSObject, FlutterStreamHandler, CBCentralManagerDelegate, CBPeripheralDelegate {
  private let methodChannelName = "com.presencia/student_attendance_ble"
  private let eventChannelName = "com.presencia/student_attendance_ble_events"
  private let serviceUuid = CBUUID(string: "9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c1")
  private let attendanceUuidCharacteristicUuid = CBUUID(string: "9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c2")
  private let confirmationCharacteristicUuid = CBUUID(string: "9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c3")

  private var centralManager: CBCentralManager?
  private var eventSink: FlutterEventSink?
  private var targetUuids: Set<String> = []
  private var confirmationPayload: Data?
  private var handledUuids: Set<String> = []
  private var inFlightUuids: Set<String> = []
  private var peripherals: [UUID: CBPeripheral] = [:]
  private var rssiByPeripheral: [UUID: NSNumber] = [:]
  private var pendingDetections: [UUID: [String: Any]] = [:]
  private var pendingUuidByPeripheral: [UUID: String] = [:]
  private var pendingStartResult: FlutterResult?

  override init() {
    super.init()
    centralManager = CBCentralManager(delegate: self, queue: nil)
  }

  func register(with messenger: FlutterBinaryMessenger) {
    let methodChannel = FlutterMethodChannel(name: methodChannelName, binaryMessenger: messenger)
    methodChannel.setMethodCallHandler { [weak self] call, result in
      guard let self = self else {
        result(FlutterError(code: "UNAVAILABLE", message: "BLE no disponible", details: nil))
        return
      }
      DispatchQueue.main.async {
        self.handle(call, result: result)
      }
    }

    let eventChannel = FlutterEventChannel(name: eventChannelName, binaryMessenger: messenger)
    eventChannel.setStreamHandler(self)
  }

  func onListen(withArguments arguments: Any?, eventSink events: @escaping FlutterEventSink) -> FlutterError? {
    eventSink = events
    return nil
  }

  func onCancel(withArguments arguments: Any?) -> FlutterError? {
    eventSink = nil
    return nil
  }

  private func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    switch call.method {
    case "startScanning":
      guard let args = call.arguments as? [String: Any],
            let uuids = args["uuids"] as? [String],
            !uuids.isEmpty,
            let payload = args["confirmationPayload"] as? String,
            let payloadData = payload.data(using: .utf8),
            !payloadData.isEmpty
      else {
        result(FlutterError(code: "INVALID_ARGUMENT", message: "Se requieren UUIDs y contexto de clase", details: nil))
        return
      }
      startScanning(uuids: uuids, confirmationPayload: payloadData, result: result)

    case "stopScanning":
      stopScanning()
      result(true)

    default:
      result(FlutterMethodNotImplemented)
    }
  }

  private func startScanning(
    uuids: [String],
    confirmationPayload: Data,
    result: @escaping FlutterResult
  ) {
    targetUuids = Set(uuids.map(normalizeUuid).filter { !$0.isEmpty })
    self.confirmationPayload = confirmationPayload
    handledUuids.removeAll()
    inFlightUuids.removeAll()
    pendingDetections.removeAll()
    pendingUuidByPeripheral.removeAll()
    guard !targetUuids.isEmpty else {
      result(FlutterError(code: "INVALID_UUID", message: "UUIDs invalidos", details: nil))
      return
    }

    guard let manager = centralManager else {
      result(FlutterError(code: "UNAVAILABLE", message: "BLE no disponible", details: nil))
      return
    }

    if manager.state != .poweredOn {
      pendingStartResult = result
      return
    }

    manager.scanForPeripherals(
      withServices: [serviceUuid],
      options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
    )
    result(true)
  }

  private func stopScanning() {
    centralManager?.stopScan()
    for peripheral in peripherals.values {
      centralManager?.cancelPeripheralConnection(peripheral)
    }
    peripherals.removeAll()
    rssiByPeripheral.removeAll()
    pendingDetections.removeAll()
    pendingUuidByPeripheral.removeAll()
    inFlightUuids.removeAll()
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    guard let result = pendingStartResult else { return }
    pendingStartResult = nil
    if central.state == .poweredOn {
      central.scanForPeripherals(
        withServices: [serviceUuid],
        options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
      )
      result(true)
    } else {
      result(FlutterError(code: "BLUETOOTH_OFF", message: "Bluetooth no disponible", details: nil))
    }
  }

  func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    if peripherals[peripheral.identifier] != nil { return }
    peripherals[peripheral.identifier] = peripheral
    rssiByPeripheral[peripheral.identifier] = RSSI
    peripheral.delegate = self
    central.connect(peripheral, options: nil)
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    peripheral.discoverServices([serviceUuid])
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    guard let service = peripheral.services?.first(where: { $0.uuid == serviceUuid }) else {
      centralManager?.cancelPeripheralConnection(peripheral)
      return
    }
    peripheral.discoverCharacteristics(
      [attendanceUuidCharacteristicUuid, confirmationCharacteristicUuid],
      for: service
    )
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    guard let characteristic = service.characteristics?.first(where: { $0.uuid == attendanceUuidCharacteristicUuid }) else {
      centralManager?.cancelPeripheralConnection(peripheral)
      return
    }
    peripheral.readValue(for: characteristic)
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    guard characteristic.uuid == attendanceUuidCharacteristicUuid,
          let value = characteristic.value,
          let uuid = String(data: value, encoding: .utf8)
    else {
      centralManager?.cancelPeripheralConnection(peripheral)
      return
    }

    let normalized = normalizeUuid(uuid)
    guard targetUuids.contains(normalized),
          !handledUuids.contains(normalized),
          !inFlightUuids.contains(normalized)
    else {
      centralManager?.cancelPeripheralConnection(peripheral)
      return
    }
    inFlightUuids.insert(normalized)

    if let service = peripheral.services?.first(where: { $0.uuid == serviceUuid }),
       let confirmation = service.characteristics?.first(where: { $0.uuid == confirmationCharacteristicUuid }),
       let data = confirmationPayload,
       data.count <= peripheral.maximumWriteValueLength(for: .withResponse) {
      var payload: [String: Any] = [
        "uuid": uuid,
        "bluetoothAddress": peripheral.identifier.uuidString,
      ]
      if let rssi = rssiByPeripheral[peripheral.identifier]?.intValue {
        payload["rssi"] = rssi
      }
      pendingDetections[peripheral.identifier] = payload
      pendingUuidByPeripheral[peripheral.identifier] = normalized
      peripheral.writeValue(data, for: confirmation, type: .withResponse)
    } else {
      inFlightUuids.remove(normalized)
      centralManager?.cancelPeripheralConnection(peripheral)
    }
  }

  func peripheral(
    _ peripheral: CBPeripheral,
    didWriteValueFor characteristic: CBCharacteristic,
    error: Error?
  ) {
    guard characteristic.uuid == confirmationCharacteristicUuid else { return }

    let normalized = pendingUuidByPeripheral.removeValue(forKey: peripheral.identifier)
    let payload = pendingDetections.removeValue(forKey: peripheral.identifier)
    if let normalized = normalized {
      inFlightUuids.remove(normalized)
      if error == nil {
        handledUuids.insert(normalized)
      }
    }
    if error == nil, let payload = payload {
      eventSink?([payload])
    }
    centralManager?.cancelPeripheralConnection(peripheral)
  }

  func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    cleanup(peripheral)
  }

  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    cleanup(peripheral)
  }

  private func cleanup(_ peripheral: CBPeripheral) {
    peripherals.removeValue(forKey: peripheral.identifier)
    rssiByPeripheral.removeValue(forKey: peripheral.identifier)
    pendingDetections.removeValue(forKey: peripheral.identifier)
    if let normalized = pendingUuidByPeripheral.removeValue(forKey: peripheral.identifier) {
      inFlightUuids.remove(normalized)
    }
  }

  private func normalizeUuid(_ uuid: String) -> String {
    uuid.replacingOccurrences(of: "-", with: "").lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
  }
}
