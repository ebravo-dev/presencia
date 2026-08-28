import 'dart:async';
import 'dart:convert';

import 'package:flutter/services.dart';

import 'native_altbeacon_channel.dart';

enum StudentAttendanceDetectionTransport { gatt, iBeacon }

bool bindingUsesExternalIBeacon(Map<dynamic, dynamic> binding) {
  final deviceBindingId = binding['deviceBindingId']?.toString().trim();
  return deviceBindingId == null || deviceBindingId.isEmpty;
}

class StudentAttendanceDetection {
  final String uuid;
  final String? bluetoothAddress;
  final int? rssi;
  final DateTime detectedAt;
  final StudentAttendanceDetectionTransport transport;

  StudentAttendanceDetection({
    required this.uuid,
    this.bluetoothAddress,
    this.rssi,
    DateTime? detectedAt,
    this.transport = StudentAttendanceDetectionTransport.gatt,
  }) : detectedAt = detectedAt ?? DateTime.now();

  factory StudentAttendanceDetection.fromMap(Map<dynamic, dynamic> map) {
    return StudentAttendanceDetection(
      uuid: map['uuid'] as String? ?? '',
      bluetoothAddress: map['bluetoothAddress'] as String?,
      rssi: map['rssi'] as int?,
    );
  }

  factory StudentAttendanceDetection.fromIBeacon(AltBeaconDetection detection) {
    return StudentAttendanceDetection(
      uuid: detection.uuid,
      bluetoothAddress: detection.bluetoothAddress,
      rssi: detection.rssi,
      detectedAt: detection.detectedAt,
      transport: StudentAttendanceDetectionTransport.iBeacon,
    );
  }

  bool get requiresGattConfirmation =>
      transport == StudentAttendanceDetectionTransport.gatt;

  Map<String, dynamic> toApiJson() {
    return {
      'beaconUuid': uuid,
      'detectedAt': detectedAt.toIso8601String(),
      if (rssi != null) 'rssi': rssi,
      if (bluetoothAddress != null) 'bluetoothAddress': bluetoothAddress,
    };
  }
}

/// Student-specific confirmation written only after the advertised UUID has
/// been matched to that matricula in the active class roster.
class StudentAttendanceGattConfirmation {
  final String matricula;
  final String materia;
  final DateTime dia;

  const StudentAttendanceGattConfirmation({
    required this.matricula,
    required this.materia,
    required this.dia,
  });

  String toGattPayload() {
    return jsonEncode({
      'id': matricula.trim().toUpperCase(),
      'materia': materia.trim(),
      'dia': _formatGattDay(dia),
    });
  }

  static String _formatGattDay(DateTime value) {
    final year = value.year.toString().padLeft(4, '0');
    final month = value.month.toString().padLeft(2, '0');
    final day = value.day.toString().padLeft(2, '0');
    return '$year-$month-$day';
  }
}

class StudentAttendanceBleService {
  static const _method = MethodChannel('com.presencia/student_attendance_ble');
  static const _events = EventChannel(
    'com.presencia/student_attendance_ble_events',
  );

  Stream<List<StudentAttendanceDetection>> get detectionsStream {
    return _events.receiveBroadcastStream().map((event) {
      if (event is List) {
        return event
            .whereType<Map<dynamic, dynamic>>()
            .map(StudentAttendanceDetection.fromMap)
            .where((detection) => detection.uuid.isNotEmpty)
            .toList();
      }
      return <StudentAttendanceDetection>[];
    });
  }

  /// Standard iBeacon detections used by external iPhone beacon emulators.
  /// This is intentionally separate from [detectionsStream], which preserves
  /// the connectable GATT handshake used by the Presencia Android app.
  Stream<List<StudentAttendanceDetection>> get iBeaconDetectionsStream {
    return NativeAltBeaconChannel().detectionsStream.map(
      (detections) => detections
          .map(StudentAttendanceDetection.fromIBeacon)
          .toList(growable: false),
    );
  }

  Future<bool> startScanning({
    required Map<String, StudentAttendanceGattConfirmation> confirmationsByUuid,
  }) async {
    final confirmationPayloads = <String, String>{};
    for (final entry in confirmationsByUuid.entries) {
      final uuid = _normalizeUuid(entry.key);
      final matricula = entry.value.matricula.trim();
      final materia = entry.value.materia.trim();
      if (uuid.isEmpty || matricula.isEmpty || materia.isEmpty) continue;
      confirmationPayloads[uuid] = entry.value.toGattPayload();
    }
    if (confirmationPayloads.isEmpty) return false;

    final result = await _method.invokeMethod<bool>('startScanning', {
      'confirmationPayloads': confirmationPayloads,
    });
    return result == true;
  }

  /// Starts ranging standard iBeacon advertisements for externally registered
  /// UUIDs. Invalid identifiers are ignored rather than affecting GATT scans.
  Future<bool> startIBeaconScanning({required Iterable<String> uuids}) async {
    final canonicalUuids = uuids
        .map(_canonicalUuid)
        .whereType<String>()
        .toSet()
        .toList(growable: false);
    if (canonicalUuids.isEmpty) return false;

    return NativeAltBeaconChannel().startScanning(uuids: canonicalUuids);
  }

  /// Allows the native layer to send feedback to the student only after the
  /// teacher app has accepted and persisted this UUID as present.
  Future<bool> confirmAttendance(String uuid) async {
    final normalizedUuid = _normalizeUuid(uuid);
    if (normalizedUuid.isEmpty) return false;

    final result = await _method.invokeMethod<bool>('confirmAttendance', {
      'uuid': normalizedUuid,
    });
    return result == true;
  }

  Future<void> stopScanning() async {
    await _method.invokeMethod('stopScanning');
  }

  Future<void> stopIBeaconScanning() async {
    await NativeAltBeaconChannel().stopScanning();
  }

  String _normalizeUuid(String uuid) {
    return uuid.replaceAll('-', '').trim().toLowerCase();
  }

  String? _canonicalUuid(String uuid) {
    final normalized = _normalizeUuid(uuid);
    if (!RegExp(r'^[0-9a-f]{32}$').hasMatch(normalized)) return null;
    return '${normalized.substring(0, 8)}-'
        '${normalized.substring(8, 12)}-'
        '${normalized.substring(12, 16)}-'
        '${normalized.substring(16, 20)}-'
        '${normalized.substring(20)}';
  }
}
