import '../../shared/models/alumno.dart';
import '../../shared/models/grupo.dart';

int? _readInt(Map<String, dynamic> json, List<String> keys) {
  for (final key in keys) {
    final value = json[key];
    if (value is int) return value;
    if (value is num) return value.toInt();
    if (value is String) {
      final parsed = int.tryParse(value.trim());
      if (parsed != null) return parsed;
    }
  }
  return null;
}

String? _readString(Map<String, dynamic> json, List<String> keys) {
  for (final key in keys) {
    final value = json[key];
    if (value == null) continue;
    final text = value.toString().trim();
    if (text.isNotEmpty) return text;
  }
  return null;
}

String? _extractCode(String? materia) {
  if (materia == null) return null;
  return RegExp(r'^\(([^)]+)\)').firstMatch(materia)?.group(1);
}

String _cleanSubject(String? materia) {
  final value = materia?.trim();
  if (value == null || value.isEmpty) return 'Materia sin nombre';
  return value.replaceFirst(RegExp(r'^\([^)]+\)\s*'), '').trim();
}

String _buildGroupName({
  required String? code,
  required String? letter,
  required int idGrupo,
}) {
  if (code != null && code.isNotEmpty && letter != null && letter.isNotEmpty) {
    return '$code-$letter';
  }
  if (letter != null && letter.isNotEmpty) return letter;
  if (code != null && code.isNotEmpty) return code;
  return idGrupo.toString();
}

class UatHorarioModel {
  final Map<String, dynamic> raw;
  final int idGrupo;
  final String? des;
  final String? nivel;
  final String? ciclo;
  final String? letra;
  final String? materia;
  final String? profesor;
  final String? periodo;
  final String? espacioFisico;
  final Map<String, String?> schedule;

  const UatHorarioModel({
    required this.raw,
    required this.idGrupo,
    this.des,
    this.nivel,
    this.ciclo,
    this.letra,
    this.materia,
    this.profesor,
    this.periodo,
    this.espacioFisico,
    required this.schedule,
  });

  factory UatHorarioModel.fromJson(Map<String, dynamic> json) {
    return UatHorarioModel(
      raw: Map<String, dynamic>.from(json),
      idGrupo: _readInt(json, const ['Id_Grupo', 'idGrupo', 'id_grupo']) ?? 0,
      des: _readString(json, const ['Txt_DES', 'txt_des', 'DES']),
      nivel: _readString(json, const ['Txt_Nombre_Corto', 'txt_nombre_corto']),
      ciclo: _readString(json, const ['Ciclo', 'Txt_Ciclo_Escolar', 'ciclo']),
      letra: _readString(json, const ['Txt_Letra', 'txt_letra', 'Grupo']),
      materia: _readString(json, const [
        'Txt_Materia',
        'txt_materia',
        'Materia',
      ]),
      profesor: _readString(json, const [
        'Txt_Nombre_Profesor',
        'Nombre_Profesor',
        'nombre_profesor',
      ]),
      periodo: _readString(json, const ['Num_Periodo', 'num_periodo']),
      espacioFisico: _readString(json, const [
        'Txt_Espacio_Fisico',
        'txt_espacio_fisico',
        'Txt_Aula',
        'Aula',
      ]),
      schedule: {
        'lunes': _readString(json, const ['Txt_Lunes']),
        'martes': _readString(json, const ['Txt_Martes']),
        'miercoles': _readString(json, const ['Txt_Miercoles']),
        'jueves': _readString(json, const ['Txt_Jueves']),
        'viernes': _readString(json, const ['Txt_Viernes']),
        'sabado': _readString(json, const ['Txt_Sabado']),
        'domingo': _readString(json, const ['Txt_Domingo']),
      },
    );
  }

  UatHorarioModel merge(UatHorarioModel other) {
    if (idGrupo != other.idGrupo) return this;
    final mergedSchedule = <String, String?>{};
    for (final day in {...schedule.keys, ...other.schedule.keys}) {
      mergedSchedule[day] = _mergeScheduleValues(
        schedule[day],
        other.schedule[day],
      );
    }
    return UatHorarioModel(
      raw: {...raw, ...other.raw},
      idGrupo: idGrupo,
      des: des ?? other.des,
      nivel: nivel ?? other.nivel,
      ciclo: ciclo ?? other.ciclo,
      letra: letra ?? other.letra,
      materia: materia ?? other.materia,
      profesor: profesor ?? other.profesor,
      periodo: periodo ?? other.periodo,
      espacioFisico: espacioFisico ?? other.espacioFisico,
      schedule: mergedSchedule,
    );
  }

  Grupo toGrupo({List<Alumno> students = const [], String? professorId}) {
    final code = _extractCode(materia);
    final letter = letra;

    return Grupo(
      id: idGrupo.toString(),
      code: code,
      groupLetter: letter,
      period: ciclo,
      group: _buildGroupName(code: code, letter: letter, idGrupo: idGrupo),
      classroom: espacioFisico ?? '',
      name: _cleanSubject(materia),
      level: des ?? nivel,
      students: students,
      schedule: schedule,
      studentsCount: students.length,
    );
  }
}

String? _mergeScheduleValues(String? left, String? right) {
  final values = [left, right]
      .whereType<String>()
      .expand((value) => value.split(RegExp(r'[;\n]+')))
      .map((value) => value.trim())
      .where((value) => value.isNotEmpty)
      .toSet()
      .toList(growable: false);
  return values.isEmpty ? null : values.join('; ');
}

class UatGrupoModel {
  final Map<String, dynamic> raw;
  final int idGrupo;
  final String? materia;
  final String? letra;
  final String? ciclo;
  final int? idCicloEscolar;
  final int? idDes;

  const UatGrupoModel({
    required this.raw,
    required this.idGrupo,
    this.materia,
    this.letra,
    this.ciclo,
    this.idCicloEscolar,
    this.idDes,
  });

  factory UatGrupoModel.fromJson(Map<String, dynamic> json) {
    return UatGrupoModel(
      raw: Map<String, dynamic>.from(json),
      idGrupo: _readInt(json, const ['Id_Grupo', 'idGrupo', 'id_grupo']) ?? 0,
      materia: _readString(json, const [
        'Materia',
        'Txt_Materia',
        'txt_materia',
      ]),
      letra: _readString(json, const ['Grupo', 'Txt_Letra', 'txt_letra']),
      ciclo: _readString(json, const ['Ciclo', 'Txt_Ciclo_Escolar', 'ciclo']),
      idCicloEscolar: _readInt(json, const [
        'Id_Ciclo_Escolar',
        'Id_Ciclo',
        'id_ciclo',
      ]),
      idDes: _readInt(json, const ['Id_DES', 'Id_Des', 'id_des']),
    );
  }

  Grupo toGrupo({List<Alumno> students = const [], UatHorarioModel? horario}) {
    final rawMateria = materia ?? horario?.materia;
    final code = _extractCode(rawMateria);
    final letter = letra ?? horario?.letra;
    final mergedSchedule = horario?.schedule;

    return Grupo(
      id: idGrupo.toString(),
      code: code ?? _extractCode(horario?.materia),
      groupLetter: letter,
      period: ciclo ?? horario?.ciclo,
      group: _buildGroupName(code: code, letter: letter, idGrupo: idGrupo),
      classroom: horario?.espacioFisico ?? '',
      name: _cleanSubject(rawMateria),
      level: horario?.des ?? horario?.nivel,
      students: students,
      schedule: mergedSchedule,
      studentsCount: students.length,
    );
  }
}
