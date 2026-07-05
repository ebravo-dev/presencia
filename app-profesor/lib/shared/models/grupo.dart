import 'package:json_annotation/json_annotation.dart';
import 'package:equatable/equatable.dart';
import 'alumno.dart';

part 'grupo.g.dart';

@JsonSerializable()
class Grupo extends Equatable {
  final String id;
  final String? code;
  final String? groupLetter; // e.g. "M" — stable server field
  final String? period; // e.g. "2025-1" — stable server field
  final String group;
  final String classroom;
  final String name; // Subject name from API
  final String? level;
  final List<Alumno> students;
  @JsonKey(fromJson: _scheduleFromJson, toJson: _scheduleToJson)
  final Map<String, String?>? schedule;
  @JsonKey(defaultValue: 0)
  final int studentsCount;
  @JsonKey(defaultValue: 'OFFICIAL')
  final String source;
  @JsonKey(defaultValue: false)
  final bool isShared;
  @JsonKey(defaultValue: false)
  final bool isSubstitute;
  final String? sharedAssignmentId;
  final Map<String, dynamic>? primaryProfessor;

  const Grupo({
    required this.id,
    this.code,
    this.groupLetter,
    this.period,
    required this.group,
    required this.classroom,
    required this.name,
    this.level,
    required this.students,
    this.schedule,
    this.studentsCount = 0,
    this.source = 'OFFICIAL',
    this.isShared = false,
    this.isSubstitute = false,
    this.sharedAssignmentId,
    this.primaryProfessor,
  });

  factory Grupo.fromJson(Map<String, dynamic> json) => _$GrupoFromJson(json);

  Map<String, dynamic> toJson() => _$GrupoToJson(this);

  @override
  List<Object?> get props => [
    id,
    code,
    groupLetter,
    period,
    group,
    classroom,
    name,
    level,
    students,
    schedule,
    studentsCount,
    source,
    isShared,
    isSubstitute,
    sharedAssignmentId,
    primaryProfessor,
  ];

  // Compatibility getters
  String get subject => name;
  String get materia => name;
  int get totalAlumnos => students.isNotEmpty ? students.length : studentsCount;
  String get infoCompleta => '$name - Grupo $group';
  String get aula => classroom;
  bool get esCompartida => isShared || isSubstitute || source == 'SHARED';
  String? get profesorTitular => primaryProfessor?['name']?.toString();

  Grupo copyWith({List<Alumno>? students, int? studentsCount}) {
    return Grupo(
      id: id,
      code: code,
      groupLetter: groupLetter,
      period: period,
      group: group,
      classroom: classroom,
      name: name,
      level: level,
      students: students ?? this.students,
      schedule: schedule,
      studentsCount: studentsCount ?? this.studentsCount,
      source: source,
      isShared: isShared,
      isSubstitute: isSubstitute,
      sharedAssignmentId: sharedAssignmentId,
      primaryProfessor: primaryProfessor,
    );
  }

  /// Extrae solo la letra del grupo del string `group` (ej: "RC.06061.2873.5-5-M" -> "M")
  /// Usar `groupLetter` (campo del servidor) cuando esté disponible.
  String get grupoLetra {
    final match = RegExp(r'-([A-Z])$').firstMatch(group);
    return match?.group(1) ?? group;
  }

  /// Genera un identificador único para este grupo basado en salón + materia + grupo
  /// Esto asegura que grupos con la misma letra pero diferente salón/materia
  /// tengan IDs distintos para sus asistencias
  String get identificadorUnico {
    // Normalizar el subject para eliminar caracteres especiales
    final subjectNormalizado = subject
        .replaceAll(RegExp(r'[^a-zA-Z0-9]'), '_')
        .replaceAll(RegExp(r'_+'), '_')
        .toLowerCase();
    final classroomNormalizado = classroom
        .replaceAll(RegExp(r'[^a-zA-Z0-9]'), '_')
        .replaceAll(RegExp(r'_+'), '_')
        .toLowerCase();

    return '${classroomNormalizado}_${subjectNormalizado}_$group';
  }

