import '../../core/constants/api_constants.dart';
import '../../core/utils/utils.dart';
import '../../domain/repositories/i_uat_repository.dart';
import '../../shared/models/alumno.dart';
import '../../shared/models/asistencia_registro.dart';
import '../../shared/models/grupo.dart';
import '../datasources/uat_local_datasource.dart';
import '../datasources/uat_remote_datasource.dart';
import '../models/uat_asistencia_model.dart';
import '../models/uat_horario_model.dart';

class UatRepositoryImpl implements IUatRepository {
  final UatRemoteDataSource remote;
  final UatLocalDataSource local;
  final int idDes;
  final int idCiclo;

  const UatRepositoryImpl({
    required this.remote,
    required this.local,
    this.idDes = ApiConstants.uatDefaultIdDes,
    this.idCiclo = ApiConstants.uatDefaultIdCiclo,
  });

  @override
  Future<UatLoginResult> iniciarSesion({
    required String email,
    required String password,
  }) async {
    final session = await remote.createSession(
      username: email,
      password: password,
    );
    final profesor = session.toProfesor(fallbackEmail: email);
    final message =
        session.login['mensaje']?.toString() ??
        'Sesion UAT creada correctamente';

    if (session.sessionId.isEmpty || !session.authenticated) {
      throw Exception(message);
    }

    await local.saveSession(sessionId: session.sessionId, profesor: profesor);

    return UatLoginResult(
      sessionId: session.sessionId,
      profesor: profesor,
      message: message,
    );
  }

  @override
  Future<List<Grupo>> sincronizarDatos({required String sessionId}) async {
    final profesor = local.getProfesor();
    final idPlantilla = int.tryParse(profesor?.id ?? '');

    if (idPlantilla == null) {
      throw Exception('No se encontro el Id_Plantilla del profesor.');
    }

    final horariosByGrupo = await _loadHorariosByGrupo();
    final gruposPortal = await remote.getGruposProfesor(
      idDes: idDes,
      idCiclo: idCiclo,
      idPlantilla: idPlantilla,
    );

    final grupos = <Grupo>[];
    for (final grupoPortal in gruposPortal) {
      final alumnos = await _loadAlumnosForGroup(grupoPortal.idGrupo);
      grupos.add(
        grupoPortal.toGrupo(
          students: alumnos,
          horario: horariosByGrupo[grupoPortal.idGrupo],
        ),
      );
    }

    await local.saveGrupos(grupos);
    await local.saveBeacons(const []);
    return grupos;
  }

  Future<Map<int, UatHorarioModel>> _loadHorariosByGrupo() async {
    try {
      final horarios = await remote.getHorarios(
        idCicloEscolar: idCiclo,
        idDes: idDes,
      );
      return {for (final horario in horarios) horario.idGrupo: horario};
    } catch (e, stackTrace) {
      Logger.error(
        'No se pudieron cargar horarios; se continuara con grupos',
        e,
        stackTrace,
      );
      return const {};
    }
  }

  Future<List<Alumno>> _loadAlumnosForGroup(int idGrupo) async {
    try {
      final semanas = await remote.getSemanasGrupo(idGrupo: idGrupo);

      for (final semana in semanas) {
        final asistencia = await remote.getAsistenciaGrupo(
          idGrupo: idGrupo,
          fecIni: semana.fecIni,
          fecFin: semana.fecFin,
        );

        if (asistencia.alumnos.isNotEmpty) {
          return asistencia.alumnos.map((alumno) => alumno.toAlumno()).toList();
        }
      }

      return const [];
    } catch (e, stackTrace) {
      Logger.error(
        'No se pudieron cargar alumnos del grupo $idGrupo',
        e,
        stackTrace,
      );
      return const [];
    }
  }

  @override
  Future<Map<String, dynamic>> guardarAsistencia({
    required String sessionId,
    required Grupo grupo,
    required AsistenciaRegistro registro,
  }) {
    return guardarAsistenciaDirecta(
      sessionId: sessionId,
      groupId: grupo.id,
      date: registro.fecha,
      attendances: _attendanceMapsFromRegistro(registro, grupo),
    );
  }

  @override
  Future<Map<String, dynamic>> guardarAsistenciaDirecta({
    required String sessionId,
    required String groupId,
    required DateTime date,
    required List<Map<String, dynamic>> attendances,
  }) async {
    final idGrupo = int.tryParse(groupId);
    if (idGrupo == null || idGrupo <= 0) {
      throw Exception('No se pudo identificar el grupo UAT.');
    }

    final inputs = attendances
        .map((item) => _toAsistenciaInput(item, date))
        .where((item) => item.idAlumno > 0)
        .toList();

    if (inputs.isEmpty) {
      throw Exception('No hay alumnos validos para registrar asistencia.');
    }

    final response = await remote.guardarAsistencias(
      UatGuardaAsistenciasRequest(
        idGrupo: idGrupo,
        fecIni: formatUatWeekStart(date),
        asistencia: inputs,
      ),
    );

    if (response['exito'] == false) {
      throw Exception(
        response['mensaje']?.toString() ??
            'El portal UAT rechazo la asistencia.',
      );
    }

    return response;
  }

  List<Map<String, dynamic>> _attendanceMapsFromRegistro(
    AsistenciaRegistro registro,
    Grupo grupo,
  ) {
    final studentIdMap = <String, String>{};
    for (final student in grupo.students) {
      if (student.id != null) {
        studentIdMap[student.id!] = student.id!;
        studentIdMap[student.number.toString()] = student.id!;
      }
      if (student.matricula != null) {
        studentIdMap[student.matricula!] = student.id ?? student.matricula!;
      }
    }

    return registro.asistenciasAlumnos.entries
        .map((entry) {
          final idAlumno = studentIdMap[entry.key];
          if (idAlumno == null) return null;
          return {
            'id_alumno': int.tryParse(idAlumno) ?? 0,
            'num_pase_lista': 1,
            'num_dia': registro.fecha.weekday,
            'sn_asistencia': entry.value,
          };
        })
        .whereType<Map<String, dynamic>>()
        .toList();
  }

  UatAsistenciaAlumnoInput _toAsistenciaInput(
    Map<String, dynamic> item,
    DateTime date,
  ) {
    final normalized = Map<String, dynamic>.from(item);

    if (!normalized.containsKey('id_alumno')) {
      normalized['id_alumno'] =
          int.tryParse(normalized['studentId']?.toString() ?? '') ?? 0;
    }
    normalized['num_pase_lista'] ??= 1;
    normalized['num_dia'] ??= date.weekday;
    if (!normalized.containsKey('sn_asistencia')) {
      normalized['sn_asistencia'] =
          normalized['status'] == 'PRESENT' ||
          normalized['present'] == true ||
          normalized['isPresent'] == true;
    }

    return UatAsistenciaAlumnoInput.fromJson(normalized);
  }
}
