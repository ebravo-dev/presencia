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
  late final Dio _attendanceBackendDio;
  late final Dio _mainBackendDio;

  /// Callback que se dispara cuando el servidor retorna 401.
  void Function()? onSessionExpired;

  ApiService({this.onSessionExpired}) {
    _presenceDio = Dio(
      BaseOptions(
        baseUrl: ApiConstants.baseUrl,
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
    _attendanceBackendDio = Dio(
      BaseOptions(
        baseUrl: ApiConstants.attendanceBackendBaseUrl,
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
    _mainBackendDio = Dio(
      BaseOptions(
        baseUrl: ApiConstants.mainBackendBaseUrl,
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
    return ApiConstants.useBackendApiRest;
  }

  bool get usesBackendApiRest => _usesBackendApiRest;

  bool get _skipApiRestAttendanceUpload {
    // El modo debug ya no se decide en el cliente. El backend principal
    // responde con data.debug=true cuando guarda solo para reportes.
    return false;
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

      final portalMessage = await _syncPortalHistory(
        email: email,
        password: password,
      );

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
          message: portalMessage,
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

  Future<Either<String, String>> syncPortalHistory({
    required String email,
    required String password,
    bool force = false,
  }) async {
    if (!_usesBackendApiRest) {
      return const Right(
        'Los grupos se sincronizan desde el backend principal.',
      );
    }

    try {
      return Right(
        await _syncPortalHistory(
          email: email,
          password: password,
          force: force,
        ),
      );
    } on DioException catch (error) {
      final message = _handleDioError(error);
      Logger.error(
        'Error sincronizando historial con el portal: $message',
        error,
      );
      return Left(message);
    } catch (error, stackTrace) {
      Logger.error(
        'Error inesperado sincronizando historial con el portal',
        error,
        stackTrace,
      );
      return const Left(
        'No pudimos sincronizar tus grupos con el portal. Inténtalo de nuevo.',
      );
    }
  }

  Future<String> _syncPortalHistory({
    required String email,
    required String password,
    bool force = false,
  }) async {
    Logger.info('Sincronizando grupos con el backend principal: $email');
    final loginResponse = await _mainBackendDio.post(
      ApiConstants.login,
      data: {'institutionalEmail': email, 'encryptedPassword': password},
    );
    final loginData = _asMap(loginResponse.data);
    final mainToken = loginData['token']?.toString() ?? '';

    if (mainToken.isEmpty) {
      throw StateError('El backend principal no devolvió una sesión válida.');
    }

    await AuthStorageService().saveMainBackendToken(mainToken);

    if (!force) {
      return loginData['message']?.toString() ??
          'Grupos sincronizados con el portal.';
    }

    final syncResponse = await _mainBackendDio.post(
      ApiConstants.sync,
      data: {'institutionalEmail': email, 'encryptedPassword': password},
      options: Options(headers: {'Authorization': 'Bearer $mainToken'}),
    );
    final syncData = _asMap(syncResponse.data);
    return syncData['message']?.toString() ??
        'Grupos sincronizados con el portal.';
  }

  Future<Either<String, LoginResponse>> loginProfesorWithEncryptedPassword({
    required String email,
    required String encryptedPassword,
  }) {
    return loginProfesor(email: email, password: encryptedPassword);
  }

  Future<String?> _refreshBackendApiRestSession() async {
    final authStorage = AuthStorageService();
    final profesor = authStorage.getProfesor();
    final password = authStorage.getEncryptedPassword();

    if (profesor == null ||
        profesor.institutionalEmail.isEmpty ||
        password == null ||
        password.isEmpty) {
      Logger.error(
        'No se pudo renovar sesion UAT: faltan profesor o contrasena guardada.',
      );
      return null;
    }

    Logger.info(
      'Renovando sesion UAT para API REST: ${profesor.institutionalEmail}',
    );
    final result = await _loginProfesorViaBackendApiRest(
      email: profesor.institutionalEmail,
      password: password,
    );

    String? refreshedToken;
    await result.fold(
      (error) async {
        Logger.error('No se pudo renovar sesion UAT: $error');
      },
      (login) async {
        refreshedToken = login.token;
        await authStorage.saveToken(login.token);
        await authStorage.saveProfesor(login.profesor);
      },
    );

    return refreshedToken;
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
      final debugData = withDebugCurrentClass(grupos, beacons);
      return Right(debugData);
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

      var beacons = await _resolveBeaconsForGroups(grupos);
      final debugData = withDebugCurrentClass(grupos, beacons);
      Logger.info(
        'Clases obtenidas: ${gruposPortal.length} oficiales, ${sharedGroups.length} compartidas, beacons: ${debugData.beacons.length}',
      );
      return Right(debugData);
    } on DioException catch (e) {
      final errorMessage = _handleDioError(e);
      Logger.error('Error de conexion obteniendo clases UAT: $errorMessage', e);
      return Left(errorMessage);
    } catch (e, stackTrace) {
      Logger.error('Error inesperado obteniendo clases UAT', e, stackTrace);
      return Left(_cleanException(e));
    }
  }

  ({List<Grupo> grupos, List<Map<String, dynamic>> beacons})
  withDebugCurrentClass(
    List<Grupo> grupos,
    List<Map<String, dynamic>> beacons,
  ) {
    if (!ApiConstants.presenciaDebugMode ||
        !ApiConstants.debugExtraCurrentClass) {
      return (grupos: grupos, beacons: beacons);
    }

    final now = DateTime.now();
    final debugClassHours = ApiConstants.debugExtraClassHours < 1
        ? 1
        : ApiConstants.debugExtraClassHours;
    final start = now.subtract(const Duration(minutes: 10));
    final end = start.add(Duration(hours: debugClassHours));
    final scheduleValue = '${_formatHour(start)}-${_formatHour(end)}';
    final dayKeys = _debugAllDayKeys();
    final schedule = <String, String?>{
      for (final key in dayKeys) key: scheduleValue,
    };

    final debugGroup = Grupo(
      id: ApiConstants.debugExtraClassCode,
      code: ApiConstants.debugExtraClassCode,
      groupLetter: ApiConstants.debugExtraClassGroupLetter,
      period: ApiConstants.debugExtraClassPeriod,
      group: ApiConstants.debugExtraClassGroupLetter,
      classroom: ApiConstants.debugExtraClassroom,
      name: ApiConstants.debugExtraClassName,
      level: 'DEBUG',
      students: const [
        Alumno(
          id: '99000101',
          matricula: 'DEBUG001',
          number: 1,
          name: 'Alumno Debug 1',
        ),
        Alumno(
          id: '99000102',
          matricula: 'DEBUG002',
          number: 2,
          name: 'Alumno Debug 2',
        ),
        Alumno(
          id: '99000103',
          matricula: 'DEBUG003',
          number: 3,
          name: 'Alumno Debug 3',
        ),
      ],
      studentsCount: 3,
      schedule: schedule,
      source: 'DEBUG',
    );

    final filteredGroups = grupos
        .where((grupo) => grupo.code != ApiConstants.debugExtraClassCode)
        .toList();
    final filteredBeacons = beacons.where((beacon) {
      final classroom = beacon['classroom']?.toString();
      final classroomKey = beacon['classroomKey']?.toString();
      return classroom != ApiConstants.debugExtraClassroom &&
          classroomKey !=
              AuthStorageService.classroomKey(ApiConstants.debugExtraClassroom);
    }).toList();

    final debugBeacon = {
      'classroom': ApiConstants.debugExtraClassroom,
      'classroomKey': AuthStorageService.classroomKey(
        ApiConstants.debugExtraClassroom,
      ),
      'uuid': ApiConstants.debugExtraBeaconUuid,
      'source': 'DEBUG',
    };

    Logger.info(
      '[DEBUG] Materia extra actual agregada: '
      '${debugGroup.name}, salon=${debugGroup.classroom}, '
      'horario=$scheduleValue, beacon=${ApiConstants.debugExtraBeaconUuid}',
    );

    return (
      grupos: [debugGroup, ...filteredGroups],
      beacons: [debugBeacon, ...filteredBeacons],
    );
  }

  List<String> _debugAllDayKeys() {
    return const [
      'monday',
      'lunes',
      'tuesday',
      'martes',
      'wednesday',
      'miercoles',
      'jueves',
      'thursday',
      'friday',
      'viernes',
      'saturday',
      'sabado',
      'sunday',
      'domingo',
    ];
  }

  String _formatHour(DateTime value) {
    return '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
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
      final portalSync = await syncPortalHistory(
        email: email,
        password: encryptedPassword,
        force: true,
      );
      if (portalSync.isLeft()) {
        return Left(
          portalSync.fold((error) => error, (_) => 'Error de sincronización'),
        );
      }
      final groups = await getGruposProfesor(token);
      return groups.fold(
        (error) => Left(error),
        (data) => Right(
          '${portalSync.fold((_) => '', (message) => message)} '
          '${data.grupos.length} clases cargadas.',
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
    String? groupName,
    String? classroom,
    String? level,
    Map<String, String?>? schedule,
    DateTime? professorEntryAt,
    DateTime? professorExitAt,
    String? groupId,
    bool forceUpload = false,
  }) async {
    if (_skipApiRestAttendanceUpload) {
      return _uploadDebugAttendanceDirectlyToBackend(
        token: token,
        groupId: groupId,
        code: code,
        groupLetter: groupLetter,
        period: period,
        groupName: groupName,
        classroom: classroom,
        level: level,
        schedule: schedule,
        date: date,
        attendances: attendances,
        professorEntryAt: professorEntryAt,
        professorExitAt: professorExitAt,
      );
    }

    if (_usesBackendApiRest) {
      return _uploadAttendanceViaBackendApiRest(
        token: token,
        groupId: groupId,
        code: code,
        groupLetter: groupLetter,
        period: period,
        groupName: groupName,
        classroom: classroom,
        level: level,
        schedule: schedule,
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
          if (groupId != null && groupId.isNotEmpty) 'groupId': groupId,
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

      final responseMap = Map<String, dynamic>.from(response.data as Map);
      final responseData = responseMap['data'];
      if (responseData is Map && responseData['debug'] == true) {
        responseMap['debug'] = true;
        responseMap['skippedApiRestUpload'] = true;
        responseMap['reportVisible'] = responseData['reportVisible'] == true;
      }

      return Right(responseMap);
    } on DioException catch (e) {
      final errorMessage = _handleDioError(e);
      Logger.error('Error de conexion subiendo asistencia: $errorMessage', e);
      return Left(errorMessage);
    } catch (e, stackTrace) {
      Logger.error('Error inesperado subiendo asistencia', e, stackTrace);
      return Left(_cleanException(e));
    }
  }

  /// Hands an entire set of pending attendance records to the durable server queue.
  /// A successful response means ownership was transferred to the server, not that
  /// every record has already reached UAT.
  Future<Either<String, Map<String, dynamic>>> submitAttendanceBatch({
    required String token,
    required List<Map<String, dynamic>> records,
  }) async {
    if (!_usesBackendApiRest) {
      return const Left(
        'La cola durable requiere configurar PRESENCIA_API_BASE_URL con backend-apirest.',
      );
    }
    try {
      final response = await _presenceDio.post(
        ApiConstants.uatAttendanceBatches,
        data: {'records': records},
        options: Options(headers: {'X-UAT-Session-Id': token}),
      );
      return Right(_asMap(response.data));
    } on DioException catch (e) {
      final errorMessage = _handleDioError(e);
      Logger.error('Error entregando lote de asistencias: $errorMessage', e);
      return Left(errorMessage);
    } catch (e, stackTrace) {
      Logger.error(
        'Error inesperado entregando lote de asistencias',
        e,
        stackTrace,
      );
      return Left(_cleanException(e));
    }
  }

  Future<Either<String, Map<String, dynamic>>> getAttendanceBatchStatus({
    required String token,
    required String batchId,
  }) async {
    if (!_usesBackendApiRest) {
      return const Left('La cola durable no está disponible en este servidor.');
    }
    try {
      final response = await _presenceDio.get(
        '${ApiConstants.uatAttendanceBatches}/$batchId',
        options: Options(headers: {'X-UAT-Session-Id': token}),
      );
      return Right(_asMap(response.data));
    } on DioException catch (e) {
      return Left(_handleDioError(e));
    } catch (e) {
      return Left(_cleanException(e));
    }
  }

  Future<Either<String, Map<String, dynamic>>>
  _uploadDebugAttendanceDirectlyToBackend({
    required String token,
    String? groupId,
    required String code,
    String groupLetter = '',
    String period = '',
    String? groupName,
    String? classroom,
    String? level,
    Map<String, String?>? schedule,
    required DateTime date,
    required List<Map<String, dynamic>> attendances,
    DateTime? professorEntryAt,
    DateTime? professorExitAt,
    String? roomBeaconUuid,
    int? roomBeaconRssi,
    double? roomBeaconDistance,
    String? roomBeaconAddress,
  }) async {
    try {
      final profesor = AuthStorageService().getProfesor();
      final professorEmail = profesor?.institutionalEmail ?? '';
      if (professorEmail.isEmpty) {
        return const Left(
          'Modo debug: no hay profesor guardado para registrar reportes.',
        );
      }

      final formattedDate =
          '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
      final debugAttendances = _normalizeAttendancesForDebugBackend(
        attendances,
      );

      Logger.info(
        '[DEBUG] Registrando asistencia directamente en backend principal, '
        'sin backend-apirest/UAT. groupId=$groupId, code=$code, '
        'groupLetter=$groupLetter, period=$period, date=$formattedDate, '
        'alumnos=${debugAttendances.length}, '
        'professorEntryAt=${professorEntryAt?.toIso8601String()}, '
        'professorExitAt=${professorExitAt?.toIso8601String()}',
      );

      final response = await _attendanceBackendDio.post(
        '/internal/coordination/debug-attendance',
        data: {
          'professorEmail': professorEmail,
          'professorName': profesor?.name,
          'code': code,
          'groupLetter': groupLetter,
          'period': period,
          if (groupName != null) 'groupName': groupName,
          if (classroom != null) 'classroom': classroom,
          if (level != null) 'level': level,
          if (schedule != null) 'schedule': schedule,
          'createMissingGroup': true,
          'date': formattedDate,
          if (professorEntryAt != null)
            'professorEntryAt': professorEntryAt.toIso8601String(),
          if (professorExitAt != null)
            'professorExitAt': professorExitAt.toIso8601String(),
          if (roomBeaconUuid != null) 'roomBeaconUuid': roomBeaconUuid,
          if (roomBeaconRssi != null) 'roomBeaconRssi': roomBeaconRssi,
          if (roomBeaconDistance != null)
            'roomBeaconDistance': roomBeaconDistance,
          if (roomBeaconAddress != null) 'roomBeaconAddress': roomBeaconAddress,
          'attendances': debugAttendances,
        },
        options: Options(headers: {'X-Debug-Session-Id': token}),
      );

      final responseMap = _asMap(response.data);
      responseMap['debug'] = true;
      responseMap['skippedApiRestUpload'] = true;
      responseMap['reportVisible'] = true;
      return Right(responseMap);
    } on DioException catch (e) {
      final errorMessage = _handleDioError(e);
      Logger.error(
        'Error registrando asistencia debug en backend principal: '
        '$errorMessage',
        e,
      );
      return Left(errorMessage);
    } catch (e, stackTrace) {
      Logger.error(
        'Error inesperado registrando asistencia debug en backend principal',
        e,
        stackTrace,
      );
      return Left(_cleanException(e));
    }
  }

  Future<Either<String, Map<String, dynamic>>>
  _uploadAttendanceViaBackendApiRest({
    required String token,
    String? groupId,
    required String code,
    String groupLetter = '',
    String period = '',
    String? groupName,
    String? classroom,
    String? level,
    Map<String, String?>? schedule,
    required DateTime date,
    required List<Map<String, dynamic>> attendances,
    DateTime? professorEntryAt,
    DateTime? professorExitAt,
    bool debugReportOnly = false,
    bool retrySession = true,
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

      if (asistencia.isEmpty && !debugReportOnly) {
        return const Left('No hay alumnos validos para subir asistencia.');
      }

      final formattedDate =
          '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

      if (debugReportOnly) {
        Logger.info(
          '[DEBUG] Registrando asistencia para reportes sin enviar a UAT/API REST externa. '
          'groupId=$idGrupo, code=$code, groupLetter=$groupLetter, period=$period, '
          'date=$formattedDate, alumnos=${asistencia.length}, '
          'professorEntryAt=${professorEntryAt?.toIso8601String()}, '
          'professorExitAt=${professorExitAt?.toIso8601String()}',
        );
      }

      final response = await _presenceDio.post(
        ApiConstants.uatAsistenciaGuardar,
        data: {
          'Id_Grupo': idGrupo,
          'Fec_Ini': formatUatWeekStart(date),
          if (debugReportOnly) ...{
            'DebugReportOnly': true,
            'Code': code,
            'GroupLetter': groupLetter,
            'Period': period,
            if (groupName != null) 'GroupName': groupName,
            if (classroom != null) 'Classroom': classroom,
            if (level != null) 'Level': level,
            if (schedule != null) 'Schedule': schedule,
            'CreateMissingGroup': true,
            'Date': formattedDate,
          },
          if (professorEntryAt != null)
            'ProfessorEntryAt': professorEntryAt.toIso8601String(),
          if (professorExitAt != null)
            'ProfessorExitAt': professorExitAt.toIso8601String(),
          'Asistencia': asistencia,
        },
        options: Options(headers: {'X-UAT-Session-Id': token}),
      );

      final responseMap = _asMap(response.data);
      if (debugReportOnly) {
        responseMap['debug'] = true;
        responseMap['skippedApiRestUpload'] = true;
        responseMap['reportVisible'] = true;
      }
      return Right(responseMap);
    } on DioException catch (e) {
      if (e.response?.statusCode == 401 &&
          retrySession &&
          _usesBackendApiRest) {
        final refreshedToken = await _refreshBackendApiRestSession();
        if (refreshedToken != null && refreshedToken.isNotEmpty) {
          Logger.info('Reintentando subida con sesion UAT renovada.');
          return _uploadAttendanceViaBackendApiRest(
            token: refreshedToken,
            groupId: groupId,
            code: code,
            groupLetter: groupLetter,
            period: period,
            groupName: groupName,
            classroom: classroom,
            level: level,
            schedule: schedule,
            date: date,
            attendances: attendances,
            professorEntryAt: professorEntryAt,
            professorExitAt: professorExitAt,
            debugReportOnly: debugReportOnly,
            retrySession: false,
          );
        }
      }

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

  List<Map<String, dynamic>> _normalizeAttendancesForDebugBackend(
    List<Map<String, dynamic>> attendances,
  ) {
    const validStatuses = {'PRESENT', 'ABSENT', 'LATE', 'EXCUSED'};

    return attendances
        .map((attendance) {
          final studentId =
              attendance['studentId']?.toString() ??
              attendance['id']?.toString() ??
              attendance['matricula']?.toString() ??
              attendance['id_alumno']?.toString() ??
              attendance['idAlumno']?.toString();
          if (studentId == null || studentId.isEmpty) return null;

          final rawStatus = attendance['status']?.toString().toUpperCase();
          final status = rawStatus != null && validStatuses.contains(rawStatus)
              ? rawStatus
              : (attendance['sn_asistencia'] == true ||
                    attendance['snAsistencia'] == true ||
                    attendance['present'] == true ||
                    attendance['isPresent'] == true)
              ? 'PRESENT'
              : 'ABSENT';

          return {'studentId': studentId, 'status': status};
        })
        .whereType<Map<String, dynamic>>()
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
      if (_usesBackendApiRest) {
        final recordsWithIds = records
            .where((record) => record['clientRecordId']?.isNotEmpty == true)
            .toList();
        if (recordsWithIds.isEmpty) return {};
        final response = await _presenceDio.post(
          ApiConstants.uatAttendanceRecordStatuses,
          data: {
            'clientRecordIds': recordsWithIds
                .map((record) => record['clientRecordId'])
                .toList(),
          },
          options: Options(headers: {'X-UAT-Session-Id': token}),
        );
        final data = _asMap(response.data)['data'] as List<dynamic>? ?? [];
        final lookupKeys = {
          for (final record in recordsWithIds)
            record['clientRecordId']!: '${record['groupId']}_${record['date']}',
        };
        final statuses = <String, String>{};
        for (final item in data) {
          final map = Map<String, dynamic>.from(item as Map);
          final lookupKey = lookupKeys[map['clientRecordId']?.toString()];
          final status = map['status']?.toString();
          if (lookupKey != null && status != null) statuses[lookupKey] = status;
        }
        return statuses;
      }

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

  Future<String?> _resolveMainBackendToken(
    String fallbackToken, {
    bool refresh = false,
  }) async {
    if (!_usesBackendApiRest) return fallbackToken;

    final authStorage = AuthStorageService();
    if (!refresh) {
      final storedToken = authStorage.getMainBackendToken();
      if (storedToken != null && storedToken.isNotEmpty) return storedToken;
    }

    final profesor = authStorage.getProfesor();
    final password = authStorage.getEncryptedPassword();
    if (profesor == null || password == null || password.isEmpty) return null;

    final syncResult = await syncPortalHistory(
      email: profesor.institutionalEmail,
      password: password,
    );
    return syncResult.fold(
      (_) => null,
      (_) => authStorage.getMainBackendToken(),
    );
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

      Logger.info(
        'Resolviendo beacons en backend principal para ${normalizedClassrooms.length} salones',
      );

      final response = await _attendanceBackendDio.post(
        '/api/beacons/resolve',
        data: {'classrooms': normalizedClassrooms},
      );

      if (response.statusCode == 200) {
        final data = response.data['data'] as List<dynamic>? ?? [];
        final missing = response.data['missing'] as List<dynamic>? ?? [];
        Logger.info(
          'Beacons resueltos: ${data.length}, salones sin beacon: ${missing.length}',
        );
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

  Future<List<Map<String, dynamic>>> _resolveBeaconsForGroups(
    List<Grupo> grupos,
  ) async {
    final classrooms = grupos
        .map((grupo) => grupo.classroom)
        .where((classroom) => classroom.trim().isNotEmpty)
        .toSet()
        .toList();
    if (classrooms.isEmpty) return const <Map<String, dynamic>>[];

    final result = await resolveClassroomBeacons(classrooms: classrooms);
    return result.fold((error) {
      Logger.error('No se pudieron resolver beacons de grupos: $error');
      return const <Map<String, dynamic>>[];
    }, (beacons) => beacons);
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

      final response = await _attendanceBackendDio.post(
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
    String? groupName,
    String? classroom,
    String? level,
    Map<String, String?>? schedule,
    required DateTime detectedAt,
    required String beaconUuid,
    int? rssi,
    double? distance,
    String? bluetoothAddress,
    bool retrySession = true,
  }) async {
    try {
      if (_skipApiRestAttendanceUpload) {
        Logger.info(
          '[DEBUG] Registrando entrada del profesor directamente en backend principal, sin backend-apirest/UAT. '
          'code=$code groupLetter=$groupLetter period=$period detectedAt=${detectedAt.toIso8601String()} beaconUuid=$beaconUuid',
        );
        return _uploadDebugAttendanceDirectlyToBackend(
          token: token,
          code: code,
          groupLetter: groupLetter,
          period: period,
          groupName: groupName,
          classroom: classroom,
          level: level,
          schedule: schedule,
          date: detectedAt,
          attendances: const [],
          professorEntryAt: detectedAt,
          roomBeaconUuid: beaconUuid,
          roomBeaconRssi: rssi,
          roomBeaconDistance: distance,
          roomBeaconAddress: bluetoothAddress,
        );
      }

      final mainBackendToken = await _resolveMainBackendToken(token);
      if (mainBackendToken == null) {
        return const Left(
          'No pudimos validar la sesión con el backend principal. Inicia sesión de nuevo.',
        );
      }

      final response = await _attendanceBackendDio.post(
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
        options: Options(
          headers: {'Authorization': 'Bearer $mainBackendToken'},
        ),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        return Right(response.data as Map<String, dynamic>);
      }

      return Left(response.data['message'] ?? 'Error registrando entrada');
    } on DioException catch (e) {
      if (e.response?.statusCode == 401 &&
          retrySession &&
          _usesBackendApiRest) {
        final refreshedToken = await _resolveMainBackendToken(
          token,
          refresh: true,
        );
        if (refreshedToken != null && refreshedToken.isNotEmpty) {
          Logger.info(
            'Reintentando registro de entrada con sesion principal renovada.',
          );
          return recordProfessorBeaconEntry(
            token: token,
            code: code,
            groupLetter: groupLetter,
            period: period,
            groupName: groupName,
            classroom: classroom,
            level: level,
            schedule: schedule,
            detectedAt: detectedAt,
            beaconUuid: beaconUuid,
            rssi: rssi,
            distance: distance,
            bluetoothAddress: bluetoothAddress,
            retrySession: false,
          );
        }
      }

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

  Future<Either<String, Map<String, dynamic>>> recordProfessorExit({
    required String token,
    required String code,
    required String groupLetter,
    required String period,
    required DateTime detectedAt,
    bool retrySession = true,
  }) async {
    try {
      final mainBackendToken = await _resolveMainBackendToken(token);
      if (mainBackendToken == null) {
        return const Left(
          'No pudimos validar la sesión con el backend principal. Inicia sesión de nuevo.',
        );
      }

      final response = await _attendanceBackendDio.post(
        '/attendance/professor-exit',
        data: {
          'code': code,
          'groupLetter': groupLetter,
          'period': period,
          'date':
              '${detectedAt.year.toString().padLeft(4, '0')}-${detectedAt.month.toString().padLeft(2, '0')}-${detectedAt.day.toString().padLeft(2, '0')}',
          'detectedAt': detectedAt.toIso8601String(),
        },
        options: Options(
          headers: {'Authorization': 'Bearer $mainBackendToken'},
        ),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        return Right(response.data as Map<String, dynamic>);
      }

      return Left(response.data['message'] ?? 'Error registrando salida');
    } on DioException catch (e) {
      if (e.response?.statusCode == 401 &&
          retrySession &&
          _usesBackendApiRest) {
        final refreshedToken = await _resolveMainBackendToken(
          token,
          refresh: true,
        );
        if (refreshedToken != null && refreshedToken.isNotEmpty) {
          Logger.info(
            'Reintentando registro de salida con sesion principal renovada.',
          );
          return recordProfessorExit(
            token: token,
            code: code,
            groupLetter: groupLetter,
            period: period,
            detectedAt: detectedAt,
            retrySession: false,
          );
        }
      }

      final errorMessage = _handleDioError(e);
      Logger.error('Error registrando salida del profesor: $errorMessage', e);
      return Left(errorMessage);
    } catch (e, stackTrace) {
      Logger.error(
        'Error inesperado registrando salida del profesor',
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
    bool retrySession = true,
  }) async {
    try {
      final formattedDate =
          '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

      final mainBackendToken = await _resolveMainBackendToken(token);
      if (mainBackendToken == null) {
        return const Left(
          'No pudimos validar la sesión con el backend principal. Inicia sesión de nuevo.',
        );
      }

      final response = await _attendanceBackendDio.post(
        '/attendance/student-beacon-detections',
        data: {
          'code': code,
          'groupLetter': groupLetter,
          'period': period,
          'date': formattedDate,
          'detections': detections,
        },
        options: Options(
          headers: {'Authorization': 'Bearer $mainBackendToken'},
        ),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        return Right(response.data as Map<String, dynamic>);
      }

      return Left(
        response.data['message'] ?? 'Error registrando beacons de alumnos',
      );
    } on DioException catch (e) {
      if (e.response?.statusCode == 401 &&
          retrySession &&
          _usesBackendApiRest) {
        final refreshedToken = await _resolveMainBackendToken(
          token,
          refresh: true,
        );
        if (refreshedToken != null && refreshedToken.isNotEmpty) {
          Logger.info(
            'Reintentando registro de alumnos con sesion principal renovada.',
          );
          return recordStudentBeaconDetections(
            token: token,
            code: code,
            groupLetter: groupLetter,
            period: period,
            date: date,
            detections: detections,
            retrySession: false,
          );
        }
      }

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
    bool retrySession = true,
  }) async {
    try {
      final mainBackendToken = await _resolveMainBackendToken(token);
      if (mainBackendToken == null) {
        return const Left(
          'No pudimos validar la sesión con el backend principal. Inicia sesión de nuevo.',
        );
      }

      final response = await _attendanceBackendDio.post(
        '/attendance/student-beacon-bindings',
        data: {'code': code, 'groupLetter': groupLetter, 'period': period},
        options: Options(
          headers: {'Authorization': 'Bearer $mainBackendToken'},
        ),
      );

      if (response.statusCode == 200) {
        final data = response.data['data'] as List<dynamic>? ?? [];
        return Right(
          data.map((item) => Map<String, dynamic>.from(item as Map)).toList(),
        );
      }

      return Left(response.data['message'] ?? 'Error obteniendo UUIDs');
    } on DioException catch (e) {
      if (e.response?.statusCode == 401 &&
          retrySession &&
          _usesBackendApiRest) {
        final refreshedToken = await _resolveMainBackendToken(
          token,
          refresh: true,
        );
        if (refreshedToken != null && refreshedToken.isNotEmpty) {
          Logger.info(
            'Reintentando consulta de UUIDs con sesion principal renovada.',
          );
          return getStudentBeaconBindings(
            token: token,
            code: code,
            groupLetter: groupLetter,
            period: period,
            retrySession: false,
          );
        }
      }

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
