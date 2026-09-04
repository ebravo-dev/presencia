import 'dart:async';
import 'package:flutter/services.dart';

import '../models/attendance_confirmation.dart';
import 'student_logger.dart';

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
  Future<bool> startAdvertising({
    required String uuid,
    int major = 1,
    int minor = 1,
    int measuredPower = -59,
  }) async {
    try {
      final state = await _channel.invokeMethod('getBluetoothState');
      if (state != 'on') {
        _updateState(AdvertiserState.bluetoothOff);
        return false;
      }
      final result = await _channel.invokeMethod<bool>('startAdvertising', {
        'uuid': uuid,
        'major': major,
        'minor': minor,
        'measuredPower': measuredPower,
      });
      if (result != true) {
        _updateState(AdvertiserState.error);
        return false;
      }
      StudentLogger.info(
        'ble.advertising.start',
        'Iniciando transmisión del beacon de asistencia.',
      );
      if (_currentState == AdvertiserState.advertising) return true;
      if (_currentState == AdvertiserState.error ||
          _currentState == AdvertiserState.bluetoothOff) {
        return false;
      }

      final started = await stateStream
          .firstWhere(
            (state) =>
                state == AdvertiserState.advertising ||
                state == AdvertiserState.error ||
                state == AdvertiserState.bluetoothOff,
          )
          .timeout(
            const Duration(seconds: 5),
            onTimeout: () => AdvertiserState.error,
          );
      if (started == AdvertiserState.error) {
        _updateState(AdvertiserState.error);
      }
      return started == AdvertiserState.advertising;
    } catch (e, stackTrace) {
      StudentLogger.error(
        'ble.advertising.start_failed',
        'No se pudo iniciar la transmisión BLE.',
        error: e,
        stackTrace: stackTrace,
      );
      _updateState(AdvertiserState.error);
      return false;
    }
  }

  /// Stop advertising
  Future<void> stopAdvertising() async {
    try {
      await _channel.invokeMethod('stopAdvertising');
    } catch (e) {
      StudentLogger.warning(
        'ble.advertising.stop_failed',
        'No se pudo detener la transmisión BLE.',
        error: e,
      );
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
      StudentLogger.error(
        'ble.identity.sync_failed',
        'No se pudo sincronizar la identidad con el servicio BLE nativo.',
        error: e,
      );
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
        StudentLogger.debug(
          'ble.advertising.state_changed',
          'Cambió el estado de transmisión BLE.',
          context: {'isAdvertising': isAdvertising},
        );
        break;

      case 'onAdvertisingError':
        StudentLogger.error(
          'ble.advertising.native_error',
          'El servicio BLE nativo reportó un error.',
          error: call.arguments,
        );
        _updateState(AdvertiserState.error);
        break;

      case 'onBluetoothStateChanged':
        final state = call.arguments as String;
        StudentLogger.info(
          'ble.adapter.state_changed',
          'Cambió el estado del adaptador Bluetooth.',
          context: {'state': state},
        );
        if (state == 'poweredOn') {
          _updateState(AdvertiserState.idle);
        } else if (state == 'poweredOff') {
          _updateState(AdvertiserState.bluetoothOff);
        }
        break;

      case 'onAttendanceConfirmed':
        final message = call.arguments as String? ?? '';
        StudentLogger.info(
          'attendance.gatt.confirmed',
          'El profesor confirmó la asistencia por GATT.',
        );
        _confirmController.add(AttendanceConfirmation.fromGattMessage(message));
        break;

      case 'onBeaconDetected':
        StudentLogger.info(
          'attendance.beacon.detected_by_professor',
          'El profesor detectó el beacon de asistencia.',
        );
        break;
    }
    return null;
  }

  void dispose() {
    _stateController.close();
    _confirmController.close();
  }
}