  /// Días en español e inglés (API puede devolver en cualquiera de los dos)
  static const List<String> _diasEspanol = [
    'lunes',
    'martes',
    'miercoles',
    'jueves',
    'viernes',
    'sabado',
    'domingo',
  ];
  static const List<String> _diasIngles = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];
  static const Map<String, String> _diasAbreviados = {
    'lunes': 'Lun',
    'monday': 'Lun',
    'martes': 'Mar',
    'tuesday': 'Mar',
    'miercoles': 'Mie',
    'wednesday': 'Mie',
    'jueves': 'Jue',
    'thursday': 'Jue',
    'viernes': 'Vie',
    'friday': 'Vie',
    'sabado': 'Sab',
    'saturday': 'Sab',
    'domingo': 'Dom',
    'sunday': 'Dom',
  };
  static const Map<int, String> _weekdayShort = {
    1: 'Lun',
    2: 'Mar',
    3: 'Mie',
    4: 'Jue',
    5: 'Vie',
    6: 'Sab',
    7: 'Dom',
  };
  static const Map<int, String> _weekdayFull = {
    1: 'Lunes',
    2: 'Martes',
    3: 'Miercoles',
    4: 'Jueves',
    5: 'Viernes',
    6: 'Sabado',
    7: 'Domingo',
  };
  static const Map<String, int> _diasToWeekday = {
    'lunes': 1,
    'monday': 1,
    'martes': 2,
    'tuesday': 2,
    'miercoles': 3,
    'wednesday': 3,
    'jueves': 4,
    'thursday': 4,
    'viernes': 5,
    'friday': 5,
    'sabado': 6,
    'saturday': 6,
    'domingo': 7,
    'sunday': 7,
  };

  /// Obtiene el horario (ej: "13:00-14:00") desde el schedule
  /// Usa el primer día que tenga horario disponible
  String? get horario {
    if (schedule == null) {
      return null;
    }

    // Buscar en días español e inglés
    final todosLosDias = [..._diasEspanol, ..._diasIngles];
    for (final dia in todosLosDias) {
      final horarioDia = schedule![dia];
      if (horarioDia != null && horarioDia.isNotEmpty) {
        return horarioDia;
      }
    }
    return null;
  }

  /// Obtiene el rango de días (ej: "L-J", "L-V", "Ma,J")
  String? get diasClase {
    if (schedule == null) return null;

    final diasConHorario = <String>[];
    // Orden de días de la semana (usamos español como referencia)
    final ordenDias = [1, 2, 3, 4, 5, 6, 7]; // L, Ma, Mi, J, V, S, D

    // Recopilar todos los días que tienen horario
    final diasEncontrados = <int, String>{};
    schedule!.forEach((dia, horarioVal) {
      if (horarioVal != null && horarioVal.isNotEmpty) {
        final weekday = _diasToWeekday[dia.toLowerCase()];
        if (weekday != null) {
          diasEncontrados[weekday] = _diasAbreviados[dia.toLowerCase()] ?? dia;
        }
      }
    });

    // Ordenar por weekday
    for (final wd in ordenDias) {
      if (diasEncontrados.containsKey(wd)) {
        diasConHorario.add(diasEncontrados[wd]!);
      }
    }

    if (diasConHorario.isEmpty) return null;
    if (diasConHorario.length == 1) return diasConHorario.first;

    // Si son días consecutivos, usar formato "L-V"
    final ordenAbrev = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
    if (_sonConsecutivos(diasConHorario, ordenAbrev)) {
      return '${diasConHorario.first}-${diasConHorario.last}';
    }

    // Si no son consecutivos, listar separados por coma
    return diasConHorario.join(',');
  }

  /// Verifica si los días son consecutivos
  bool _sonConsecutivos(List<String> diasAbrev, List<String> ordenSemana) {
    if (diasAbrev.length <= 1) return true;

    final indices = diasAbrev.map((d) => ordenSemana.indexOf(d)).toList();
    indices.sort();

    for (int i = 1; i < indices.length; i++) {
      if (indices[i] != indices[i - 1] + 1) {
        return false;
      }
    }
    return true;
  }

  /// Obtiene los weekdays (1=Monday, 7=Sunday) de los días con clase
  List<int> get weekdaysConClase {
    if (schedule == null) return [];

    final weekdays = <int>[];
    schedule!.forEach((dia, horarioVal) {
      if (horarioVal != null && horarioVal.isNotEmpty) {
        final weekday = _diasToWeekday[dia.toLowerCase()];
        if (weekday != null && !weekdays.contains(weekday)) {
          weekdays.add(weekday);
        }
      }
    });

    weekdays.sort();
    return weekdays;
  }

  String? get diasClaseAgrupados {
    final weekdays = weekdaysConHorarioValido;
    if (weekdays.isEmpty) return null;
    if (weekdays.length == 1) return _weekdayFull[weekdays.first];
    return _formatWeekdayGroups(weekdays, fullSingle: false);
  }

  String? get horarioValido {
    final slots = _scheduleSlotsByWeekday();
    return slots.isEmpty ? null : slots.values.first.time;
  }

  String? get horarioResumen {
    final slots = _scheduleSlotsByWeekday();
    if (slots.isEmpty) return null;

    final byTime = <String, List<int>>{};
    for (final entry in slots.entries) {
      byTime.putIfAbsent(entry.value.time, () => []).add(entry.key);
    }

    final parts = byTime.entries.map((entry) {
      entry.value.sort();
      final days = entry.value.length == 1
          ? _weekdayFull[entry.value.first]!
          : _formatWeekdayGroups(entry.value, fullSingle: false);
      return entry.value.length == 1
          ? '$days ${entry.key}'
          : '$days de ${entry.key}';
    }).toList();

    return parts.join(' · ');
  }

  List<int> get weekdaysConHorarioValido {
    return _scheduleSlotsByWeekday().keys.toList()..sort();
  }

  Map<int, _ScheduleDaySlot> _scheduleSlotsByWeekday() {
    if (schedule == null) return {};

    final slots = <int, _ScheduleDaySlot>{};
    schedule!.forEach((dia, horarioVal) {
      final weekday = _diasToWeekday[dia.toLowerCase()];
      final time = _normalizeScheduleTime(horarioVal);
      if (weekday != null && time != null) {
        slots[weekday] = _ScheduleDaySlot(weekday, time);
      }
    });

    return Map.fromEntries(
      slots.entries.toList()..sort((a, b) => a.key.compareTo(b.key)),
    );
  }

  static String _formatWeekdayGroups(
    List<int> weekdays, {
    required bool fullSingle,
  }) {
    final sorted = [...weekdays]..sort();
    final groups = <String>[];
    var index = 0;

    while (index < sorted.length) {
      final start = sorted[index];
      var end = start;
      while (index + 1 < sorted.length && sorted[index + 1] == end + 1) {
        index++;
        end = sorted[index];
      }

      if (start == end) {
        groups.add(fullSingle ? _weekdayFull[start]! : _weekdayShort[start]!);
      } else {
        groups.add('${_weekdayShort[start]}-${_weekdayShort[end]}');
      }
      index++;
    }

    return groups.join(', ');
  }

  static String? _normalizeScheduleTime(String? rawValue) {
    final raw = rawValue?.trim();
    if (raw == null || raw.isEmpty || _isEmptyScheduleMarker(raw)) {
      return null;
    }

    final firstSlot = raw
        .split(RegExp(r'[;\n]+'))
        .map((value) => value.trim())
        .firstWhere(
          (value) => value.isNotEmpty && !_isEmptyScheduleMarker(value),
          orElse: () => '',
        );
    if (firstSlot.isEmpty) return null;

    final match = RegExp(
      r'(\d{1,2}:\d{2})\s*(?:-|a)\s*(\d{1,2}:\d{2})',
      caseSensitive: false,
    ).firstMatch(firstSlot);
    if (match == null) return firstSlot;
    return '${_padTime(match.group(1)!)}-${_padTime(match.group(2)!)}';
  }

  static bool _isEmptyScheduleMarker(String value) {
    return RegExp(
      r'^(?:-+|n/?a|no aplica|sin horario)$',
      caseSensitive: false,
    ).hasMatch(value.trim());
  }

  static String _padTime(String value) {
    final parts = value.split(':');
    return '${parts[0].padLeft(2, '0')}:${parts[1]}';
  }
}

class _ScheduleDaySlot {
  final int weekday;
  final String time;

  const _ScheduleDaySlot(this.weekday, this.time);
}

Map<String, String?>? _scheduleFromJson(Object? value) {
  if (value is! Map) return null;
  return value.map(
    (key, rawValue) => MapEntry(key.toString(), _scheduleValue(rawValue)),
  );
}

Map<String, String?>? _scheduleToJson(Map<String, String?>? value) => value;

String? _scheduleValue(Object? value) {
  if (value == null) return null;
  if (value is String) return value;
  if (value is! List) return value.toString();

  final slots = value
      .map((slot) {
        if (slot is String) return slot.trim();
        if (slot is! Map) return '';
        final raw = slot['raw']?.toString().trim();
        if (raw != null && raw.isNotEmpty) return raw;
        final start = slot['startTime']?.toString();
        final end = slot['endTime']?.toString();
        return start != null && end != null ? '$start-$end' : '';
      })
      .where((slot) => slot.isNotEmpty)
      .toList();
  return slots.isEmpty ? null : slots.join('; ');
}
