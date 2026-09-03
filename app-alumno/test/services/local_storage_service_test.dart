import 'package:app_alumno/services/local_storage_service.dart';
import 'package:app_alumno/models/student_schedule_entry.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _MemoryBox extends Fake implements Box<dynamic> {
  final Map<dynamic, dynamic> contents = {};

  @override
  dynamic get(dynamic key, {dynamic defaultValue}) {
    return contents.containsKey(key) ? contents[key] : defaultValue;
  }

  @override
  Future<void> put(dynamic key, dynamic value) async {
    contents[key] = value;
  }

  @override
  Future<int> clear() async {
    final count = contents.length;
    contents.clear();
    return count;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const secureStorageChannel = MethodChannel(
    'plugins.it_nomads.com/flutter_secure_storage',
  );

  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(secureStorageChannel, (_) async => null);
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(secureStorageChannel, null);
  });

  test('stores the first attendance entry when history is empty', () async {
    final box = _MemoryBox();
    final storage = LocalStorageService.withProfileBox(box);
    final recordedAt = DateTime(2026, 8, 4, 8, 30);

    expect(storage.attendanceHistory, isEmpty);

    await storage.addAttendanceHistoryEntry(
      recordedAt,
      classId: 'group-42',
      className: 'Redes',
      group: 'A',
      classroom: 'LC-3',
    );

    expect(storage.attendanceHistoryCount, 1);
    expect(storage.attendanceHistory.single.recordedAt, recordedAt);
    expect(storage.attendanceHistory.single.classId, 'group-42');
    expect(storage.attendanceHistory.single.className, 'Redes');
    expect(storage.attendanceHistory.single.group, 'A');
    expect(storage.attendanceHistory.single.classroom, 'LC-3');
  });

  test('keeps the last synchronized schedule for offline startup', () async {
    final box = _MemoryBox();
    final storage = LocalStorageService.withProfileBox(box);
    const schedule = [
      StudentScheduleEntry(
        externalGroupId: 'group-42',
        subject: 'Redes',
        classroom: 'LC-3',
        slots: [
          StudentScheduleSlot(
            weekday: DateTime.monday,
            raw: '08:00-10:00',
            startTime: '08:00',
            endTime: '10:00',
          ),
        ],
      ),
    ];

    await storage.saveStudentSchedule(schedule);

    expect(storage.studentSchedule, hasLength(1));
    expect(storage.studentSchedule.single.subject, 'Redes');
    expect(storage.studentSchedule.single.slots.single.endTime, '10:00');
  });

  test('keeps coordinator tolerance for offline card locking', () async {
    final storage = LocalStorageService.withProfileBox(_MemoryBox());

    expect(
      storage.attendanceToleranceMinutes,
      LocalStorageService.defaultAttendanceToleranceMinutes,
    );

    await storage.saveAttendanceTolerance(25);

    expect(storage.attendanceToleranceMinutes, 25);
  });

  test(
    'logout clears student data but keeps the stable device identity',
    () async {
      SharedPreferences.setMockInitialValues({
        'student_matricula': '123456',
        'student_attendance_uuid': 'attendance-uuid',
        'student_device_binding_id': 'binding-id',
        'classroom_beacon_uuid': 'classroom-uuid',
      });
      final box = _MemoryBox();
      box.contents.addAll({
        'matricula': '123456',
        'attendance_uuid': 'attendance-uuid',
        'device_binding_id': 'binding-id',
        'institutional_email': 'alumno@alumnos.uat.edu.mx',
        'classroom_beacon_uuid': 'classroom-uuid',
        'academic_profile': <String, dynamic>{'matricula': '123456'},
        'student_schedule': <dynamic>[],
        'attendance_history': <dynamic>[],
      });
      final storage = LocalStorageService.withProfileBox(box);

      await storage.clearStudentSession();

      expect(storage.isProfileSet, isFalse);
      expect(storage.academicProfile, isNull);
      expect(storage.studentSchedule, isEmpty);
      expect(storage.attendanceHistory, isEmpty);
      expect(storage.attendanceUuid, 'attendance-uuid');
      expect(storage.deviceBindingId, 'binding-id');
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('student_matricula'), isNull);
      expect(prefs.getString('student_attendance_uuid'), isNull);
      expect(prefs.getString('student_device_binding_id'), isNull);
      expect(prefs.getString('classroom_beacon_uuid'), isNull);
    },
  );

  test('logout discards the fixed App Review device identity', () async {
    SharedPreferences.setMockInitialValues({
      'student_matricula': 'APPREVIEW01',
      'student_attendance_uuid': '00000000-0000-4000-8000-000000000903',
      'student_device_binding_id': 'review-binding-id',
    });
    final box = _MemoryBox();
    box.contents.addAll({
      'matricula': 'APPREVIEW01',
      'attendance_uuid': '00000000-0000-4000-8000-000000000903',
      'device_binding_id': 'review-binding-id',
      'app_review_demo_mode': true,
    });
    final storage = LocalStorageService.withProfileBox(box);

    await storage.clearStudentSession();

    expect(storage.isProfileSet, isFalse);
    expect(storage.attendanceUuid, isEmpty);
    expect(storage.deviceBindingId, isEmpty);
  });
}
