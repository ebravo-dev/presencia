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
  return rawItems
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
  return occurrences;
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
      final match = _timeRange.firstMatch(raw);
      slots.add(
        StudentScheduleSlot(
          weekday: day.key,
          raw: raw,
          startTime: match == null ? null : _normalizeTime(match.group(1)),
          endTime: match == null ? null : _normalizeTime(match.group(2)),
        ),
      );
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
