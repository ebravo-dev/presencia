import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';

import '../core/constants/api_constants.dart';
import '../core/utils/utils.dart';
import '../data/models/uat_asistencia_model.dart';
import '../data/models/uat_horario_model.dart';
import '../services/auth_storage_service.dart';
import '../shared/models/alumno.dart';
import '../shared/models/grupo.dart';
import '../shared/models/profesor.dart';
import '../shared/models/sync_status.dart';

class ApiService {
  late final Dio _presenceDio;

  /// Callback que se dispara cuando el servidor retorna 401.
  void Function()? onSessionExpired;

  ApiService({this.onSessionExpired}) {
    _presenceDio = Dio(
      BaseOptions(
        baseUrl: ApiConstants.presenceApiBaseUrl,
        headers: const {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        connectTimeout: Duration(
          milliseconds: ApiConstants.presenceTimeoutDuration,
        ),
        receiveTimeout: Duration(
          milliseconds: ApiConstants.presenceTimeoutDuration,
        ),
        sendTimeout: Duration(
          milliseconds: ApiConstants.presenceTimeoutDuration,
        ),
      ),
    );

    _presenceDio.interceptors.add(
      InterceptorsWrapper(
        onError: (DioException error, ErrorInterceptorHandler handler) {
          if (error.response?.statusCode == 401) {
            onSessionExpired?.call();
          }
          handler.next(error);
        },
      ),
    );
  }

  /// El backend nuevo recibe la contrasena original y administra las cookies
  /// ASP.NET en su propio Cookie Jar. Se conserva el nombre por compatibilidad.
  String encryptPassword(String password) => password;

  bool isLikelyEncrypted(String value) {
    if (value.length < 80) return false;
    final base64Regex = RegExp(r'^[A-Za-z0-9+/=]+$');
    return base64Regex.hasMatch(value);
  }

  String ensureEncryptedPassword(String value) => value;

  bool get _usesBackendApiRest {
    final uri = Uri.tryParse(ApiConstants.presenceApiBaseUrl);
    if (uri == null) return false;
    return uri.host.contains('backendapirest') || uri.port == 3100;
  }

  Future<Either<String, LoginResponse>> loginProfesor({
    required String email,
    required String password,
  }) async {
    if (_usesBackendApiRest) {
      return _loginProfesorViaBackendApiRest(email: email, password: password);
    }

    try {
      Logger.info('Intentando login contra backend principal para: $email');

      final response = await _presenceDio.post(
        ApiConstants.login,
        data: {'institutionalEmail': email, 'encryptedPassword': password},
      );

      return Right(LoginResponse.fromJson(response.data));
    } on DioException catch (e) {
      final errorMessage = _handleDioError(e);
      Logger.error('Error de conexion en login: $errorMessage', e);
      return Left(errorMessage);
    } catch (e, stackTrace) {
      Logger.error('Error inesperado en login', e, stackTrace);
      return Left(_cleanException(e));
    }
  }

  Future<Either<String, LoginResponse>> _loginProfesorViaBackendApiRest({
    required String email,
    required String password,
  }) async {
    try {
      Logger.info('Intentando login UAT contra backend-apirest para: $email');

      final response = await _presenceDio.post(
        ApiConstants.uatSessions,
        data: {'username': email, 'password': password},
      );
      final data = _asMap(response.data);
      final login = _asMap(data['login']);
      final parametros = _asMap(login['parametros']);
      final sessionId = data['sessionId']?.toString() ?? '';
      final authenticated = data['authenticated'] == true;
      final message =
          login['mensaje']?.toString() ?? 'Sesion UAT creada correctamente';

      if (sessionId.isEmpty || !authenticated) {
        return Left(message);
      }

      final profesor = Profesor(
        id:
            parametros['Id_Plantilla_AdmonUAT']?.toString() ??
            parametros['Id_Usuario_AdmonUAT']?.toString() ??
            email,
        name:
            parametros['Txt_Usuario_AdmonUAT']?.toString() ??
            email.split('@').first,
        institutionalEmail: email,
      );

      return Right(
        LoginResponse(
          message: message,
          profesor: profesor,
          token: sessionId,
          currentPeriod: ApiConstants.uatDefaultIdCiclo.toString(),
          needsSync: true,
        ),
      );
    } on DioException catch (e) {
      final errorMessage = _handleDioError(e);
      Logger.error('Error de conexion en login UAT: $errorMessage', e);
      return Left(errorMessage);
    } catch (e, stackTrace) {
      Logger.error('Error inesperado en login UAT', e, stackTrace);
      return Left(_cleanException(e));
    }
  }

  Future<Either<String, LoginResponse>> loginProfesorWithEncryptedPassword({
    required String email,
    required String encryptedPassword,
  }) {
    return loginProfesor(email: email, password: encryptedPassword);
  }

  /// Obtiene las clases asignadas al profesor autenticado
  /// Usa el backend principal como gateway hacia backend-apirest.
  /// Retorna tupla (grupos, beacons) donde beacons es la lista cruda del server
  Future<
    Either<String, ({List<Grupo> grupos, List<Map<String, dynamic>> beacons})>
  >
  getGruposProfesor(String token) async {
    if (_usesBackendApiRest) {
      return _getGruposProfesorViaBackendApiRest(token);
    }

    try {
      Logger.info('Obteniendo clases del profesor desde backend principal');

      final response = await _presenceDio.get(
        ApiConstants.classes,
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );
      final data = response.data['data'] as List<dynamic>? ?? [];
      final beaconsData = response.data['beacons'] as List<dynamic>? ?? [];
      final grupos = data
          .map((item) => Grupo.fromJson(Map<String, dynamic>.from(item as Map)))
          .toList();
      final beacons = beaconsData
          .map((item) => Map<String, dynamic>.from(item as Map))
          .toList();

      Logger.info(
        'Clases obtenidas: ${grupos.length}, Beacons: ${beacons.length}',
      );
      return Right((grupos: grupos, beacons: beacons));
    } on DioException catch (e) {
      final errorMessage = _handleDioError(e);
      Logger.error('Error de conexión obteniendo clases: $errorMessage', e);
      return Left(errorMessage);
    } catch (e) {
      Logger.error('Error inesperado obteniendo clases', e);
      return Left('Error inesperado: ${e.toString()}');
    }
  }

  Future<
    Either<String, ({List<Grupo> grupos, List<Map<String, dynamic>> beacons})>
  >
  _getGruposProfesorViaBackendApiRest(String sessionId) async {
    try {
      Logger.info('Obteniendo clases UAT desde backend-apirest');

      final profesor = AuthStorageService().getProfesor();
      final idPlantilla = int.tryParse(profesor?.id ?? '');
      if (idPlantilla == null || idPlantilla <= 0) {
        return const Left('No se encontro el Id_Plantilla del profesor.');
      }

      final requestOptions = Options(headers: {'X-UAT-Session-Id': sessionId});
      final horariosResponse = await _presenceDio.get(
        ApiConstants.uatHorarios,
        queryParameters: {
          'Id_Ciclo_Escolar': ApiConstants.uatDefaultIdCiclo,
          'Id_DES': ApiConstants.uatDefaultIdDes,
        },
        options: requestOptions,
      );
      final gruposResponse = await _presenceDio.get(
        ApiConstants.uatControlGrupos,
        queryParameters: {
          'Id_Des': ApiConstants.uatDefaultIdDes,
          'Id_Ciclo': ApiConstants.uatDefaultIdCiclo,
          'Id_Plantilla': idPlantilla,
        },
        options: requestOptions,
      );

      final horarios = _dataList(horariosResponse.data)
          .map((item) => UatHorarioModel.fromJson(_asMap(item)))
          .where((item) => item.idGrupo > 0)
          .toList();
      final horariosByGrupo = {
        for (final horario in horarios) horario.idGrupo: horario,
      };
      final gruposPortal = _dataList(gruposResponse.data)
          .map((item) => UatGrupoModel.fromJson(_asMap(item)))
          .where((item) => item.idGrupo > 0)
          .toList();

      final grupos = <Grupo>[];
      for (final grupoPortal in gruposPortal) {
        final students = await _loadAlumnosForGroup(
          sessionId: sessionId,
          idGrupo: grupoPortal.idGrupo,
        );
        grupos.add(
          grupoPortal.toGrupo(
            students: students,
            horario: horariosByGrupo[grupoPortal.idGrupo],
          ),
        );
      }

      var sharedGroups = <Grupo>[];
      try {
        final sharedResponse = await _presenceDio.get(
          ApiConstants.uatSharedClasses,
          queryParameters: {
            'year': ApiConstants.uatAcademicYear,
            'term': ApiConstants.uatAcademicTerm,
          },
          options: requestOptions,
        );
        sharedGroups = _dataList(
          sharedResponse.data,
        ).map((item) => Grupo.fromJson(_asMap(item))).toList();
      } on DioException catch (error) {
        Logger.error('No se pudieron cargar las clases compartidas', error);
      }
      for (final sharedGroup in sharedGroups) {
        final idGrupo = int.tryParse(sharedGroup.id);
        final students = idGrupo == null
            ? const <Alumno>[]
            : await _loadAlumnosForGroup(
                sessionId: sessionId,
                idGrupo: idGrupo,
              );
        grupos.add(
          sharedGroup.copyWith(
            students: students,
            studentsCount: students.length,
          ),
        );
      }

      Logger.info(
        'Clases obtenidas: ${gruposPortal.length} oficiales y ${sharedGroups.length} compartidas',
      );
      return Right((grupos: grupos, beacons: const <Map<String, dynamic>>[]));
    } on DioException catch (e) {
      final errorMessage = _handleDioError(e);
      Logger.error('Error de conexion obteniendo clases UAT: $errorMessage', e);
      return Left(errorMessage);
    } catch (e, stackTrace) {
      Logger.error('Error inesperado obteniendo clases UAT', e, stackTrace);
      return Left(_cleanException(e));
    }
  }

  Future<List<Alumno>> _loadAlumnosForGroup({
    required String sessionId,
    required int idGrupo,
  }) async {
    try {
      final requestOptions = Options(headers: {'X-UAT-Session-Id': sessionId});
      final semanasResponse = await _presenceDio.get(
        ApiConstants.uatControlSemanas,
        queryParameters: {'Id_Grupo': idGrupo},
        options: requestOptions,
      );
      final semanas = _dataList(semanasResponse.data)
          .map((item) => UatSemanaModel.fromJson(_asMap(item)))
          .where((item) => item.isValid)
          .toList();

      for (final semana in semanas) {
        final asistenciaResponse = await _presenceDio.get(
          ApiConstants.uatControlAsistenciaGrupo,
          queryParameters: {
            'Id_Grupo': idGrupo,
            'fec_ini': semana.fecIni,
            'fec_fin': semana.fecFin,
          },
          options: requestOptions,
        );
        final envelope = _asMap(asistenciaResponse.data);
        final data = _asMap(envelope['data']);
        final asistencia = UatAsistenciaGrupoModel.fromJson(
          data.isNotEmpty ? data : envelope,
        );
        if (asistencia.alumnos.isNotEmpty) {
          return asistencia.alumnos.map((alumno) => alumno.toAlumno()).toList();
        }
      }
    } catch (e, stackTrace) {
      Logger.error(
        'No se pudieron cargar alumnos del grupo $idGrupo',
        e,
        stackTrace,
      );
    }

    return const [];
  }

  /// Fuerza la sincronizacion de grupos desde el backend principal.
  /// Endpoint: POST /professors/sync
  Future<Either<String, String>> forceSync({
    required String email,
    required String encryptedPassword,
    required String token,
  }) async {
    if (_usesBackendApiRest) {
      final groups = await getGruposProfesor(token);
      return groups.fold(
        (error) => Left(error),
        (data) => Right(
          'Sincronizacion completada. ${data.grupos.length} clases cargadas.',
        ),
      );
    }

    try {
      Logger.info('Sincronizando datos desde backend principal: $email');
      final response = await _presenceDio.post(
        ApiConstants.sync,
        data: {
          'institutionalEmail': email,
          'encryptedPassword': encryptedPassword,
        },
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );
      return Right(
        response.data['message']?.toString() ?? 'Sincronización iniciada',
      );
    } on DioException catch (e) {
      final errorMessage = _handleDioError(e);
      Logger.error('Error de conexion en sincronizacion: $errorMessage', e);
      return Left(errorMessage);
    } catch (e, stackTrace) {
      Logger.error('Error inesperado en sincronizacion', e, stackTrace);
      return Left(_cleanException(e));
    }
  }

  Future<Either<String, SyncStatusResponse>> getSyncStatus(String token) async {
    return Right(
      SyncStatusResponse(
        status: 'COMPLETED',
        step: 5,
        totalSteps: 5,
        stepDescription: 'Datos disponibles desde backend principal',
        percentage: 100,
        message: 'Sincronizacion completada',
        completedAt: DateTime.now(),
      ),
    );
  }

  Future<Either<String, Map<String, dynamic>>> getSyncStatusV2(
    String token,
  ) async {
    return Right({
      'hasSync': true,
      'status': 'COMPLETED',
      'step': 5,
      'totalSteps': 5,
      'percentage': 100,
      'message': 'Datos disponibles desde backend principal',
      'retryAvailable': false,
    });
  }

  Future<Either<String, Map<String, dynamic>>> uploadAttendance({
    required String token,
    required String code,
    required String groupLetter,
    required String period,
    required DateTime date,
    required List<Map<String, dynamic>> attendances,
    required String encryptedPassword,
    DateTime? professorEntryAt,
    DateTime? professorExitAt,
    String? groupId,
    bool forceUpload = false,
  }) async {
    if (_usesBackendApiRest) {
      return _uploadAttendanceViaBackendApiRest(
        token: token,
        groupId: groupId,
        code: code,
        date: date,
        attendances: attendances,
        professorEntryAt: professorEntryAt,
        professorExitAt: professorExitAt,
      );
    }

    try {
      final response = await _presenceDio.post(
        ApiConstants.attendance,
        data: {
          'code': code,
          'groupLetter': groupLetter,
          'period': period,
          'date':
              '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}',
          'encryptedPassword': encryptedPassword,
          'forceUpload': forceUpload,
          if (professorEntryAt != null)
            'professorEntryAt': professorEntryAt.toIso8601String(),
          if (professorExitAt != null)
            'professorExitAt': professorExitAt.toIso8601String(),
          'attendances': _normalizeAttendancesForBackend(attendances),
        },
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );

      return Right(Map<String, dynamic>.from(response.data as Map));
    } on DioException catch (e) {
      final errorMessage = _handleDioError(e);
      Logger.error('Error de conexion subiendo asistencia: $errorMessage', e);
      return Left(errorMessage);
    } catch (e, stackTrace) {
      Logger.error('Error inesperado subiendo asistencia', e, stackTrace);
      return Left(_cleanException(e));
    }
  }

  Future<Either<String, Map<String, dynamic>>>
  _uploadAttendanceViaBackendApiRest({
    required String token,
    String? groupId,
    required String code,
    required DateTime date,
    required List<Map<String, dynamic>> attendances,
    DateTime? professorEntryAt,
    DateTime? professorExitAt,
  }) async {
    try {
      final idGrupo = int.tryParse(groupId ?? '') ?? int.tryParse(code);
      if (idGrupo == null || idGrupo <= 0) {
        return const Left('No se pudo identificar el grupo UAT.');
      }

      final asistencia = <Map<String, dynamic>>[];
      for (final entry in attendances.asMap().entries) {
        final item = entry.value;
        final idAlumno =
            int.tryParse(
              item['id_alumno']?.toString() ??
                  item['idAlumno']?.toString() ??
                  item['studentId']?.toString() ??
                  item['id']?.toString() ??
                  '',
            ) ??
            0;
        if (idAlumno <= 0) continue;
        asistencia.add({
          'id_alumno': idAlumno,
          'num_pase_lista':
              int.tryParse(item['num_pase_lista']?.toString() ?? '') ??
              int.tryParse(item['numPaseLista']?.toString() ?? '') ??
              entry.key + 1,
          'num_dia':
              int.tryParse(item['num_dia']?.toString() ?? '') ?? date.weekday,
          'sn_asistencia':
              item['sn_asistencia'] == true ||
              item['snAsistencia'] == true ||
              item['present'] == true ||
              item['isPresent'] == true ||
              item['status']?.toString() == 'PRESENT' ||
              item['status']?.toString() == 'LATE',
        });
      }

      if (asistencia.isEmpty) {
        return const Left('No hay alumnos validos para subir asistencia.');
      }

      final response = await _presenceDio.post(
        ApiConstants.uatAsistenciaGuardar,
        data: {
          'Id_Grupo': idGrupo,
          'Fec_Ini': formatUatWeekStart(date),
          if (professorEntryAt != null)
            'ProfessorEntryAt': professorEntryAt.toIso8601String(),
          if (professorExitAt != null)
            'ProfessorExitAt': professorExitAt.toIso8601String(),
          'Asistencia': asistencia,
        },
        options: Options(headers: {'X-UAT-Session-Id': token}),
      );

      return Right(_asMap(response.data));
    } on DioException catch (e) {
      final errorMessage = _handleDioError(e);
      Logger.error('Error subiendo asistencia UAT: $errorMessage', e);
      return Left(errorMessage);
    } catch (e, stackTrace) {
      Logger.error('Error inesperado subiendo asistencia UAT', e, stackTrace);
      return Left(_cleanException(e));
    }
  }

  List<Map<String, dynamic>> _normalizeAttendancesForBackend(
    List<Map<String, dynamic>> attendances,
  ) {
    return attendances
        .map((attendance) {
          final rawStatus = attendance['status'];
          final present = attendance['sn_asistencia'] == true;
          return {
            'studentId':
                attendance['studentId']?.toString() ??
                attendance['id']?.toString() ??
                attendance['id_alumno']?.toString(),
            'status': rawStatus?.toString() ?? (present ? 'PRESENT' : 'ABSENT'),
          };
        })
        .where((attendance) {
          final studentId = attendance['studentId']?.toString();
          return studentId != null && studentId.isNotEmpty;
        })
        .toList();
  }

  Future<Map<String, bool>> checkSyncedRecords({
    required String token,
    required List<Map<String, String>> records,
  }) async {
    final statuses = await checkSyncedRecordsStatus(
      token: token,
      records: records,
    );
    return statuses.map((key, value) => MapEntry(key, value == 'COMPLETED'));
  }

  Future<Map<String, String>> checkSyncedRecordsStatus({
    required String token,
    required List<Map<String, String>> records,
  }) async {
    if (records.isEmpty) return {};

    try {
      final response = await _presenceDio.post(
        '/attendance/check-synced',
        data: {'records': records},
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );

      final data = response.data['data'] as List<dynamic>? ?? [];
      final statuses = <String, String>{};
      for (final item in data) {
        final map = Map<String, dynamic>.from(item as Map);
        final groupId = map['groupId']?.toString();
        final date = map['date']?.toString();
        final status = map['status']?.toString();
        if (groupId == null || date == null || status == null) continue;
        statuses['${groupId}_$date'] = status;
      }
      return statuses;
    } catch (e, stackTrace) {
      Logger.error(
        'Error verificando asistencias sincronizadas',
        e,
        stackTrace,
      );
      return {};
    }
  }

  String _cleanException(Object error) {
    final message = error.toString();
    return message.startsWith('Exception: ')
        ? message.substring('Exception: '.length)
        : message;
  }

  Map<String, dynamic> _asMap(Object? value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) return Map<String, dynamic>.from(value);
    return <String, dynamic>{};
  }

