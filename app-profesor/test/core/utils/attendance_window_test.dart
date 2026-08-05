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

    test('fails open when UAT returns an unknown schedule format', () {
      final now = DateTime(2026, 8, 3, 3);
      expect(AttendanceWindow.canMarkEntry('Sin horario', now), isTrue);
      expect(AttendanceWindow.canMarkExit('25:00-26:00', now), isTrue);
    });
  });
}
