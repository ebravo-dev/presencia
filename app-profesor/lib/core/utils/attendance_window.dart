class AttendanceWindow {
  const AttendanceWindow._();

  static DateTime? classStart(String schedule, DateTime reference) {
    return _parse(schedule, reference)?.start;
  }

  static DateTime? classEnd(String schedule, DateTime reference) {
    return _parse(schedule, reference)?.end;
  }

  static bool canMarkEntry(
    String schedule,
    DateTime now, {
    int toleranceMinutes = 10,
  }) {
    final start = classStart(schedule, now);
    final end = classEnd(schedule, now);
    if (start == null || end == null) return true;
    return _within(
      now,
      start.subtract(Duration(minutes: toleranceMinutes)),
      end.add(Duration(minutes: toleranceMinutes)),
    );
  }

  static bool canMarkExit(
    String schedule,
    DateTime now, {
    int toleranceMinutes = 10,
  }) {
    final start = classStart(schedule, now);
    final end = classEnd(schedule, now);
    if (start == null || end == null) return true;
    return _within(
      now,
      start.subtract(Duration(minutes: toleranceMinutes)),
      end.add(Duration(minutes: toleranceMinutes)),
    );
  }

  static bool canTakeAttendance(
    String schedule,
    DateTime now, {
    int toleranceMinutes = 10,
  }) {
    return canMarkEntry(schedule, now, toleranceMinutes: toleranceMinutes);
  }

  static bool _within(DateTime value, DateTime start, DateTime end) {
    return !value.isBefore(start) && !value.isAfter(end);
  }

  static ({DateTime start, DateTime end})? _parse(
    String schedule,
    DateTime reference,
  ) {
    final match = RegExp(
      r'^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$',
    ).firstMatch(schedule);
    if (match == null) return null;

    final startHour = int.tryParse(match.group(1)!);
    final startMinute = int.tryParse(match.group(2)!);
    final endHour = int.tryParse(match.group(3)!);
    final endMinute = int.tryParse(match.group(4)!);
    if (!_validTime(startHour, startMinute) ||
        !_validTime(endHour, endMinute)) {
      return null;
    }

    return (
      start: DateTime(
        reference.year,
        reference.month,
        reference.day,
        startHour!,
        startMinute!,
      ),
      end: DateTime(
        reference.year,
        reference.month,
        reference.day,
        endHour!,
        endMinute!,
      ),
    );
  }

  static bool _validTime(int? hour, int? minute) {
    return hour != null &&
        minute != null &&
        hour >= 0 &&
        hour <= 23 &&
        minute >= 0 &&
        minute <= 59;
  }
}
