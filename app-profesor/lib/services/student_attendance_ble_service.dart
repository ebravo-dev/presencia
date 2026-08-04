import 'dart:async';
import 'dart:convert';

import 'package:flutter/services.dart';

class StudentAttendanceDetection {
  final String uuid;
  final String? bluetoothAddress;
  final int? rssi;
  final DateTime detectedAt;

  StudentAttendanceDetection({
    required this.uuid,
    this.bluetoothAddress,
    this.rssi,
    DateTime? detectedAt,
  }) : detectedAt = detectedAt ?? DateTime.now();

  factory StudentAttendanceDetection.fromMap(Map<dynamic, dynamic> map) {
    return StudentAttendanceDetection(
      uuid: map['uuid'] as String? ?? '',
      bluetoothAddress: map['bluetoothAddress'] as String?,
      rssi: map['rssi'] as int?,
    );
  }

  Map<String, dynamic> toApiJson() {
    return {
      'beaconUuid': uuid,
      'detectedAt': detectedAt.toIso8601String(),
      if (rssi != null) 'rssi': rssi,
      if (bluetoothAddress != null) 'bluetoothAddress': bluetoothAddress,
    };
  }
}

/// Context that the professor app sends back only after a student UUID has
/// been matched against the roster of the group currently taking attendance.
class StudentAttendanceClassContext {
  final String classId;
  final String className;
  final String group;
  final String classroom;

  const StudentAttendanceClassContext({
    required this.classId,
    required this.className,
    required this.group,
    required this.classroom,
  });

  String toGattPayload() {
    return jsonEncode({
      'v': 1,
      's': 'confirmed',
      'id': classId,
      'name': className,
      'group': group,
      'room': classroom,
    });
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

  Future<bool> startScanning({
    required List<String> uuids,
    required StudentAttendanceClassContext classContext,
  }) async {
    if (uuids.isEmpty) return false;
    final result = await _method.invokeMethod<bool>('startScanning', {
      'uuids': uuids,
      'confirmationPayload': classContext.toGattPayload(),
    });
    return result == true;
  }

  Future<void> stopScanning() async {
    await _method.invokeMethod('stopScanning');
  }
}
