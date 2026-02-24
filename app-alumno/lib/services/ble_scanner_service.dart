import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:universal_ble/universal_ble.dart';

enum BeaconScanResult { detected, timeout, bluetoothUnavailable, error }

class BleScannerService {
  static const String beaconName = 'ESP32-C3_BLE';
  static const String beaconDeviceId = '327210EB-609B-A588-6399-92594A3A9F39';
  static const String serviceUuid = '12345678-1234-1234-1234-123456789abc';

  static const _channel = MethodChannel('com.presencia.alumno/ble_background');

  Completer<BeaconScanResult>? _completer;
  Timer? _timeoutTimer;
  bool _isScanning = false;

  final _statusController = StreamController<String>.broadcast();
  Stream<String> get statusStream => _statusController.stream;

  final _backgroundDetectionController =
      StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get backgroundDetectionStream =>
      _backgroundDetectionController.stream;

  bool get isScanning => _isScanning;

  BleScannerService() {
    _channel.setMethodCallHandler(_handleNativeCall);
    _startNativeBackgroundScan();
  }

  Future<void> _startNativeBackgroundScan() async {
    try {
      await _channel.invokeMethod('startBackgroundScan');
      debugPrint('[BLE] Native background scan started');
    } catch (e) {
      debugPrint('[BLE] Native background scan not available: $e');
    }
  }

  /// Get detections that happened while Flutter was suspended
  Future<List<Map<String, dynamic>>> getPendingNativeDetections() async {
    try {
      final result = await _channel.invokeMethod('getPendingDetections');
      if (result is List) {
        return result.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      }
    } catch (e) {
      debugPrint('[BLE] Error getting pending detections: $e');
    }
    return [];
  }

  /// Clear pending detections after processing
  Future<void> clearPendingDetections() async {
    try {
      await _channel.invokeMethod('clearPendingDetections');
    } catch (e) {
      debugPrint('[BLE] Error clearing pending detections: $e');
    }
  }

  Future<dynamic> _handleNativeCall(MethodCall call) async {
    if (call.method == 'onBeaconDetected') {
      final args = Map<String, dynamic>.from(call.arguments as Map);
      debugPrint('[BLE] 🔔 Background detection from native: $args');
      _statusController.add('¡Beacon detectado (background)!');
      _backgroundDetectionController.add(args);
    }
    return null;
  }

  Future<BeaconScanResult> scanForBeacon({
    Duration timeout = const Duration(seconds: 8),
  }) async {
    if (_isScanning) return BeaconScanResult.error;

    try {
      final state = await UniversalBle.getBluetoothAvailabilityState();
      if (state != AvailabilityState.poweredOn) {
        _statusController.add('Bluetooth no disponible');
        return BeaconScanResult.bluetoothUnavailable;
      }
    } catch (e) {
      return BeaconScanResult.error;
    }

    _isScanning = true;
    _completer = Completer<BeaconScanResult>();
    _statusController.add('Escaneando...');

    UniversalBle.onScanResult = _onScanResult;

    try {
      await UniversalBle.startScan(
        scanFilter: ScanFilter(withServices: [serviceUuid]),
      );
    } catch (e) {
      try {
        await UniversalBle.startScan();
      } catch (e2) {
        _isScanning = false;
        return BeaconScanResult.error;
      }
    }

    _timeoutTimer = Timer(timeout, () {
      _statusController.add('Tiempo agotado');
      _finishScan(BeaconScanResult.timeout);
    });

    return _completer!.future;
  }

  void _onScanResult(BleDevice device) {
    final name = device.name ?? '';
    final id = device.deviceId;

    if (name.isNotEmpty) {
      _statusController.add('Encontrado: $name');
    }

    if (name.toLowerCase() == beaconName.toLowerCase() ||
        id.toLowerCase() == beaconDeviceId.toLowerCase()) {
      debugPrint('[BLE] ✅ BEACON DETECTED: $name ($id)');
      _statusController.add('¡Beacon detectado!');
      _finishScan(BeaconScanResult.detected);
    }
  }

  void _finishScan(BeaconScanResult result) {
    _timeoutTimer?.cancel();
    _timeoutTimer = null;
    try {
      UniversalBle.stopScan();
    } catch (_) {}
    UniversalBle.onScanResult = null;
    _isScanning = false;
    if (_completer != null && !_completer!.isCompleted) {
      _completer!.complete(result);
    }
  }

  void cancelScan() => _finishScan(BeaconScanResult.timeout);

  void dispose() {
    cancelScan();
    _statusController.close();
    _backgroundDetectionController.close();
  }
}
