import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:permission_handler/permission_handler.dart';

import 'ble_advertiser_service.dart';
import 'local_storage_service.dart';
import 'native_altbeacon_channel.dart';
import 'student_logger.dart';

enum AttendanceSessionState {
  idle,
  permissionRequired,
  permissionDenied,
  locationServicesOff,
  checkingRoom,
  roomVerified,
  broadcasting,
  bluetoothOff,
  bluetoothUnsupported,
  missingRoomBeacon,
  roomNotFound,
  error,
}

enum AttendanceRequirementAction {
  requestPermissions,
  openAppSettings,
  openBluetoothSettings,
  openLocationSettings,
}

class AttendanceSessionSnapshot {
  final AttendanceSessionState state;
  final AltBeaconDetection? roomDetection;
  final String? message;
  final AttendanceRequirementAction? action;

  const AttendanceSessionSnapshot({
    required this.state,
    this.roomDetection,
    this.message,
    this.action,
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
  int _sessionGeneration = 0;

  AttendanceSessionState get currentState => _currentState;

  Future<void> start({bool requestPermissions = false}) async {
    if (_currentState == AttendanceSessionState.checkingRoom ||
        _currentState == AttendanceSessionState.broadcasting) {
      return;
    }
    final generation = ++_sessionGeneration;

    final classroomUuid = _storage.classroomBeaconUuid.trim();
    final attendanceUuid = _storage.attendanceUuid.trim();

    if (attendanceUuid.isEmpty) {
      _emit(
        AttendanceSessionState.error,
        message: 'No pudimos preparar el pase de lista.',
      );
      return;
    }

    late final _RuntimePermissionResult permissionResult;
    try {
      permissionResult = await _checkRuntimePermissions(
        requiresRoomScan: classroomUuid.isNotEmpty,
        requestPermissions: requestPermissions,
      );
    } catch (error, stackTrace) {
      StudentLogger.error(
        'attendance.requirements.permission_check_failed',
        'No se pudieron comprobar los permisos del teléfono.',
        error: error,
        stackTrace: stackTrace,
      );
      if (generation == _sessionGeneration) {
        _emit(
          AttendanceSessionState.error,
          message:
              'No pudimos comprobar los permisos del teléfono. Inténtalo de nuevo.',
        );
      }
      return;
    }
    if (generation != _sessionGeneration) return;
    if (!permissionResult.granted) {
      _emit(
        permissionResult.permanentlyDenied
            ? AttendanceSessionState.permissionDenied
            : AttendanceSessionState.permissionRequired,
        message: permissionResult.permanentlyDenied
            ? 'El acceso a dispositivos cercanos está bloqueado. Actívalo desde Configuración para registrar tu asistencia.'
            : 'Permite el acceso a dispositivos cercanos${classroomUuid.isNotEmpty ? ' y a tu ubicación' : ''} para registrar tu asistencia.',
        action: permissionResult.permanentlyDenied
            ? AttendanceRequirementAction.openAppSettings
            : AttendanceRequirementAction.requestPermissions,
      );
      return;
    }

    final bluetoothAvailability = await _beacons.getBluetoothAvailability();
    if (generation != _sessionGeneration) return;
    if (bluetoothAvailability == BluetoothAvailability.poweredOff) {
      _emit(
        AttendanceSessionState.bluetoothOff,
        message:
            'Bluetooth está apagado. Enciéndelo para buscar el salón y registrar tu asistencia.',
        action: AttendanceRequirementAction.openBluetoothSettings,
      );
      return;
    }
    if (bluetoothAvailability == BluetoothAvailability.unsupported) {
      _emit(
        AttendanceSessionState.bluetoothUnsupported,
        message:
            'Este teléfono no es compatible con el registro de asistencia por Bluetooth.',
      );
      return;
    }
    if (bluetoothAvailability == BluetoothAvailability.unauthorized) {
      _emit(
        AttendanceSessionState.permissionDenied,
        message:
            'Bluetooth no está autorizado para esta app. Actívalo desde Configuración.',
        action: AttendanceRequirementAction.openAppSettings,
      );
      return;
    }
    if (bluetoothAvailability != BluetoothAvailability.poweredOn) {
      _emit(
        AttendanceSessionState.error,
        message:
            'No pudimos comprobar el estado de Bluetooth. Inténtalo de nuevo.',
      );
      return;
    }

    final requiresLocationService = await _requiresLocationService(
      classroomUuid.isNotEmpty,
    );
    if (generation != _sessionGeneration) return;
    if (requiresLocationService && !await _beacons.isLocationServiceEnabled()) {
      if (generation != _sessionGeneration) return;
      _emit(
        AttendanceSessionState.locationServicesOff,
        message:
            'La ubicación del teléfono está desactivada. Enciéndela para detectar el beacon del salón.',
        action: AttendanceRequirementAction.openLocationSettings,
      );
      return;
    }

    await _stopRoomScanOnly();
    if (generation != _sessionGeneration) return;

    if (classroomUuid.isEmpty) {
      final started = await _advertiser.startAdvertising(uuid: attendanceUuid);
      if (generation != _sessionGeneration) {
        if (started) await _advertiser.stopAdvertising();
        return;
      }
      if (!started) {
        _emit(
          AttendanceSessionState.error,
          message: 'No pudimos activar la transmisión Bluetooth.',
        );
        return;
      }
      _emit(AttendanceSessionState.broadcasting);
      return;
    }

    _emit(AttendanceSessionState.checkingRoom);

    _roomScanSubscription = _beacons.detectionsStream.listen(
      (detections) async {
        if (generation != _sessionGeneration ||
            _currentState != AttendanceSessionState.checkingRoom) {
          return;
        }
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
        final started = await _advertiser.startAdvertising(
          uuid: attendanceUuid,
        );
        if (generation != _sessionGeneration) {
          if (started) await _advertiser.stopAdvertising();
          return;
        }
        if (!started) {
          _emit(
            AttendanceSessionState.error,
            roomDetection: match,
            message: 'No pudimos activar la transmisión Bluetooth.',
          );
          return;
        }
        _emit(AttendanceSessionState.broadcasting, roomDetection: match);
      },
      onError: (Object error) {
        if (generation != _sessionGeneration) return;
        StudentLogger.error(
          'attendance.room_scan.stream_error',
          'Falló el flujo de detección del aula.',
          error: error,
        );
        _emit(
          AttendanceSessionState.error,
          message: 'No pudimos preparar el pase de lista.',
        );
      },
    );

    try {
      final scanStarted = await _beacons.startScanning(uuids: [classroomUuid]);
      if (generation != _sessionGeneration) {
        if (scanStarted) await _stopRoomScanOnly();
        return;
      }
      if (!scanStarted) {
        await _stopRoomScanOnly();
        _emit(
          AttendanceSessionState.error,
          message: 'Permite la ubicación para confirmar que estás en clase.',
        );
        return;
      }
    } catch (error, stackTrace) {
      StudentLogger.error(
        'attendance.room_scan.start_failed',
        'No se pudo iniciar la detección del aula.',
        error: error,
        stackTrace: stackTrace,
      );
      await _stopRoomScanOnly();
      _emit(
        AttendanceSessionState.error,
        message: _roomScanErrorMessage(error),
      );
      return;
    }

    _roomScanTimer = Timer(roomScanTimeout, () async {
      if (generation != _sessionGeneration ||
          _currentState != AttendanceSessionState.checkingRoom) {
        return;
      }
      await _stopRoomScanOnly();
      _emit(
        AttendanceSessionState.roomNotFound,
        message: 'No pudimos confirmar que estás en clase.',
      );
    });
  }

  Future<void> stop() async {
    _sessionGeneration++;
    await _stopRoomScanOnly();
    await _advertiser.stopAdvertising();
    _emit(AttendanceSessionState.idle);
  }

  Future<void> performRequirementAction(
    AttendanceRequirementAction action,
  ) async {
    switch (action) {
      case AttendanceRequirementAction.requestPermissions:
        await start(requestPermissions: true);
        return;
      case AttendanceRequirementAction.openAppSettings:
        await openAppSettings();
        return;
      case AttendanceRequirementAction.openBluetoothSettings:
        await _beacons.openBluetoothSettings();
        return;
      case AttendanceRequirementAction.openLocationSettings:
        await _beacons.openLocationSettings();
        return;
    }
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
    AttendanceRequirementAction? action,
  }) {
    _currentState = state;
    _stateController.add(
      AttendanceSessionSnapshot(
        state: state,
        roomDetection: roomDetection,
        message: message,
        action: action,
      ),
    );
  }

  bool _sameUuid(String left, String right) {
    return _normalizeUuid(left) == _normalizeUuid(right);
  }

  String _normalizeUuid(String uuid) {
    return uuid.replaceAll('-', '').toLowerCase().trim();
  }

  Future<_RuntimePermissionResult> _checkRuntimePermissions({
    required bool requiresRoomScan,
    required bool requestPermissions,
  }) async {
    final permissions = <Permission>[];
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        permissions.addAll([
          Permission.bluetoothAdvertise,
          Permission.bluetoothConnect,
        ]);
        if (requiresRoomScan) {
          permissions.add(Permission.bluetoothScan);
          if (await _beacons.getAndroidSdkInt() <= 30) {
            permissions.add(Permission.locationWhenInUse);
          }
        }
      case TargetPlatform.iOS:
        final bluetoothStatus = await _beacons.getBluetoothPermissionStatus(
          request: requestPermissions,
        );
        if (bluetoothStatus != NativePermissionStatus.granted) {
          return _RuntimePermissionResult.fromNativeStatuses([bluetoothStatus]);
        }
        final locationStatus = !requiresRoomScan
            ? NativePermissionStatus.granted
            : await _beacons.getLocationPermissionStatus(
                request: requestPermissions,
              );
        return _RuntimePermissionResult.fromNativeStatuses([
          bluetoothStatus,
          locationStatus,
        ]);
      default:
        return const _RuntimePermissionResult(granted: true);
    }

    final statuses = requestPermissions
        ? await permissions.request()
        : <Permission, PermissionStatus>{
            for (final permission in permissions)
              permission: await permission.status,
          };
    final granted = statuses.values.every(
      (status) => status.isGranted || status.isLimited,
    );
    return _RuntimePermissionResult(
      granted: granted,
      permanentlyDenied: statuses.values.any(
        (status) => status.isPermanentlyDenied || status.isRestricted,
      ),
    );
  }

  Future<bool> _requiresLocationService(bool requiresRoomScan) async {
    if (!requiresRoomScan) return false;
    if (defaultTargetPlatform == TargetPlatform.iOS) return true;
    if (defaultTargetPlatform == TargetPlatform.android) {
      return await _beacons.getAndroidSdkInt() <= 30;
    }
    return false;
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

class _RuntimePermissionResult {
  final bool granted;
  final bool permanentlyDenied;

  const _RuntimePermissionResult({
    required this.granted,
    this.permanentlyDenied = false,
  });

  factory _RuntimePermissionResult.fromNativeStatuses(
    Iterable<NativePermissionStatus> statuses,
  ) {
    return _RuntimePermissionResult(
      granted: statuses.every(
        (status) => status == NativePermissionStatus.granted,
      ),
      permanentlyDenied: statuses.any(
        (status) =>
            status == NativePermissionStatus.denied ||
            status == NativePermissionStatus.restricted,
      ),
    );
  }
}
