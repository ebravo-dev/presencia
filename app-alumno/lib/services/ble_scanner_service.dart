import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Result of a beacon scan attempt
enum BeaconScanResult {
  detected,
  timeout,
  cooldown,
  bluetoothUnavailable,
  error,
}

/// BLE scanning service that routes everything through the native iOS
/// CBCentralManager via MethodChannel. No Flutter BLE plugins involved —
/// this avoids the dual-CBCentralManager conflict that kills background scanning.
class BleScannerService {
  static const String beaconName = 'ESP32-C3_BLE';

  static const _channel = MethodChannel('com.presencia.alumno/ble_background');

  final _statusController = StreamController<String>.broadcast();
  Stream<String> get statusStream => _statusController.stream;

  final _backgroundDetectionController =
      StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get backgroundDetectionStream =>
      _backgroundDetectionController.stream;

  Completer<BeaconScanResult>? _scanCompleter;

  BleScannerService() {
    _channel.setMethodCallHandler(_handleNativeCall);
    // Start continuous background scan immediately
    _startContinuousScan();
  }

  /// Start continuous background scan (never stops)
  Future<void> _startContinuousScan() async {
    try {
      await _channel.invokeMethod('startBackgroundScan');
      debugPrint('[BLE] ✅ Continuous native scan started');
    } catch (e) {
      debugPrint('[BLE] Native scan start failed: $e');
    }
  }

  /// Save matrícula to UserDefaults so native iOS can read it
  Future<void> setMatricula(String matricula) async {
    try {
      await _channel.invokeMethod('setMatricula', matricula);
    } catch (e) {
      debugPrint('[BLE] Error setting matricula: $e');
    }
  }

  /// Foreground scan with timeout — returns result
  Future<BeaconScanResult> scanForBeacon({
    Duration timeout = const Duration(seconds: 8),
  }) async {
    // Check bluetooth state
    try {
      final state = await _channel.invokeMethod('getBluetoothState');
      if (state != 'on') {
        _statusController.add('Bluetooth no disponible');
        return BeaconScanResult.bluetoothUnavailable;
      }
    } catch (e) {
      return BeaconScanResult.error;
    }

    _statusController.add('Escaneando...');
    _scanCompleter = Completer<BeaconScanResult>();

    try {
      await _channel.invokeMethod('startForegroundScan', {
        'timeout': timeout.inSeconds.toDouble(),
      });
    } catch (e) {
      _statusController.add('Error iniciando scan');
      return BeaconScanResult.error;
    }

    return _scanCompleter!.future;
  }

  /// Handle calls FROM native iOS
  Future<dynamic> _handleNativeCall(MethodCall call) async {
    switch (call.method) {
      case 'onScanResult':
        // Foreground scan result
        final args = Map<String, dynamic>.from(call.arguments as Map);
        final result = args['result'] as String;
        debugPrint('[BLE] Scan result: $result');

        switch (result) {
          case 'detected':
            _statusController.add('¡Beacon detectado!');
            _scanCompleter?.complete(BeaconScanResult.detected);
            break;
          case 'timeout':
            _statusController.add('Beacon no encontrado');
            _scanCompleter?.complete(BeaconScanResult.timeout);
            break;
          case 'cooldown':
            _statusController.add('Asistencia ya registrada recientemente');
            _scanCompleter?.complete(BeaconScanResult.cooldown);
            break;
          default:
            _scanCompleter?.complete(BeaconScanResult.error);
        }
        _scanCompleter = null;
        break;

      case 'onBeaconDetected':
        // Background detection notification
        final args = Map<String, dynamic>.from(call.arguments as Map);
        debugPrint('[BLE] 🔔 Background detection: $args');
        _statusController.add('¡Beacon detectado (background)!');
        _backgroundDetectionController.add(args);
        break;

      case 'onBluetoothStateChanged':
        final state = call.arguments as String;
        debugPrint('[BLE] Bluetooth state: $state');
        if (state == 'poweredOn') {
          _statusController.add('Bluetooth activado');
        } else if (state == 'poweredOff') {
          _statusController.add('Bluetooth desactivado');
        }
        break;
    }
    return null;
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

  Future<void> clearPendingDetections() async {
    try {
      await _channel.invokeMethod('clearPendingDetections');
    } catch (e) {
      debugPrint('[BLE] Error clearing: $e');
    }
  }

  void dispose() {
    _statusController.close();
    _backgroundDetectionController.close();
  }
}
