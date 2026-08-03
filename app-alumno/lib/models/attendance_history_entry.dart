class AttendanceHistoryEntry {
  final DateTime recordedAt;

  const AttendanceHistoryEntry({required this.recordedAt});

  Map<String, String> toStorage() => {
    'recordedAt': recordedAt.toIso8601String(),
  };

  static AttendanceHistoryEntry? fromStorage(Object? value) {
    if (value is! Map) return null;

    final recordedAt = DateTime.tryParse(value['recordedAt']?.toString() ?? '');
    if (recordedAt == null) return null;

    return AttendanceHistoryEntry(recordedAt: recordedAt);
  }
}
