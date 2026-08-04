import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../models/attendance_confirmation.dart';

/// State of the BLE advertiser
enum AdvertiserState { idle, advertising, bluetoothOff, error }

/// BLE Advertiser service that routes through native MethodChannel.
/// The student app exposes a local BLE peripheral that the professor connects
/// to in order to confirm attendance without requiring internet on the student
/// device.
class BleAdvertiserService {
  static const _channel = MethodChannel('com.presencia.alumno/ble_advertiser');

  final _stateController = StreamController<AdvertiserState>.broadcast();
  Stream<AdvertiserState> get stateStream => _stateController.stream;

  final _confirmController =
      StreamController<AttendanceConfirmation>.broadcast();
  Stream<AttendanceConfirmation> get confirmationStream =>
      _confirmController.stream;

  AdvertiserState _currentState = AdvertiserState.idle;
  AdvertiserState get currentState => _currentState;

  BleAdvertiserService() {
    _channel.setMethodCallHandler(_handleNativeCall);
  }

  /// Start iBeacon advertising with the UUID associated to this student.
  Future<void> startAdvertising({
    required String uuid,
    int major = 1,
    int minor = 1,
    int measuredPower = -59,
  }) async {
    try {
      final state = await _channel.invokeMethod('getBluetoothState');
      if (state != 'on') {
        _updateState(AdvertiserState.bluetoothOff);
        return;
      }
      await _channel.invokeMethod('startAdvertising', {
        'uuid': uuid,
        'major': major,
        'minor': minor,
        'measuredPower': measuredPower,
      });
      debugPrint('[BLE] Starting attendance beacon...');
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

  /// Save student identity to native storage so background services can read it.
  Future<void> setStudentIdentity({
    required String matricula,
    required String attendanceUuid,
    String? deviceBindingId,
  }) async {
    try {
      await _channel.invokeMethod('setStudentIdentity', {
        'matricula': matricula,
        'attendanceUuid': attendanceUuid,
        'deviceBindingId': ?deviceBindingId,
      });
    } catch (e) {
      debugPrint('[BLE] Error setting student identity: $e');
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
        debugPrint('[BLE] Attendance confirmed: $message');
        _confirmController.add(AttendanceConfirmation.fromGattMessage(message));
        break;

      case 'onBeaconDetected':
        debugPrint('[BLE] Attendance beacon was detected by professor');
        break;
    }
    return null;
  }

  void dispose() {
    _stateController.close();
    _confirmController.close();
  }
}