  List<dynamic> _dataList(Object? value) {
    final envelope = _asMap(value);
    final data = envelope['data'];
    if (data is List) return data;
    if (value is List) return value;
    return const [];
  }

  Future<Either<String, List<Map<String, dynamic>>>> resolveClassroomBeacons({
    required List<String> classrooms,
  }) async {
    try {
      final normalizedClassrooms = classrooms
          .map((classroom) => classroom.trim().toUpperCase())
          .where((classroom) => classroom.isNotEmpty)
          .toSet()
          .toList();

      if (normalizedClassrooms.isEmpty) return const Right([]);

      final response = await _presenceDio.post(
        '/api/beacons/resolve',
        data: {'classrooms': normalizedClassrooms},
      );

      if (response.statusCode == 200) {
        final data = response.data['data'] as List<dynamic>? ?? [];
        return Right(
          data.map((item) => Map<String, dynamic>.from(item as Map)).toList(),
        );
      }

      return Left(response.data['message'] ?? 'Error obteniendo beacons');
    } on DioException catch (e) {
      final errorMessage = _handleDioError(e);
      Logger.error('Error obteniendo beacons de salones: $errorMessage', e);
      return Left(errorMessage);
    } catch (e, stackTrace) {
      Logger.error('Error inesperado obteniendo beacons', e, stackTrace);
      return Left('Error inesperado: ${e.toString()}');
    }
  }

