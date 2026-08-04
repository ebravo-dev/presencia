class AttendanceHistoryEntry {
  final DateTime recordedAt;
  final String? classId;
  final String? className;
  final String? group;
  final String? classroom;

  const AttendanceHistoryEntry({
    required this.recordedAt,
    this.classId,
    this.className,
    this.group,
    this.classroom,
  });

  Map<String, String> toStorage() => {
    'recordedAt': recordedAt.toIso8601String(),
    'classId': ?classId,
    'className': ?className,
    'group': ?group,
    'classroom': ?classroom,
  };

  static AttendanceHistoryEntry? fromStorage(Object? value) {
    if (value is! Map) return null;

    final recordedAt = DateTime.tryParse(value['recordedAt']?.toString() ?? '');
    if (recordedAt == null) return null;

    return AttendanceHistoryEntry(
      recordedAt: recordedAt,
      classId: _readOptionalString(value['classId']),
      className: _readOptionalString(value['className']),
      group: _readOptionalString(value['group']),
      classroom: _readOptionalString(value['classroom']),
    );
  }
}

String? _readOptionalString(Object? value) {
  final text = value?.toString().trim();
  return text == null || text.isEmpty ? null : text;
}
