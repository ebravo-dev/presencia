import '../../shared/models/alumno.dart';

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

Map<String, dynamic> _asMap(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  return <String, dynamic>{};
}

List<dynamic> _asList(Object? value) {
  if (value is List) return value;
  return const [];
}

String formatUatDate(DateTime date) {
  final day = date.day.toString().padLeft(2, '0');
  final month = date.month.toString().padLeft(2, '0');
  final year = date.year.toString().padLeft(4, '0');
  return '$day/$month/$year';
}

DateTime weekStart(DateTime date) {
  final normalized = DateTime(date.year, date.month, date.day);
  return normalized.subtract(Duration(days: normalized.weekday - 1));
}

String formatUatWeekStart(DateTime date) => formatUatDate(weekStart(date));

class UatSemanaModel {
  final Map<String, dynamic> raw;
  final int? idGrupo;
  final String fecIni;
  final String fecFin;
  final String? periodo;
  final String? semana;

  const UatSemanaModel({
    required this.raw,
    this.idGrupo,
    required this.fecIni,
    required this.fecFin,
    this.periodo,
    this.semana,
  });

  factory UatSemanaModel.fromJson(Map<String, dynamic> json) {
    final periodo = _readString(json, const ['Txt_Periodo', 'Periodo']);
    final datesFromPeriodo = RegExp(
      r'(\d{2}/\d{2}/\d{4})',
    ).allMatches(periodo ?? '').map((match) => match.group(1)!).toList();

    return UatSemanaModel(
      raw: Map<String, dynamic>.from(json),
      idGrupo: _readInt(json, const ['Id_Grupo', 'id_grupo', 'idGrupo']),
      fecIni:
          _readString(json, const [
            'Fec_Ini',
            'fec_ini',
            'FecIni',
            'Fec_Inicio',
          ]) ??
          (datesFromPeriodo.isNotEmpty ? datesFromPeriodo.first : ''),
      fecFin:
          _readString(json, const [
            'Fec_Fin',
            'fec_fin',
            'FecFin',
            'Fec_Termino',
          ]) ??
          (datesFromPeriodo.length > 1 ? datesFromPeriodo[1] : ''),
      periodo: periodo,
      semana: _readString(json, const ['Semana', 'Num_Semana', 'num_semana']),
    );
  }

  bool get isValid => fecIni.isNotEmpty && fecFin.isNotEmpty;
}

class UatAsistenciaAlumnoModel {
  final Map<String, dynamic> raw;
  final int idAlumno;
  final int numeroLista;
  final String? matricula;
  final String nombre;

  const UatAsistenciaAlumnoModel({
    required this.raw,
    required this.idAlumno,
    required this.numeroLista,
    this.matricula,
    required this.nombre,
  });

  factory UatAsistenciaAlumnoModel.fromJson(Map<String, dynamic> json) {
    return UatAsistenciaAlumnoModel(
      raw: Map<String, dynamic>.from(json),
      idAlumno:
          _readInt(json, const ['Id_Alumno', 'id_alumno', 'idAlumno']) ?? 0,
      numeroLista:
          _readInt(json, const ['Num_Lista', 'num_lista', 'numeroLista']) ?? 0,
      matricula: _readString(json, const [
        'Num_Matricula',
        'num_matricula',
        'Matricula',
      ]),
      nombre:
          _readString(json, const [
            'Txt_Alumno',
            'txt_alumno',
            'Nombre',
            'Alumno',
          ]) ??
          'Alumno sin nombre',
    );
  }

  Alumno toAlumno() {
    return Alumno(
      id: idAlumno.toString(),
      matricula: matricula,
      number: numeroLista,
      name: nombre,
    );
  }
}

class UatAsistenciaGrupoModel {
  final Map<String, dynamic> raw;
  final bool exito;
  final String? mensaje;
  final List<UatAsistenciaAlumnoModel> alumnos;

  const UatAsistenciaGrupoModel({
    required this.raw,
    required this.exito,
    this.mensaje,
    required this.alumnos,
  });

  factory UatAsistenciaGrupoModel.fromJson(Map<String, dynamic> json) {
    final rawAlumnos = _asList(
      json['alumnos'] ??
          json['Alumnos'] ??
          json['data'] ??
          json['result'] ??
          json['Result'],
    );

    return UatAsistenciaGrupoModel(
      raw: Map<String, dynamic>.from(json),
      exito: json['exito'] != false,
      mensaje: json['mensaje']?.toString(),
      alumnos: rawAlumnos
          .map(_asMap)
          .where((item) => item.isNotEmpty)
          .map(UatAsistenciaAlumnoModel.fromJson)
          .where((alumno) => alumno.idAlumno > 0)
          .toList(),
    );
  }
}

class UatAsistenciaAlumnoInput {
  final int idAlumno;
  final int numPaseLista;
  final int numDia;
  final bool snAsistencia;

  const UatAsistenciaAlumnoInput({
    required this.idAlumno,
    required this.numPaseLista,
    required this.numDia,
    required this.snAsistencia,
  });

  factory UatAsistenciaAlumnoInput.fromJson(Map<String, dynamic> json) {
    return UatAsistenciaAlumnoInput(
      idAlumno: _readInt(json, const ['id_alumno', 'idAlumno']) ?? 0,
      numPaseLista:
          _readInt(json, const ['num_pase_lista', 'numPaseLista']) ?? 1,
      numDia: _readInt(json, const ['num_dia', 'numDia']) ?? 1,
      snAsistencia:
          json['sn_asistencia'] == true ||
          json['snAsistencia'] == true ||
          json['status'] == 'PRESENT',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id_alumno': idAlumno,
      'num_pase_lista': numPaseLista,
      'num_dia': numDia,
      'sn_asistencia': snAsistencia,
    };
  }
}

class UatGuardaAsistenciasRequest {
  final int idGrupo;
  final String fecIni;
  final List<UatAsistenciaAlumnoInput> asistencia;

  const UatGuardaAsistenciasRequest({
    required this.idGrupo,
    required this.fecIni,
    required this.asistencia,
  });

  Map<String, dynamic> toJson() {
    return {
      'Id_Grupo': idGrupo,
      'Fec_Ini': fecIni,
      'Asistencia': asistencia.map((item) => item.toJson()).toList(),
    };
  }
}
