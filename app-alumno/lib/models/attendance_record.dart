import 'package:hive/hive.dart';

part 'attendance_record.g.dart';

@HiveType(typeId: 0)
class AttendanceRecord extends HiveObject {
  @HiveField(0)
  final String id;

  @HiveField(1)
  final String studentName;

  @HiveField(2)
  final String matricula;

  @HiveField(3)
  final String beaconId;

  @HiveField(4)
  final DateTime detectedAt;

  @HiveField(5)
  final String? deviceInfo;

  @HiveField(6)
  final bool synced;

  AttendanceRecord({
    required this.id,
    required this.studentName,
    required this.matricula,
    required this.beaconId,
    required this.detectedAt,
    this.deviceInfo,
    this.synced = false,
  });

  AttendanceRecord copyWith({
    String? id,
    String? studentName,
    String? matricula,
    String? beaconId,
    DateTime? detectedAt,
    String? deviceInfo,
    bool? synced,
  }) {
    return AttendanceRecord(
      id: id ?? this.id,
      studentName: studentName ?? this.studentName,
      matricula: matricula ?? this.matricula,
      beaconId: beaconId ?? this.beaconId,
      detectedAt: detectedAt ?? this.detectedAt,
      deviceInfo: deviceInfo ?? this.deviceInfo,
      synced: synced ?? this.synced,
    );
  }

  Map<String, dynamic> toJson() => {
    'studentName': studentName,
    'matricula': matricula,
    'beaconId': beaconId,
    'detectedAt': detectedAt.toUtc().toIso8601String(),
    'deviceInfo': deviceInfo,
  };
}
