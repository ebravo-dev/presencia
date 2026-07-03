import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';

import '../core/constants/api_constants.dart';
import '../core/network/uat_dio_client.dart';
import '../core/utils/utils.dart';
import '../data/datasources/uat_local_datasource.dart';
import '../data/datasources/uat_remote_datasource.dart';
import '../data/repositories/uat_repository_impl.dart';
import '../shared/models/grupo.dart';
import '../shared/models/profesor.dart';
import '../shared/models/sync_status.dart';
import 'asistencia_local_service.dart';
import 'auth_storage_service.dart';

class ApiService {
  late final Dio _dio;
  late final Dio _presenceDio;
  late final UatRepositoryImpl _uatRepository;
  final AuthStorageService _authStorage = AuthStorageService();
  final AsistenciaLocalService _asistenciaLocal = AsistenciaLocalService();

  /// Callback que se dispara cuando el servidor retorna 401.
  void Function()? onSessionExpired;

  ApiService({this.onSessionExpired}) {
    _dio = UatDioClient.create(
      authStorage: _authStorage,
      onSessionExpired: () => onSessionExpired?.call(),
    );
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

    _uatRepository = UatRepositoryImpl(
      remote: UatRemoteDataSource(_dio),
      local: UatLocalDataSource(
        authStorage: _authStorage,
        asistenciaLocal: _asistenciaLocal,
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

  Future<Either<String, LoginResponse>> loginProfesor({
    required String email,
    required String password,
  }) async {
    try {
      Logger.info('Intentando login UAT para: $email');

      final login = await _uatRepository.iniciarSesion(
        email: email,
        password: password,
      );

      return Right(
        LoginResponse(
          message: login.message,
          profesor: login.profesor,
          token: login.sessionId,
          needsSync: false,
        ),
      );
    } on DioException catch (e) {
      final errorMessage = _handleDioError(e);
      Logger.error('Error de conexion en login: $errorMessage', e);
      return Left(errorMessage);
    } catch (e, stackTrace) {
      Logger.error('Error inesperado en login', e, stackTrace);
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
  /// Endpoint: GET /professors/classes
  /// Requiere JWT token en el header Authorization
  /// Retorna tupla (grupos, beacons) donde beacons es la lista cruda del server
  Future<
    Either<String, ({List<Grupo> grupos, List<Map<String, dynamic>> beacons})>
  >
  getGruposProfesor(String token) async {
    try {
      Logger.info('Obteniendo clases del profesor autenticado');

      final response = await _dio.get(
        '/professors/classes',
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );

      if (response.statusCode == 200) {
        final List<dynamic> clasesJson = response.data['data'] ?? [];
        final grupos = clasesJson.map((json) => Grupo.fromJson(json)).toList();

        final List<dynamic> beaconsJson = response.data['beacons'] ?? [];
        final beacons = beaconsJson
            .map((b) => Map<String, dynamic>.from(b as Map))
            .toList();

        Logger.info(
          'Clases obtenidas: ${grupos.length}, Beacons: ${beacons.length}',
        );
        return Right((grupos: grupos, beacons: beacons));
      } else {
        final errorMessage =
            response.data['message'] ?? 'Error al obtener clases';
        Logger.error('Error obteniendo clases: $errorMessage');
        return Left(errorMessage);
      }
    } on DioException catch (e) {
      final errorMessage = _handleDioError(e);
      Logger.error('Error de conexión obteniendo clases: $errorMessage', e);
      return Left(errorMessage);
    } catch (e) {
      Logger.error('Error inesperado obteniendo clases', e);
      return Left('Error inesperado: ${e.toString()}');
    }
  }

  /// Fuerza la sincronización de grupos desatando el scraping
  /// Endpoint: POST /professors/sync
  Future<Either<String, String>> forceSync({
    required String email,
    required String encryptedPassword,
    required String token,
  }) async {
    try {
      Logger.info('Sincronizando datos UAT via backend-apirest: $email');
      final grupos = await _uatRepository.sincronizarDatos(sessionId: token);
      return Right('${grupos.length} grupos sincronizados');
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
        stepDescription: 'Datos disponibles desde backend-apirest',
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
      'message': 'Datos disponibles desde backend-apirest',
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
    String? groupId,
    bool forceUpload = false,
  }) async {
    try {
      final response = await _uatRepository.guardarAsistenciaDirecta(
        sessionId: token,
        groupId: groupId ?? code,
        date: date,
        attendances: attendances,
      );

      return Right(response);
    } on DioException catch (e) {
      final errorMessage = _handleDioError(e);
      Logger.error('Error de conexion subiendo asistencia: $errorMessage', e);
      return Left(errorMessage);
    } catch (e, stackTrace) {
      Logger.error('Error inesperado subiendo asistencia', e, stackTrace);
      return Left(_cleanException(e));
    }
  }

  Future<Map<String, bool>> checkSyncedRecords({
    required String token,
    required List<Map<String, String>> records,
  }) async {
    return {};
  }

  Future<Map<String, String>> checkSyncedRecordsStatus({
    required String token,
    required List<Map<String, String>> records,
  }) async {
    return {};
  }

  String _cleanException(Object error) {
    final message = error.toString();
    return message.startsWith('Exception: ')
        ? message.substring('Exception: '.length)
        : message;
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