  Future<Either<String, List<Map<String, dynamic>>>>
  resolveStudentDeviceBindings({required List<String> matriculas}) async {
    try {
      final normalizedMatriculas = matriculas
          .map((matricula) => matricula.trim().toUpperCase())
          .where((matricula) => matricula.isNotEmpty)
          .toSet()
          .toList();

      if (normalizedMatriculas.isEmpty) return const Right([]);

      final response = await _presenceDio.post(
        '/api/student-device-bindings/resolve',
        data: {'matriculas': normalizedMatriculas},
      );

      if (response.statusCode == 200) {
        final data = response.data['data'] as List<dynamic>? ?? [];
        return Right(
          data.map((item) => Map<String, dynamic>.from(item as Map)).toList(),
        );
      }

      return Left(response.data['message'] ?? 'Error obteniendo UUIDs');
    } on DioException catch (e) {
      final errorMessage = _handleDioError(e);
      Logger.error('Error obteniendo UUIDs de alumnos: $errorMessage', e);
      return Left(errorMessage);
    } catch (e, stackTrace) {
      Logger.error(
        'Error inesperado resolviendo UUIDs de alumnos',
        e,
        stackTrace,
      );
      return Left('Error inesperado: ${e.toString()}');
    }
  }

  Future<Either<String, Map<String, dynamic>>> recordProfessorBeaconEntry({
    required String token,
    required String code,
    required String groupLetter,
    required String period,
    required DateTime detectedAt,
    required String beaconUuid,
    int? rssi,
    double? distance,
    String? bluetoothAddress,
  }) async {
    try {
      final response = await _presenceDio.post(
        '/attendance/professor-entry',
        data: {
          'code': code,
          'groupLetter': groupLetter,
          'period': period,
          'date':
              '${detectedAt.year.toString().padLeft(4, '0')}-${detectedAt.month.toString().padLeft(2, '0')}-${detectedAt.day.toString().padLeft(2, '0')}',
          'detectedAt': detectedAt.toIso8601String(),
          'beaconUuid': beaconUuid,
          if (rssi != null) 'rssi': rssi,
          if (distance != null) 'distance': distance,
          if (bluetoothAddress != null) 'bluetoothAddress': bluetoothAddress,
        },
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        return Right(response.data as Map<String, dynamic>);
      }

      return Left(response.data['message'] ?? 'Error registrando entrada');
    } on DioException catch (e) {
      final errorMessage = _handleDioError(e);
      Logger.error('Error registrando entrada por beacon: $errorMessage', e);
      return Left(errorMessage);
    } catch (e, stackTrace) {
      Logger.error(
        'Error inesperado registrando entrada por beacon',
        e,
        stackTrace,
      );
      return Left('Error inesperado: ${e.toString()}');
    }
  }

