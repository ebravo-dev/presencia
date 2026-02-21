import 'package:dio/dio.dart';
import 'package:dartz/dartz.dart';
import '../shared/models/profesor.dart';
import '../shared/models/grupo.dart';
import '../shared/models/sync_status.dart';
import '../core/utils/utils.dart';
import '../core/security/encryption_service.dart';
import '../core/constants/api_constants.dart';

class ApiService {
  late final Dio _dio;
  late final EncryptionService _encryptionService;

  ApiService() {
    _encryptionService = EncryptionService();
    _dio = Dio(
      BaseOptions(
        baseUrl: ApiConstants.baseUrl,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        connectTimeout: const Duration(seconds: 30),
        receiveTimeout: const Duration(seconds: 30),
      ),
    );

    // Agregar interceptors para logging
    _dio.interceptors.add(
      LogInterceptor(
        requestBody: true,
        responseBody: true,
        logPrint: (object) => Logger.info(object.toString()),
      ),
    );
  }

  String encryptPassword(String password) {
    return _encryptionService.encryptPassword(password);
  }

  bool isLikelyEncrypted(String value) {
    if (value.length < 80) return false;
    final base64Regex = RegExp(r'^[A-Za-z0-9+/=]+$');
    return base64Regex.hasMatch(value);
  }

  String ensureEncryptedPassword(String value) {
    if (isLikelyEncrypted(value)) {
      return value;
    }
    return _encryptionService.encryptPassword(value);
  }

  /// Autentica un profesor usando email y password
  /// Si el profesor no existe, se crea automáticamente (upsert)
  /// Endpoint: POST /professors/login
  Future<Either<String, LoginResponse>> loginProfesor({
    required String email,
    required String password,
  }) async {
    try {
      // Encriptar contraseña con RSA
      final encryptedPassword = _encryptionService.encryptPassword(password);

      final loginRequest = LoginRequest(
        institutionalEmail: email,
        encryptedPassword: encryptedPassword,
      );

      Logger.info('Intentando login para: $email');

      final response = await _dio.post(
        '/professors/login',
        data: loginRequest.toJson(),
      );

      Logger.info('Response status: ${response.statusCode}');
      Logger.info('Response data: ${response.data}');

      if (response.statusCode == 200 || response.statusCode == 201) {
        try {
          final loginResponse = LoginResponse.fromJson(response.data);
          Logger.info(
            'Login exitoso para profesor: ${loginResponse.profesor.nombreCompleto}',
          );
          return Right(loginResponse);
        } catch (parseError, stackTrace) {
          Logger.error(
            'Error al parsear respuesta de login',
            parseError,
            stackTrace,
          );
          return Left('Error al procesar respuesta del servidor');
        }
      } else {
        final errorMessage = response.data['message'] ?? 'Error en el login';
        Logger.error('Error en login: $errorMessage');
        return Left(errorMessage);
      }
    } on DioException catch (e) {
      final errorMessage = _handleDioError(e);
      Logger.error('Error de conexión en login: $errorMessage', e);
      return Left(errorMessage);
    } catch (e, stackTrace) {
      Logger.error('Error inesperado en login', e, stackTrace);
      return Left('Error inesperado: ${e.toString()}');
    }
  }

