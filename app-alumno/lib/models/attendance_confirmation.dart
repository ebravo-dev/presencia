import 'dart:convert';

/// Confirmation written by the professor through GATT after the student's
/// attendance UUID has been validated against the active class roster.
class AttendanceConfirmation {
  final int version;
  final String status;
  final String? classId;
  final String? className;
  final String? group;
  final String? classroom;

  const AttendanceConfirmation({
    required this.version,
    required this.status,
    this.classId,
    this.className,
    this.group,
    this.classroom,
  });

  bool get isConfirmed => status.toLowerCase() == 'confirmed';

  bool get hasClassContext =>
      classId?.trim().isNotEmpty == true &&
      className?.trim().isNotEmpty == true;

  String get classDisplayName {
    final name = className?.trim();
    final groupName = group?.trim();
    if (name == null || name.isEmpty) return 'tu clase';
    if (groupName == null || groupName.isEmpty) return name;
    return '$name · Grupo $groupName';
  }

  factory AttendanceConfirmation.fromGattMessage(String message) {
    final trimmed = message.trim();
    try {
      final decoded = jsonDecode(trimmed);
      if (decoded is Map) {
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
