enum ProfessorArrivalStatus { onTime, late, outsideWindow, unknownSchedule }

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
    return arrivalStatus(schedule, now, toleranceMinutes: toleranceMinutes) !=
        ProfessorArrivalStatus.outsideWindow;
  }

  static bool canMarkExit(
    String schedule,
    DateTime now, {
    int toleranceMinutes = 10,
  }) {
    final start = classStart(schedule, now);
    final end = classEnd(schedule, now);
    if (start == null || end == null) return true;
    return _withinMinuteRange(
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

  static bool canTakeStudentAttendanceForDate(
    String schedule, {
    required DateTime selectedDate,
    required DateTime now,
    required bool isClassDay,
    int toleranceMinutes = 10,
  }) {
    if (!isClassDay) return false;

    final selectedDay = DateTime(
      selectedDate.year,
      selectedDate.month,
      selectedDate.day,
    );
    final today = DateTime(now.year, now.month, now.day);
    if (selectedDay.isAfter(today)) return false;
    if (selectedDay.isBefore(today)) return true;

    return canTakeAttendance(schedule, now, toleranceMinutes: toleranceMinutes);
  }

  static ProfessorArrivalStatus arrivalStatus(
    String schedule,
    DateTime arrival, {
    int toleranceMinutes = 10,
  }) {
    final start = classStart(schedule, arrival);
    final end = classEnd(schedule, arrival);
    if (start == null || end == null) {
      return ProfessorArrivalStatus.unknownSchedule;
    }

    final normalizedTolerance = toleranceMinutes < 0 ? 0 : toleranceMinutes;
    final arrivalMinute = _minuteFloor(arrival);
    final windowStart = start.subtract(Duration(minutes: normalizedTolerance));
    final onTimeEnd = start.add(Duration(minutes: normalizedTolerance));
    final windowEnd = end.add(Duration(minutes: normalizedTolerance));

    if (arrivalMinute.isBefore(windowStart) ||
        arrivalMinute.isAfter(windowEnd)) {
      return ProfessorArrivalStatus.outsideWindow;
    }
    if (arrivalMinute.isAfter(onTimeEnd)) {
      return ProfessorArrivalStatus.late;
    }
    return ProfessorArrivalStatus.onTime;
  }

  static bool _withinMinuteRange(DateTime value, DateTime start, DateTime end) {
    final valueMinute = _minuteFloor(value);
    return !valueMinute.isBefore(start) && !valueMinute.isAfter(end);
  }

  static DateTime _minuteFloor(DateTime value) {
    return DateTime(
      value.year,
      value.month,
      value.day,
      value.hour,
      value.minute,
    );
  }

  static ({DateTime start, DateTime end})? _parse(
    String schedule,
    DateTime reference,
  ) {
    final matches = RegExp(
      r'(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})',
    ).allMatches(schedule);
    final ranges = <({DateTime start, DateTime end})>[];

    for (final match in matches) {
      final startHour = int.tryParse(match.group(1)!);
      final startMinute = int.tryParse(match.group(2)!);
      final endHour = int.tryParse(match.group(3)!);
      final endMinute = int.tryParse(match.group(4)!);
      if (!_validTime(startHour, startMinute) ||
          !_validTime(endHour, endMinute)) {
        continue;
      }

      final start = DateTime(
        reference.year,
        reference.month,
        reference.day,
        startHour!,
        startMinute!,
      );
      var end = DateTime(
        reference.year,
        reference.month,
        reference.day,
        endHour!,
        endMinute!,
      );
      if (!end.isAfter(start)) end = end.add(const Duration(days: 1));
      ranges.add((start: start, end: end));
    }
    if (ranges.isEmpty) return null;

    ranges.sort((left, right) {
      final leftDistance = _distanceToRange(reference, left);
      final rightDistance = _distanceToRange(reference, right);
      return leftDistance.compareTo(rightDistance);
    });
    return ranges.first;
  }

  static int _distanceToRange(
    DateTime value,
    ({DateTime start, DateTime end}) range,
  ) {
    if (value.isBefore(range.start)) {
      return range.start.difference(value).inSeconds;
    }
    if (value.isAfter(range.end)) {
      return value.difference(range.end).inSeconds;
    }
    return 0;
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
