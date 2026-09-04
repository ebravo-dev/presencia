import 'dart:async';

import 'package:flutter/services.dart';

import 'student_logger.dart';

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

  Future<bool> isBluetoothAvailable() async {
    try {
      final state = await _method.invokeMethod<String>('checkBluetoothState');
      return state == 'poweredOn';
    } catch (e) {
      StudentLogger.warning(
        'ble.scan.state_check_failed',
        'No se pudo consultar el estado de Bluetooth.',
        error: e,
      );
      return false;
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
