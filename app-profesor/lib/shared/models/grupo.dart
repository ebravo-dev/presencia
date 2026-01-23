import 'package:json_annotation/json_annotation.dart';
import 'package:equatable/equatable.dart';
import 'alumno.dart';

part 'grupo.g.dart';

@JsonSerializable()
class Grupo extends Equatable {
  final String group;
  final String classroom;
  final String subject;
  final int period;
  final List<Alumno> students;
  final Map<String, String?>? schedule;

  const Grupo({
    required this.group,
    required this.classroom,
    required this.subject,
    required this.period,
    required this.students,
    this.schedule,
  });

  factory Grupo.fromJson(Map<String, dynamic> json) => _$GrupoFromJson(json);

  Map<String, dynamic> toJson() => _$GrupoToJson(this);

  @override
  List<Object?> get props => [
    group,
    classroom,
    subject,
    period,
    students,
    schedule,
  ];

  String get nombre => 'Grupo $group';
  String get materia => subject;
  int get totalAlumnos => students.length;
  String get infoCompleta => '$subject - Grupo $group (Periodo $period)';
  String get aula => classroom;

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

  /// Obtiene el horario (ej: "13:00-14:00") desde el schedule
  /// Usa el primer día que tenga horario disponible
  String? get horario {
    if (schedule == null) {
      print('⚠️ Schedule es NULL para grupo $group');
      return null;
    }

    print('📅 Schedule para grupo $group: $schedule');

    final dias = [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ];
    for (final dia in dias) {
      final horarioDia = schedule![dia];
      print('  - $dia: $horarioDia');
      if (horarioDia != null && horarioDia.isNotEmpty) {
        print('✅ Horario encontrado: $horarioDia');
        return horarioDia;
      }
    }
    print('❌ No se encontró horario en schedule');
    return null;
  }

  /// Obtiene el rango de días (ej: "L-J", "L-V", "Ma,J")
  String? get diasClase {
    if (schedule == null) return null;

    final Map<String, String> diasAbrev = {
      'monday': 'L',
      'tuesday': 'Ma',
      'wednesday': 'Mi',
      'thursday': 'J',
      'friday': 'V',
      'saturday': 'S',
      'sunday': 'D',
    };

    final diasConHorario = <String>[];
    final orden = [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ];

    for (final dia in orden) {
      if (schedule![dia] != null && schedule![dia]!.isNotEmpty) {
        diasConHorario.add(diasAbrev[dia]!);
      }
    }

    if (diasConHorario.isEmpty) return null;
    if (diasConHorario.length == 1) return diasConHorario.first;

    // Si son días consecutivos, usar formato "L-V"
    if (_sonConsecutivos(
      diasConHorario,
      orden.map((d) => diasAbrev[d]!).toList(),
    )) {
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

    final Map<String, int> diaToWeekday = {
      'monday': 1,
      'tuesday': 2,
      'wednesday': 3,
      'thursday': 4,
      'friday': 5,
      'saturday': 6,
      'sunday': 7,
    };

    final weekdays = <int>[];
    schedule!.forEach((dia, horario) {
      if (horario != null && horario.isNotEmpty) {
        weekdays.add(diaToWeekday[dia]!);
      }
    });

    return weekdays;
  }
}
