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
  private var handledUuids: Set<String> = []
  private var peripherals: [UUID: CBPeripheral] = [:]
  private var rssiByPeripheral: [UUID: NSNumber] = [:]
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
            !uuids.isEmpty
      else {
        result(FlutterError(code: "INVALID_ARGUMENT", message: "Se requiere al menos un UUID", details: nil))
        return
      }
      startScanning(uuids: uuids, result: result)

    case "stopScanning":
      stopScanning()
      result(true)

    default:
      result(FlutterMethodNotImplemented)
    }
  }

  private func startScanning(uuids: [String], result: @escaping FlutterResult) {
    targetUuids = Set(uuids.map(normalizeUuid).filter { !$0.isEmpty })
    handledUuids.removeAll()
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
    guard targetUuids.contains(normalized), !handledUuids.contains(normalized) else {
      centralManager?.cancelPeripheralConnection(peripheral)
      return
    }
    handledUuids.insert(normalized)

    if let service = peripheral.services?.first(where: { $0.uuid == serviceUuid }),
       let confirmation = service.characteristics?.first(where: { $0.uuid == confirmationCharacteristicUuid }),
       let data = "CONFIRMED".data(using: .utf8) {
      peripheral.writeValue(data, for: confirmation, type: .withResponse)
    }

    var payload: [String: Any] = [
      "uuid": uuid,
      "bluetoothAddress": peripheral.identifier.uuidString,
    ]
    if let rssi = rssiByPeripheral[peripheral.identifier]?.intValue {
      payload["rssi"] = rssi
    }
    eventSink?([payload])

    DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self, weak peripheral] in
      guard let peripheral = peripheral else { return }
      self?.centralManager?.cancelPeripheralConnection(peripheral)
    }
  }

  private func normalizeUuid(_ uuid: String) -> String {
    uuid.replacingOccurrences(of: "-", with: "").lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
  }
}
