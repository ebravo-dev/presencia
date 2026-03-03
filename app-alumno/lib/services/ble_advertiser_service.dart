import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// State of the BLE advertiser
enum AdvertiserState {
  idle,
  advertising,
  bluetoothOff,
  error,
}

/// BLE Advertiser service that routes through native MethodChannel.
/// The student app acts as a BLE peripheral (GATT server) that advertises
/// its service UUID. The professor app scans, connects, and reads the matrícula.
class BleAdvertiserService {
  static const _channel = MethodChannel('com.presencia.alumno/ble_advertiser');

  final _stateController = StreamController<AdvertiserState>.broadcast();
  Stream<AdvertiserState> get stateStream => _stateController.stream;

  final _confirmController = StreamController<String>.broadcast();
  Stream<String> get confirmationStream => _confirmController.stream;

  AdvertiserState _currentState = AdvertiserState.idle;
  AdvertiserState get currentState => _currentState;

  BleAdvertiserService() {
    _channel.setMethodCallHandler(_handleNativeCall);
  }

  /// Start BLE advertising + GATT server
  Future<void> startAdvertising() async {
    try {
      final state = await _channel.invokeMethod('getBluetoothState');
      if (state != 'on') {
        _updateState(AdvertiserState.bluetoothOff);
        return;
      }
      await _channel.invokeMethod('startAdvertising');
      debugPrint('[BLE] Starting advertising...');
    } catch (e) {
      debugPrint('[BLE] Error starting advertising: $e');
      _updateState(AdvertiserState.error);
    }
  }

  /// Stop advertising
  Future<void> stopAdvertising() async {
    try {
      await _channel.invokeMethod('stopAdvertising');
    } catch (e) {
      debugPrint('[BLE] Error stopping advertising: $e');
    }
  }

  /// Save matrícula to native storage so GATT server can serve it
  Future<void> setMatricula(String matricula) async {
    try {
      await _channel.invokeMethod('setMatricula', matricula);
    } catch (e) {
      debugPrint('[BLE] Error setting matrícula: $e');
    }
  }

  /// Get current bluetooth state
  Future<String> getBluetoothState() async {
    try {
      return await _channel.invokeMethod('getBluetoothState') ?? 'off';
    } catch (e) {
      return 'off';
    }
  }

  void _updateState(AdvertiserState state) {
    _currentState = state;
    _stateController.add(state);
  }

  /// Handle calls FROM native
  Future<dynamic> _handleNativeCall(MethodCall call) async {
    switch (call.method) {
      case 'onAdvertisingStateChanged':
        final isAdvertising = call.arguments as bool? ?? false;
        _updateState(
          isAdvertising ? AdvertiserState.advertising : AdvertiserState.idle,
        );
        debugPrint('[BLE] Advertising state: $isAdvertising');
        break;

      case 'onBluetoothStateChanged':
        final state = call.arguments as String;
        debugPrint('[BLE] Bluetooth state: $state');
        if (state == 'poweredOn') {
          _updateState(AdvertiserState.idle);
        } else if (state == 'poweredOff') {
          _updateState(AdvertiserState.bluetoothOff);
        }
        break;

      case 'onAttendanceConfirmed':
        final message = call.arguments as String? ?? '';
        debugPrint('[BLE] ✅ Attendance confirmed: $message');
        _confirmController.add(message);
        break;

      case 'onMatriculaRead':
        debugPrint('[BLE] 📖 Matrícula was read by professor');
        break;
    }
    return null;
  }

  void dispose() {
    _stateController.close();
    _confirmController.close();
  }
}
