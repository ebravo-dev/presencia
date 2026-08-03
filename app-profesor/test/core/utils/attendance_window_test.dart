import 'package:flutter_test/flutter_test.dart';
import 'package:appprofesoresuniversidad/core/utils/attendance_window.dart';

void main() {
  group('AttendanceWindow', () {
    test('allows professor entry from 10 minutes before to 30 after start', () {
      expect(
        AttendanceWindow.canMarkEntry(
          '08:00-09:00',
          DateTime(2026, 8, 3, 7, 50),
        ),
        isTrue,
      );
      expect(
        AttendanceWindow.canMarkEntry(
          '08:00-09:00',
          DateTime(2026, 8, 3, 8, 30),
        ),
        isTrue,
      );
      expect(
        AttendanceWindow.canMarkEntry(
          '08:00-09:00',
          DateTime(2026, 8, 3, 8, 31),
        ),
        isFalse,
      );
    });

    test('allows professor exit within 30 minutes of class end', () {
      expect(
        AttendanceWindow.canMarkExit(
          '08:00 - 09:00',
          DateTime(2026, 8, 3, 8, 30),
        ),
        isTrue,
      );
      expect(
        AttendanceWindow.canMarkExit(
          '08:00 - 09:00',
          DateTime(2026, 8, 3, 9, 30),
        ),
        isTrue,
      );
      expect(
        AttendanceWindow.canMarkExit(
          '08:00 - 09:00',
          DateTime(2026, 8, 3, 9, 31),
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