  /// Obtiene las clases asignadas al profesor autenticado
  /// Endpoint: GET /professors/classes
  /// Requiere JWT token en el header Authorization
  Future<Either<String, List<Grupo>>> getGruposProfesor(String token) async {
    try {
      Logger.info('Obteniendo clases del profesor autenticado');

      final response = await _dio.get(
        '/professors/classes',
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );

      if (response.statusCode == 200) {
        final List<dynamic> clasesJson = response.data['data'] ?? [];
        final grupos = clasesJson.map((json) => Grupo.fromJson(json)).toList();

        Logger.info('Clases obtenidas exitosamente: ${grupos.length} clases');
        return Right(grupos);
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
      Logger.info('Iniciando sincronización forzada para: $email');

      final response = await _dio.post(
        '/professors/sync',
        data: {
          'institutionalEmail': email,
          'encryptedPassword': encryptedPassword,
        },
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );

      if (response.statusCode == 200) {
        final message = response.data['message'] ?? 'Sincronización iniciada';
        Logger.info('Sincronización iniciada exitosamente');
        return Right(message);
      } else {
        final errorMessage = response.data['message'] ?? 'Error al sincronizar';
        Logger.error('Error en sincronización: $errorMessage');
        return Left(errorMessage);
      }
    } on DioException catch (e) {
      final errorMessage = _handleDioError(e);
      Logger.error('Error de conexión en sincronización: $errorMessage', e);
      return Left(errorMessage);
    } catch (e, stackTrace) {
      Logger.error('Error inesperado en sincronización', e, stackTrace);
      return Left('Error inesperado: ${e.toString()}');
    }
  }

  /// Obtiene el estado actual de la sincronización
  /// Endpoint: GET /professors/sync-status
  Future<Either<String, SyncStatusResponse>> getSyncStatus(String token) async {
    try {
      Logger.info('Consultando estado de sincronización');

      final response = await _dio.get(
        '/professors/sync-status',
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );

      if (response.statusCode == 200) {
        final data = response.data['data'];
        final status = SyncStatusResponse.fromJson(data);
        Logger.info(
          'Estado de sincronización: ${status.status} - ${status.message}',
        );
        return Right(status);
      } else {
        final errorMessage =
            response.data['message'] ?? 'Error al obtener estado';
        Logger.error('Error obteniendo estado: $errorMessage');
        return Left(errorMessage);
      }
    } on DioException catch (e) {
      final errorMessage = _handleDioError(e);
      Logger.error('Error de conexión obteniendo estado: $errorMessage', e);
      return Left(errorMessage);
    } catch (e) {
      Logger.error('Error inesperado obteniendo estado', e);
      return Left('Error inesperado: ${e.toString()}');
    }
  }

  /// Obtiene el estado de sincronización desde el nuevo endpoint
  /// También verifica si retry está disponible
  /// Endpoint: GET /sync/status
  Future<Either<String, Map<String, dynamic>>> getSyncStatusV2(
    String token,
  ) async {
    try {
      Logger.info('Consultando estado de sincronización (v2)');

      final response = await _dio.get(
        '/sync/status',
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );

      if (response.statusCode == 200) {
        Logger.info('Estado de sincronización v2 obtenido');
        return Right(response.data as Map<String, dynamic>);
      } else {
        final errorMessage =
            response.data['message'] ?? 'Error al obtener estado';
        Logger.error('Error obteniendo estado v2: $errorMessage');
        return Left(errorMessage);
      }
    } on DioException catch (e) {
      final errorMessage = _handleDioError(e);
      Logger.error('Error de conexión obteniendo estado v2: $errorMessage', e);
      return Left(errorMessage);
    } catch (e) {
      Logger.error('Error inesperado obteniendo estado v2', e);
      return Left('Error inesperado: ${e.toString()}');
    }
  }

  /// Subir asistencia al servidor
  /// Endpoint: POST /attendance
  Future<Either<String, Map<String, dynamic>>> uploadAttendance({
    required String token,
    required String groupId,
    required DateTime date,
    required List<Map<String, dynamic>> attendances,
    required String encryptedPassword,
    bool forceUpload = false,
  }) async {
    try {
      final formattedDate =
          '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

      final response = await _dio.post(
        '/attendance',
        data: {
          'groupId': groupId,
          'date': formattedDate,
          'encryptedPassword': encryptedPassword,
          'forceUpload': forceUpload,
          'attendances': attendances,
        },
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        return Right(response.data as Map<String, dynamic>);
      }

      final errorMessage =
          response.data['message'] ?? 'Error al subir asistencia';
      return Left(errorMessage);
    } on DioException catch (e) {
      final errorMessage = _handleDioError(e);
      Logger.error('Error de conexión subiendo asistencia: $errorMessage', e);
      return Left(errorMessage);
    } catch (e, stackTrace) {
      Logger.error('Error inesperado subiendo asistencia', e, stackTrace);
      return Left('Error inesperado: ${e.toString()}');
    }
  }

  /// Check which attendance records have been synced to the portal
  /// Returns a map of "groupId_date" -> synced (bool)
  Future<Map<String, bool>> checkSyncedRecords({
    required String token,
    required List<Map<String, String>> records,
  }) async {
    try {
      final response = await _dio.post(
        '/attendance/check-synced',
        data: {'records': records},
        options: Options(
          headers: {'Authorization': 'Bearer $token'},
          // Short timeout: this is a background/optional check
          sendTimeout: const Duration(seconds: 5),
          receiveTimeout: const Duration(seconds: 5),
        ),
      );

      final result = <String, bool>{};
      if (response.statusCode == 200) {
        final data = response.data['data'] as List<dynamic>? ?? [];
        for (final item in data) {
          final key = '${item['groupId']}_${item['date']}';
          result[key] = item['synced'] == true;
        }
      }
      return result;
    } catch (e) {
      Logger.error('Error checking synced records', e);
      return {};
    }
  }

  /// Maneja errores de Dio y devuelve mensajes amigables
  String _handleDioError(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
        return 'No se pudo conectar al servidor. Verifica tu conexión a internet.';
      case DioExceptionType.sendTimeout:
        return 'El tiempo de espera se agotó. Verifica tu conexión a internet.';
      case DioExceptionType.receiveTimeout:
        return 'El servidor tardó demasiado en responder. Intenta de nuevo más tarde.';
      case DioExceptionType.badResponse:
        switch (e.response?.statusCode) {
          case 400:
            return e.response?.data['message'] ??
                'Los datos enviados no son válidos.';
          case 401:
            return 'Credenciales inválidas. Verifica tu email y contraseña.';
          case 403:
            return 'No tienes permisos para realizar esta acción.';
          case 404:
            return 'No se encontró el recurso solicitado.';
          case 409:
            return e.response?.data['message'] ??
                'Ya hay una subida en proceso para esta asistencia.';
          case 500:
            return 'El servidor está experimentando problemas. Intenta más tarde.';
          case 502:
          case 503:
            return 'El servidor no está disponible en este momento. Intenta de nuevo más tarde.';
          case 504:
            return 'El servidor tardó demasiado en responder. Intenta de nuevo.';
          default:
            return 'Ocurrió un problema con el servidor. Intenta de nuevo más tarde.';
        }
      case DioExceptionType.cancel:
        return 'La solicitud fue cancelada.';
      case DioExceptionType.connectionError:
        return 'No se pudo conectar al servidor. Verifica tu conexión a internet.';
      default:
        return 'Ocurrió un problema de conexión. Verifica tu internet e intenta de nuevo.';
    }
  }
}
