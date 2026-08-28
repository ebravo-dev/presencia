import 'package:flutter_test/flutter_test.dart';
import 'package:appprofesoresuniversidad/core/utils/attendance_window.dart';

void main() {
  group('AttendanceWindow', () {
    test('allows one professor entry throughout a multi-hour class', () {
      expect(
        AttendanceWindow.canMarkEntry(
          '08:00-12:00',
          DateTime(2026, 8, 3, 7, 50),
        ),
        isTrue,
      );
      expect(
        AttendanceWindow.canMarkEntry(
          '08:00-12:00',
          DateTime(2026, 8, 3, 10, 30),
        ),
        isTrue,
      );
      expect(
        AttendanceWindow.canMarkEntry(
          '08:00-12:00',
          DateTime(2026, 8, 3, 12, 11),
        ),
        isFalse,
      );
    });

    test('allows the single exit throughout the configured class window', () {
      expect(
        AttendanceWindow.canMarkExit(
          '08:00 - 12:00',
          DateTime(2026, 8, 3, 8, 30),
        ),
        isTrue,
      );
      expect(
        AttendanceWindow.canMarkExit(
          '08:00 - 12:00',
          DateTime(2026, 8, 3, 12, 10),
        ),
        isTrue,
      );
      expect(
        AttendanceWindow.canMarkExit(
          '08:00 - 12:00',
          DateTime(2026, 8, 3, 12, 11),
        ),
        isFalse,
      );
    });

    test('uses the tolerance supplied by the coordinator', () {
      final beforeDefaultWindow = DateTime(2026, 8, 3, 7, 45);

      expect(
        AttendanceWindow.canTakeAttendance(
          '08:00-12:00',
          beforeDefaultWindow,
          toleranceMinutes: 20,
        ),
        isTrue,
      );
      expect(
        AttendanceWindow.canTakeAttendance(
          '08:00-12:00',
          beforeDefaultWindow,
          toleranceMinutes: 10,
        ),
        isFalse,
      );
    });

    test('allows a past class day for a retroactive student correction', () {
      expect(
        AttendanceWindow.canTakeStudentAttendanceForDate(
          selectedDate: DateTime(2026, 8, 14),
          now: DateTime(2026, 8, 16, 18),
          isClassDay: true,
        ),
        isTrue,
      );
    });

    test('rejects future dates and dates without class', () {
      expect(
        AttendanceWindow.canTakeStudentAttendanceForDate(
          selectedDate: DateTime(2026, 8, 17),
          now: DateTime(2026, 8, 16, 9),
          isClassDay: true,
        ),
        isFalse,
      );
      expect(
        AttendanceWindow.canTakeStudentAttendanceForDate(
          selectedDate: DateTime(2026, 8, 14),
          now: DateTime(2026, 8, 16, 9),
          isClassDay: false,
        ),
        isFalse,
      );
    });

    test('does not reuse the professor attendance window for students', () {
      expect(
        AttendanceWindow.canTakeStudentAttendanceForDate(
          selectedDate: DateTime(2026, 8, 16),
          now: DateTime(2026, 8, 16, 9),
          isClassDay: true,
        ),
        isTrue,
      );
      expect(
        AttendanceWindow.canTakeStudentAttendanceForDate(
          selectedDate: DateTime(2026, 8, 16),
          now: DateTime(2026, 8, 16, 18),
          isClassDay: true,
        ),
        isTrue,
      );
    });

    test('classifies the complete 07:00-08:00 window with 10 minutes', () {
      const schedule = '07:00-08:00';

      expect(
        AttendanceWindow.arrivalStatus(
          schedule,
          DateTime(2026, 8, 3, 6, 49, 59),
        ),
        ProfessorArrivalStatus.outsideWindow,
      );
      expect(
        AttendanceWindow.arrivalStatus(schedule, DateTime(2026, 8, 3, 6, 50)),
        ProfessorArrivalStatus.onTime,
      );
      expect(
        AttendanceWindow.arrivalStatus(
          schedule,
          DateTime(2026, 8, 3, 7, 10, 59),
        ),
        ProfessorArrivalStatus.onTime,
      );
      expect(
        AttendanceWindow.arrivalStatus(schedule, DateTime(2026, 8, 3, 7, 11)),
        ProfessorArrivalStatus.late,
      );
      expect(
        AttendanceWindow.arrivalStatus(
          schedule,
          DateTime(2026, 8, 3, 8, 10, 59),
        ),
        ProfessorArrivalStatus.late,
      );
      expect(
        AttendanceWindow.arrivalStatus(schedule, DateTime(2026, 8, 3, 8, 11)),
        ProfessorArrivalStatus.outsideWindow,
      );
    });

    test('selects the nearest class when a day has separate ranges', () {
      const schedule = '07:00-08:00 · 15:00-16:00';

      expect(
        AttendanceWindow.arrivalStatus(schedule, DateTime(2026, 8, 3, 8, 5)),
        ProfessorArrivalStatus.late,
      );
      expect(
        AttendanceWindow.arrivalStatus(schedule, DateTime(2026, 8, 3, 14, 55)),
        ProfessorArrivalStatus.onTime,
      );
      expect(
        AttendanceWindow.canMarkEntry(schedule, DateTime(2026, 8, 3, 12)),
        isFalse,
      );
    });

    test('fails open when UAT returns an unknown schedule format', () {
      final now = DateTime(2026, 8, 3, 3);
      expect(AttendanceWindow.canMarkEntry('Sin horario', now), isTrue);
      expect(AttendanceWindow.canMarkExit('25:00-26:00', now), isTrue);
    });
  });
}