  Future<Either<String, Map<String, dynamic>>> recordStudentBeaconDetections({
    required String token,
    required String code,
    required String groupLetter,
    required String period,
    required DateTime date,
    required List<Map<String, dynamic>> detections,
  }) async {
    try {
      final formattedDate =
          '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

      final response = await _presenceDio.post(
        '/attendance/student-beacon-detections',
        data: {
          'code': code,
          'groupLetter': groupLetter,
          'period': period,
          'date': formattedDate,
          'detections': detections,
        },
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        return Right(response.data as Map<String, dynamic>);
      }

      return Left(
        response.data['message'] ?? 'Error registrando beacons de alumnos',
      );
    } on DioException catch (e) {
      final errorMessage = _handleDioError(e);
      Logger.error('Error registrando beacons de alumnos: $errorMessage', e);
      return Left(errorMessage);
    } catch (e, stackTrace) {
      Logger.error(
        'Error inesperado registrando beacons de alumnos',
        e,
        stackTrace,
      );
      return Left('Error inesperado: ${e.toString()}');
    }
  }

  Future<Either<String, List<Map<String, dynamic>>>> getStudentBeaconBindings({
    required String token,
    required String code,
    required String groupLetter,
    required String period,
  }) async {
    try {
      final response = await _presenceDio.post(
        '/attendance/student-beacon-bindings',
        data: {'code': code, 'groupLetter': groupLetter, 'period': period},
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );

      if (response.statusCode == 200) {
        final data = response.data['data'] as List<dynamic>? ?? [];
        return Right(
          data.map((item) => Map<String, dynamic>.from(item as Map)).toList(),
        );
      }

      return Left(response.data['message'] ?? 'Error obteniendo UUIDs');
    } on DioException catch (e) {
      final errorMessage = _handleDioError(e);
      Logger.error('Error obteniendo UUIDs de alumnos: $errorMessage', e);
      return Left(errorMessage);
    } catch (e, stackTrace) {
      Logger.error(
        'Error inesperado obteniendo UUIDs de alumnos',
        e,
        stackTrace,
      );
      return Left('Error inesperado: ${e.toString()}');
    }
  }

