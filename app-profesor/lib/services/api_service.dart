import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';

import '../core/constants/api_constants.dart';
import '../core/utils/utils.dart';
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

  Future<Either<String, LoginResponse>> loginProfesor({
    required String email,
    required String password,
  }) async {
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

  /// Fuerza la sincronización de grupos desatando el scraping
  /// Endpoint: POST /professors/sync
  Future<Either<String, String>> forceSync({
    required String email,
    required String encryptedPassword,
    required String token,
  }) async {
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
    String? groupId,
    bool forceUpload = false,
  }) async {
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
