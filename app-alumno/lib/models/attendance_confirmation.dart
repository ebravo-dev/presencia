import 'dart:convert';

/// Confirmation written by the professor through GATT after the student's
/// attendance UUID has been validated against the active class roster.
class AttendanceConfirmation {
  final int version;
  final String status;
  final String? matricula;
  final String? materia;
  final DateTime? attendanceDate;
  final String? classId;
  final String? className;
  final String? group;
  final String? classroom;

  const AttendanceConfirmation({
    required this.version,
    required this.status,
    this.matricula,
    this.materia,
    this.attendanceDate,
    this.classId,
    this.className,
    this.group,
    this.classroom,
  });

  bool get isConfirmed =>
      hasStudentContext || status.toLowerCase() == 'confirmed';

  bool get hasStudentContext =>
      matricula?.trim().isNotEmpty == true &&
      materia?.trim().isNotEmpty == true;

  bool belongsToMatricula(String expectedMatricula) {
    if (!hasStudentContext) return false;
    return matricula!.trim().toUpperCase() ==
        expectedMatricula.trim().toUpperCase();
  }

  bool get hasClassContext =>
      classId?.trim().isNotEmpty == true &&
      className?.trim().isNotEmpty == true;

  String get classDisplayName {
    final name = materia?.trim() ?? className?.trim();
    final groupName = group?.trim();
    if (name == null || name.isEmpty) return 'tu clase';
    if (groupName == null || groupName.isEmpty) return name;
    return '$name · Grupo $groupName';
  }

  DateTime recordedAtForHistory(DateTime receivedAt) {
    final day = attendanceDate;
    if (day == null) return receivedAt;
    return DateTime(
      day.year,
      day.month,
      day.day,
      receivedAt.hour,
      receivedAt.minute,
      receivedAt.second,
      receivedAt.millisecond,
      receivedAt.microsecond,
    );
  }

  factory AttendanceConfirmation.fromGattMessage(String message) {
    final trimmed = message.trim();
    try {
      final decoded = jsonDecode(trimmed);
      if (decoded is Map) {
        final materia = _asNonEmptyString(decoded['materia']);
        if (materia != null) {
          final rawDay = _asNonEmptyString(decoded['dia']);
          final attendanceDate = rawDay == null ? null : _parseGattDay(rawDay);
          if (rawDay != null && attendanceDate == null) {
            return const AttendanceConfirmation(version: 3, status: 'invalid');
          }
          return AttendanceConfirmation(
            version: rawDay == null ? 2 : 3,
            status: 'confirmed',
            matricula: _asNonEmptyString(decoded['id']),
            materia: materia,
            attendanceDate: attendanceDate,
            className: materia,
          );
        }
        return AttendanceConfirmation(
          version: _asInt(decoded['v']) ?? 1,
          status: decoded['s']?.toString() ?? '',
          classId: _asNonEmptyString(decoded['id']),
          className: _asNonEmptyString(decoded['name']),
          group: _asNonEmptyString(decoded['group']),
          classroom: _asNonEmptyString(decoded['room']),
        );
      }
    } on FormatException {
      // Older professor builds send the literal CONFIRMED. Keep that flow
      // compatible while new builds provide the class context.
    }

    return AttendanceConfirmation(
      version: 0,
      status: trimmed.toUpperCase() == 'CONFIRMED' ? 'confirmed' : trimmed,
    );
  }
}

int? _asInt(Object? value) {
  if (value is int) return value;
  return int.tryParse(value?.toString() ?? '');
}

String? _asNonEmptyString(Object? value) {
  final text = value?.toString().trim();
  return text == null || text.isEmpty ? null : text;
}

DateTime? _parseGattDay(String value) {
  final parts = value.split('-');
  if (parts.length != 3 ||
      parts[0].length != 4 ||
      parts[1].length != 2 ||
      parts[2].length != 2) {
    return null;
  }

  final year = int.tryParse(parts[0]);
  final month = int.tryParse(parts[1]);
  final day = int.tryParse(parts[2]);
  if (year == null || month == null || day == null) return null;

  final parsed = DateTime(year, month, day);
  return parsed.year == year && parsed.month == month && parsed.day == day
      ? parsed
      : null;
}
