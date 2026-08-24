import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:permission_handler/permission_handler.dart';

import 'ble_advertiser_service.dart';
import 'local_storage_service.dart';
import 'native_altbeacon_channel.dart';

enum AttendanceSessionState {
  idle,
  checkingRoom,
  roomVerified,
  broadcasting,
  bluetoothOff,
  missingRoomBeacon,
  roomNotFound,
  error,
}

class AttendanceSessionSnapshot {
  final AttendanceSessionState state;
  final AltBeaconDetection? roomDetection;
  final String? message;

  const AttendanceSessionSnapshot({
    required this.state,
    this.roomDetection,
    this.message,
  });
}

class AttendanceSessionService {
  AttendanceSessionService({
    required LocalStorageService storage,
    required BleAdvertiserService advertiser,
    NativeAltBeaconChannel? beacons,
  }) : _storage = storage,
       _advertiser = advertiser,
       _beacons = beacons ?? NativeAltBeaconChannel();

  static const Duration roomScanTimeout = Duration(seconds: 12);

  final LocalStorageService _storage;
  final BleAdvertiserService _advertiser;
  final NativeAltBeaconChannel _beacons;

  final _stateController =
      StreamController<AttendanceSessionSnapshot>.broadcast();

  Stream<AttendanceSessionSnapshot> get stateStream => _stateController.stream;

  StreamSubscription<List<AltBeaconDetection>>? _roomScanSubscription;
  Timer? _roomScanTimer;
  AttendanceSessionState _currentState = AttendanceSessionState.idle;

  AttendanceSessionState get currentState => _currentState;

  Future<void> start() async {
    if (_currentState == AttendanceSessionState.checkingRoom ||
        _currentState == AttendanceSessionState.broadcasting) {
      return;
    }

    final classroomUuid = _storage.classroomBeaconUuid.trim();
    final attendanceUuid = _storage.attendanceUuid.trim();

    if (attendanceUuid.isEmpty) {
      _emit(
        AttendanceSessionState.error,
        message: 'No pudimos preparar el pase de lista.',
      );
      return;
    }

    final permissionsReady = await _requestRuntimePermissions(
      requiresRoomScan: classroomUuid.isNotEmpty,
    );
    if (!permissionsReady) {
      _emit(
        AttendanceSessionState.error,
        message: 'Permite el acceso necesario para pasar lista.',
      );
      return;
    }

    final bluetoothReady = await _beacons.isBluetoothAvailable();
    if (!bluetoothReady) {
      _emit(
        AttendanceSessionState.bluetoothOff,
        message: 'Revisa la configuración de tu celular.',
      );
      return;
    }

    await _stopRoomScanOnly();

    if (classroomUuid.isEmpty) {
      await _advertiser.startAdvertising(uuid: attendanceUuid);
      _emit(AttendanceSessionState.broadcasting);
      return;
    }

    _emit(AttendanceSessionState.checkingRoom);

    _roomScanSubscription = _beacons.detectionsStream.listen(
      (detections) async {
        AltBeaconDetection? match;
        for (final detection in detections) {
          if (_sameUuid(detection.uuid, classroomUuid)) {
            match = detection;
            break;
          }
        }

        if (match == null) return;

        await _stopRoomScanOnly();
        _emit(AttendanceSessionState.roomVerified, roomDetection: match);
        await _advertiser.startAdvertising(uuid: attendanceUuid);
        _emit(AttendanceSessionState.broadcasting, roomDetection: match);
      },
      onError: (Object error) {
        debugPrint('[AttendanceSession] Room scan error: $error');
        _emit(
          AttendanceSessionState.error,
          message: 'No pudimos preparar el pase de lista.',
        );
      },
    );

    try {
      final scanStarted = await _beacons.startScanning(uuids: [classroomUuid]);
      if (!scanStarted) {
        await _stopRoomScanOnly();
        _emit(
          AttendanceSessionState.error,
          message: 'Permite la ubicación para confirmar que estás en clase.',
        );
        return;
      }
    } catch (error) {
      debugPrint('[AttendanceSession] Could not start room scan: $error');
      await _stopRoomScanOnly();
      _emit(
        AttendanceSessionState.error,
        message: _roomScanErrorMessage(error),
      );
      return;
    }

    _roomScanTimer = Timer(roomScanTimeout, () async {
      if (_currentState != AttendanceSessionState.checkingRoom) return;
      await _stopRoomScanOnly();
      _emit(
        AttendanceSessionState.roomNotFound,
        message: 'No pudimos confirmar que estás en clase.',
      );
    });
  }

  Future<void> stop() async {
    await _stopRoomScanOnly();
    await _advertiser.stopAdvertising();
    _emit(AttendanceSessionState.idle);
  }

  Future<void> _stopRoomScanOnly() async {
    _roomScanTimer?.cancel();
    _roomScanTimer = null;
    await _roomScanSubscription?.cancel();
    _roomScanSubscription = null;
    await _beacons.stopScanning();
  }

  void _emit(
    AttendanceSessionState state, {
    AltBeaconDetection? roomDetection,
    String? message,
  }) {
    _currentState = state;
    _stateController.add(
      AttendanceSessionSnapshot(
        state: state,
        roomDetection: roomDetection,
        message: message,
      ),
    );
  }

  bool _sameUuid(String left, String right) {
    return _normalizeUuid(left) == _normalizeUuid(right);
  }

  String _normalizeUuid(String uuid) {
    return uuid.replaceAll('-', '').toLowerCase().trim();
  }

  Future<bool> _requestRuntimePermissions({
    required bool requiresRoomScan,
  }) async {
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        final permissions = <Permission>[
          Permission.bluetoothScan,
          Permission.bluetoothAdvertise,
          Permission.bluetoothConnect,
          Permission.locationWhenInUse,
          Permission.notification,
        ];
        final results = await permissions.request();
        return results.entries.every((entry) {
          if (entry.key == Permission.notification) {
            return entry.value.isGranted || entry.value.isLimited;
          }
          return entry.value.isGranted || entry.value.isLimited;
        });
      case TargetPlatform.iOS:
        return !requiresRoomScan || await _beacons.requestPermissions();
      default:
        return true;
    }
  }

  String _roomScanErrorMessage(Object error) {
    final text = error.toString();
    if (text.contains('PERMISSION_DENIED')) {
      return 'Permite la ubicación para confirmar que estás en clase.';
    }
    if (text.contains('UNSUPPORTED')) {
      return 'Este iPhone no es compatible con el registro automático de asistencia.';
    }
    return 'No pudimos preparar el pase de lista.';
  }

  void dispose() {
    _roomScanTimer?.cancel();
    _roomScanSubscription?.cancel();
    _stateController.close();
  }
}
