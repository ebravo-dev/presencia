import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:universal_ble/universal_ble.dart';

/// Result of a beacon scan attempt
enum BeaconScanResult { detected, timeout, bluetoothUnavailable, error }

/// Service that scans for the ESP32-C3_BLE beacon in the classroom.
/// Also listens for native iOS background detection via method channel.
class BleScannerService {
  // ── Hardcoded beacon config (same as app-profesor) ──────────
  static const String beaconName = 'ESP32-C3_BLE';
  static const String beaconDeviceId = '327210EB-609B-A588-6399-92594A3A9F39';
  static const String serviceUuid = '12345678-1234-1234-1234-123456789abc';

  // Native method channel for iOS background BLE
  static const _channel = MethodChannel('com.presencia.alumno/ble_background');

  Completer<BeaconScanResult>? _completer;
  Timer? _timeoutTimer;
  bool _isScanning = false;

  final _statusController = StreamController<String>.broadcast();
  Stream<String> get statusStream => _statusController.stream;

  // Stream for background detections (from native iOS)
  final _backgroundDetectionController =
      StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get backgroundDetectionStream =>
      _backgroundDetectionController.stream;

  bool get isScanning => _isScanning;

  BleScannerService() {
    // Listen for native iOS background beacon detections
    _channel.setMethodCallHandler(_handleNativeCall);
    // Tell native side to start background scanning
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

  Future<dynamic> _handleNativeCall(MethodCall call) async {
    if (call.method == 'onBeaconDetected') {
      final args = Map<String, dynamic>.from(call.arguments as Map);
      debugPrint('[BLE] 🔔 Background detection from native: $args');
      _statusController.add('¡Beacon detectado (background)!');
      _backgroundDetectionController.add(args);
    }
    return null;
  }

  /// Scan for the beacon (foreground). Returns result after detection or timeout.
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
      debugPrint('[BLE] Error starting scan with filter: $e');
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

    final nameMatch = name.toLowerCase() == beaconName.toLowerCase();
    final idMatch = id.toLowerCase() == beaconDeviceId.toLowerCase();

    if (nameMatch || idMatch) {
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
