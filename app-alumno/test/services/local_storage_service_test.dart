import 'package:app_alumno/services/local_storage_service.dart';
import 'package:app_alumno/models/student_schedule_entry.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';

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
}

void main() {
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
}