  /// Maneja errores de Dio y devuelve mensajes amigables
  String _handleDioError(DioException e) {
    final data = e.response?.data;
    String? serverMessage;
    if (data is Map) {
      serverMessage =
          data['message']?.toString() ??
          data['mensaje']?.toString() ??
          data['error']?.toString();
    }

    switch (e.type) {
      case DioExceptionType.connectionTimeout:
        return 'No se pudo conectar al servidor. Verifica tu conexion a internet.';
      case DioExceptionType.sendTimeout:
        return 'El tiempo de espera se agoto. Verifica tu conexion a internet.';
      case DioExceptionType.receiveTimeout:
        return 'El servidor tardo demasiado en responder. Intenta de nuevo mas tarde.';
      case DioExceptionType.badResponse:
        switch (e.response?.statusCode) {
          case 400:
            return serverMessage ?? 'Los datos enviados no son validos.';
          case 401:
            return serverMessage ??
                'Sesion expirada. Ingresa nuevamente tus credenciales.';
          case 403:
            return 'No tienes permisos para realizar esta accion.';
          case 404:
            return 'No se encontro el recurso solicitado.';
          case 409:
            return serverMessage ??
                'Ya hay una operacion en proceso para esta asistencia.';
          case 500:
            return serverMessage ??
                'El servidor esta experimentando problemas. Intenta mas tarde.';
          case 502:
          case 503:
            return 'El servidor no esta disponible en este momento. Intenta de nuevo mas tarde.';
          case 504:
            return 'El servidor tardo demasiado en responder. Intenta de nuevo.';
          default:
            return serverMessage ??
                'Ocurrio un problema con el servidor. Intenta de nuevo mas tarde.';
        }
      case DioExceptionType.cancel:
        return 'La solicitud fue cancelada.';
      case DioExceptionType.connectionError:
        return 'No se pudo conectar al servidor. Verifica tu conexion a internet.';
      default:
        return 'Ocurrio un problema de conexion. Verifica tu internet e intenta de nuevo.';
    }
  }
}
