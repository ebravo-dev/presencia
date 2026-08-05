class StudentScheduleSlot {
  final int weekday;
  final String raw;
  final String? startTime;
  final String? endTime;

  const StudentScheduleSlot({
    required this.weekday,
    required this.raw,
    this.startTime,
    this.endTime,
  });

  String get displayTime {
    if (startTime != null && endTime != null) {
      return '$startTime - $endTime';
    }
    return raw;
  }

  Map<String, dynamic> toStorage() => {
    'weekday': weekday,
    'raw': raw,
    'startTime': startTime,
    'endTime': endTime,
  };

  factory StudentScheduleSlot.fromStorage(Map<String, dynamic> json) {
    return StudentScheduleSlot(
      weekday: int.tryParse(json['weekday']?.toString() ?? '') ?? 0,
      raw: json['raw']?.toString() ?? '',
      startTime: _storedString(json['startTime']),
      endTime: _storedString(json['endTime']),
    );
  }
}

class StudentScheduleEntry {
  final String externalGroupId;
  final String subject;
  final String? classroom;
  final String? professor;
  final String? group;
  final String? period;
  final List<StudentScheduleSlot> slots;

  const StudentScheduleEntry({
    required this.externalGroupId,
    required this.subject,
    required this.slots,
    this.classroom,
    this.professor,
    this.group,
    this.period,
  });

  factory StudentScheduleEntry.fromUatJson(Map<String, dynamic> json) {
    final externalGroupId = _readString(json, const [
      'Id_Grupo',
      'id_grupo',
      'idGrupo',
    ]);
    final subject = _readString(json, const [
      'Txt_Materia',
      'Materia',
      'MATERIA',
      'txt_materia',
    ]);

    return StudentScheduleEntry(
      externalGroupId: externalGroupId ?? '',
      subject: subject ?? 'Materia sin nombre',
      classroom: _readString(json, const [
        'Txt_Espacio_Fisico',
        'Aula',
        'Salon',
      ]),
      professor: _readString(json, const [
        'Txt_Nombre_Profesor',
        'Profesor',
        'PROFESOR',
      ]),
      group: _readString(json, const ['Txt_Letra', 'Grupo', 'GRUPO']),
      period: _readString(json, const ['Num_Periodo', 'Periodo']),
      slots: _parseWeeklySlots(json),
    );
  }

  factory StudentScheduleEntry.fromStorage(Map<String, dynamic> json) {
    final rawSlots = json['slots'];
    return StudentScheduleEntry(
      externalGroupId: json['externalGroupId']?.toString() ?? '',
      subject: json['subject']?.toString() ?? 'Materia sin nombre',
      classroom: _storedString(json['classroom']),
      professor: _storedString(json['professor']),
      group: _storedString(json['group']),
      period: _storedString(json['period']),
      slots: rawSlots is List
          ? rawSlots
                .whereType<Map>()
                .map(
                  (slot) => StudentScheduleSlot.fromStorage(
                    Map<String, dynamic>.from(slot),
                  ),
                )
                .where((slot) => slot.weekday >= 1 && slot.weekday <= 7)
                .toList(growable: false)
          : const [],
    );
  }

  Map<String, dynamic> toStorage() => {
    'externalGroupId': externalGroupId,
    'subject': subject,
    'classroom': classroom,
    'professor': professor,
    'group': group,
    'period': period,
    'slots': slots.map((slot) => slot.toStorage()).toList(growable: false),
  };

  List<StudentScheduleOccurrence> occurrencesForWeekday(int weekday) {
    return slots
        .where((slot) => slot.weekday == weekday)
        .map((slot) => StudentScheduleOccurrence(entry: this, slot: slot))
        .toList(growable: false);
  }
}

class StudentScheduleOccurrence {
  final StudentScheduleEntry entry;
  final StudentScheduleSlot slot;

  const StudentScheduleOccurrence({required this.entry, required this.slot});
}

List<StudentScheduleEntry> parseStudentSchedule(
  Iterable<Map<String, dynamic>> rawItems,
) {
  final parsed = rawItems
      .where(
        (item) =>
            _readString(item, const ['Id_Grupo', 'id_grupo', 'idGrupo']) !=
                null ||
            _readString(item, const [
                  'Txt_Materia',
                  'Materia',
                  'MATERIA',
                  'txt_materia',
                ]) !=
                null,
      )
      .map(StudentScheduleEntry.fromUatJson)
      .toList(growable: false);

  final grouped = <String, List<StudentScheduleEntry>>{};
  for (final entry in parsed) {
    grouped.putIfAbsent(_entryKey(entry), () => []).add(entry);
  }

  return grouped.values
      .map((entries) {
        final first = entries.first;
        return StudentScheduleEntry(
          externalGroupId: first.externalGroupId,
          subject: entries
              .map((entry) => entry.subject)
              .firstWhere(
                (subject) => subject != 'Materia sin nombre',
                orElse: () => first.subject,
              ),
          classroom: _firstValue(entries.map((entry) => entry.classroom)),
          professor: _firstValue(entries.map((entry) => entry.professor)),
          group: _firstValue(entries.map((entry) => entry.group)),
          period: _firstValue(entries.map((entry) => entry.period)),
          slots: entries.expand((entry) => entry.slots).toList(growable: false),
        );
      })
      .toList(growable: false);
}

