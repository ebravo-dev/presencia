import 'dart:async';

import 'package:flutter/services.dart';

import 'student_logger.dart';

enum BluetoothAvailability {
  poweredOn,
  poweredOff,
  unauthorized,
  unsupported,
  unknown,
}

class AltBeaconDetection {
  final String uuid;
  final int? major;
  final int? minor;
  final int? rssi;
  final double? distance;
  final int? txPower;
  final String? bluetoothAddress;
  final DateTime detectedAt;

  AltBeaconDetection({
    required this.uuid,
    this.major,
    this.minor,
    this.rssi,
    this.distance,
    this.txPower,
    this.bluetoothAddress,
    DateTime? detectedAt,
  }) : detectedAt = detectedAt ?? DateTime.now();

  factory AltBeaconDetection.fromMap(Map<dynamic, dynamic> map) {
    return AltBeaconDetection(
      uuid: map['uuid'] as String? ?? '',
      major: map['major'] as int?,
      minor: map['minor'] as int?,
      rssi: map['rssi'] as int?,
      distance: (map['distance'] as num?)?.toDouble(),
      txPower: map['txPower'] as int?,
      bluetoothAddress: map['bluetoothAddress'] as String?,
    );
  }
}

class NativeAltBeaconChannel {
  static const _method = MethodChannel('com.presencia/altbeacon');
  static const _events = EventChannel('com.presencia/altbeacon_events');

  static NativeAltBeaconChannel? _instance;
  factory NativeAltBeaconChannel() => _instance ??= NativeAltBeaconChannel._();
  NativeAltBeaconChannel._();

  Stream<List<AltBeaconDetection>> get detectionsStream {
    return _events.receiveBroadcastStream().map((event) {
      if (event is List) {
        return event
            .whereType<Map<dynamic, dynamic>>()
            .map(AltBeaconDetection.fromMap)
            .where((beacon) => beacon.uuid.isNotEmpty)
            .toList();
      }
      return <AltBeaconDetection>[];
    });
  }

  Future<BluetoothAvailability> getBluetoothAvailability() async {
    try {
      final state = await _method.invokeMethod<String>('checkBluetoothState');
      return switch (state) {
        'poweredOn' => BluetoothAvailability.poweredOn,
        'poweredOff' => BluetoothAvailability.poweredOff,
        'unauthorized' => BluetoothAvailability.unauthorized,
        'unsupported' => BluetoothAvailability.unsupported,
        _ => BluetoothAvailability.unknown,
      };
    } catch (e) {
      StudentLogger.warning(
        'ble.scan.state_check_failed',
        'No se pudo consultar el estado de Bluetooth.',
        error: e,
      );
      return BluetoothAvailability.unknown;
    }
  }

  Future<bool> isBluetoothAvailable() async =>
      await getBluetoothAvailability() == BluetoothAvailability.poweredOn;

  Future<int> getAndroidSdkInt() async {
    try {
      return await _method.invokeMethod<int>('getAndroidSdkInt') ?? 30;
    } on MissingPluginException {
      return 30;
    } on PlatformException {
      return 30;
    }
  }

  Future<bool> isLocationServiceEnabled() async {
    try {
      return await _method.invokeMethod<bool>('checkLocationServices') ?? false;
    } catch (e) {
      StudentLogger.warning(
        'ble.scan.location_state_check_failed',
        'No se pudo consultar el estado de la ubicación.',
        error: e,
      );
      return false;
    }
  }

  Future<void> openBluetoothSettings() async {
    await _openSettings('openBluetoothSettings');
  }

  Future<void> openLocationSettings() async {
    await _openSettings('openLocationSettings');
  }

  Future<void> _openSettings(String method) async {
    try {
      await _method.invokeMethod<bool>(method);
    } catch (e) {
      StudentLogger.warning(
        'ble.scan.settings_open_failed',
        'No se pudo abrir la configuración del teléfono.',
        error: e,
      );
    }
  }

  Future<bool> requestPermissions() async {
    try {
      final result = await _method.invokeMethod<bool>('requestPermissions');
      return result == true;
    } catch (e) {
      StudentLogger.warning(
        'ble.scan.permission_failed',
        'No se pudieron solicitar los permisos Bluetooth.',
        error: e,
      );
      return false;
    }
  }

  Future<bool> startScanning({required List<String> uuids}) async {
    if (uuids.isEmpty) return false;
    try {
      final result = await _method.invokeMethod<bool>('startScanning', {
        'uuids': uuids,
      });
      return result == true;
    } catch (e, stackTrace) {
      StudentLogger.error(
        'ble.scan.start_failed',
        'No se pudo iniciar el escaneo de beacons.',
        error: e,
        stackTrace: stackTrace,
      );
      rethrow;
    }
  }

  Future<void> stopScanning() async {
    try {
      await _method.invokeMethod('stopScanning');
    } catch (e) {
      StudentLogger.warning(
        'ble.scan.stop_failed',
        'No se pudo detener el escaneo de beacons.',
        error: e,
      );
    }
  }
}