List<StudentScheduleOccurrence> scheduleForWeekday(
  Iterable<StudentScheduleEntry> schedule,
  int weekday,
) {
  final occurrences = schedule
      .expand((entry) => entry.occurrencesForWeekday(weekday))
      .toList();
  occurrences.sort((left, right) {
    final byTime = _sortTime(left.slot).compareTo(_sortTime(right.slot));
    if (byTime != 0) return byTime;
    return left.entry.subject.compareTo(right.entry.subject);
  });
  final merged = <StudentScheduleOccurrence>[];
  for (final occurrence in occurrences) {
    if (merged.isEmpty) {
      merged.add(occurrence);
      continue;
    }

    final previous = merged.last;
    if (_entryKey(previous.entry) == _entryKey(occurrence.entry) &&
        _touchesOrOverlaps(previous.slot, occurrence.slot)) {
      final start = _earlierTime(
        previous.slot.startTime!,
        occurrence.slot.startTime!,
      );
      final end = _laterTime(previous.slot.endTime!, occurrence.slot.endTime!);
      merged[merged.length - 1] = StudentScheduleOccurrence(
        entry: previous.entry,
        slot: StudentScheduleSlot(
          weekday: weekday,
          raw: '$start - $end',
          startTime: start,
          endTime: end,
        ),
      );
    } else {
      merged.add(occurrence);
    }
  }
  return merged;
}

bool scheduleHasEnded(
  StudentScheduleOccurrence occurrence,
  DateTime now, {
  int toleranceMinutes = 0,
}) {
  final end = _dateTimeForToday(occurrence.slot.endTime, now);
  if (end == null) return false;
  final lockAt = end.add(
    Duration(minutes: toleranceMinutes.clamp(0, 120).toInt()),
  );
  return !now.isBefore(lockAt);
}

bool scheduleIsAvailable(
  StudentScheduleOccurrence occurrence,
  DateTime now, {
  int toleranceMinutes = 0,
}) {
  return !scheduleHasEnded(occurrence, now, toleranceMinutes: toleranceMinutes);
}

const _uatDayFields = <int, String>{
  DateTime.monday: 'Txt_Lunes',
  DateTime.tuesday: 'Txt_Martes',
  DateTime.wednesday: 'Txt_Miercoles',
  DateTime.thursday: 'Txt_Jueves',
  DateTime.friday: 'Txt_Viernes',
  DateTime.saturday: 'Txt_Sabado',
  DateTime.sunday: 'Txt_Domingo',
};

List<StudentScheduleSlot> _parseWeeklySlots(Map<String, dynamic> json) {
  final slots = <StudentScheduleSlot>[];
  for (final day in _uatDayFields.entries) {
    final value = json[day.value];
    if (value is! String || value.trim().isEmpty) continue;
    for (final part in value.split(RegExp(r'[;\n]+'))) {
      final raw = part.trim();
      if (raw.isEmpty || _emptyScheduleMarker.hasMatch(raw)) continue;
      final matches = _timeRange.allMatches(raw).toList(growable: false);
      if (matches.isEmpty) {
        slots.add(StudentScheduleSlot(weekday: day.key, raw: raw));
      } else {
        for (final match in matches) {
          slots.add(
            StudentScheduleSlot(
              weekday: day.key,
              raw: match.group(0) ?? raw,
              startTime: _normalizeTime(match.group(1)),
              endTime: _normalizeTime(match.group(2)),
            ),
          );
        }
      }
    }
  }
  return List.unmodifiable(slots);
}

final _timeRange = RegExp(
  r'\b(\d{1,2}:\d{2})\s*(?:-|–|—|a)\s*(\d{1,2}:\d{2})\b',
  caseSensitive: false,
);
final _emptyScheduleMarker = RegExp(
  r'^(?:-+|n\/?a|no aplica|sin horario)$',
  caseSensitive: false,
);

String? _readString(Map<String, dynamic> json, List<String> keys) {
  for (final key in keys) {
    final value = json[key];
    if (value is! String && value is! num) continue;
    final normalized = value.toString().trim();
    if (normalized.isNotEmpty) return normalized;
  }
  return null;
}

String? _normalizeTime(String? value) {
  if (value == null) return null;
  final parts = value.split(':');
  if (parts.length != 2) return value;
  return '${parts.first.padLeft(2, '0')}:${parts.last}';
}

String _sortTime(StudentScheduleSlot slot) {
  return slot.startTime ?? '99:99:${slot.raw.toLowerCase()}';
}

String _entryKey(StudentScheduleEntry entry) {
  final groupId = entry.externalGroupId.trim().toLowerCase();
  if (groupId.isNotEmpty) return 'id:$groupId';
  return [
    entry.subject.trim().toLowerCase(),
    entry.classroom?.trim().toLowerCase() ?? '',
    entry.group?.trim().toLowerCase() ?? '',
  ].join('|');
}

String? _firstValue(Iterable<String?> values) {
  for (final value in values) {
    if (value != null && value.trim().isNotEmpty) return value;
  }
  return null;
}

bool _touchesOrOverlaps(StudentScheduleSlot left, StudentScheduleSlot right) {
  if (left.startTime == null ||
      left.endTime == null ||
      right.startTime == null ||
      right.endTime == null) {
    return false;
  }
  return _minutes(right.startTime!) <= _minutes(left.endTime!);
}

String _earlierTime(String left, String right) {
  return _minutes(left) <= _minutes(right) ? left : right;
}

String _laterTime(String left, String right) {
  return _minutes(left) >= _minutes(right) ? left : right;
}

int _minutes(String value) {
  final parts = value.split(':');
  return (int.tryParse(parts.first) ?? 0) * 60 +
      (parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0);
}

DateTime? _dateTimeForToday(String? value, DateTime now) {
  if (value == null) return null;
  final parts = value.split(':');
  if (parts.length != 2) return null;
  final hour = int.tryParse(parts[0]);
  final minute = int.tryParse(parts[1]);
  if (hour == null || minute == null) return null;
  return DateTime(now.year, now.month, now.day, hour, minute);
}

String? _storedString(Object? value) {
  final normalized = value?.toString().trim();
  return normalized == null || normalized.isEmpty ? null : normalized;
}
