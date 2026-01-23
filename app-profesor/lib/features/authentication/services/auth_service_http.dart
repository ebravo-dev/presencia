import 'package:dio/dio.dart';
import '../models/auth_models.dart';
import '../services/auth_service.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/utils/utils.dart';

/// Implementación HTTP del servicio de autenticación
/// Se conectará con la API real del backend cuando esté disponible
class AuthServiceHttp implements AuthService {
  final Dio _dio;

  AuthServiceHttp({Dio? dio}) : _dio = dio ?? Dio() {
    _dio.options.baseUrl = ApiConstants.baseUrl;
    _dio.options.connectTimeout = Duration(
      milliseconds: ApiConstants.timeoutDuration,
    );
    _dio.options.receiveTimeout = Duration(
      milliseconds: ApiConstants.timeoutDuration,
    );
  }

  @override
  Future<AuthResult> login(String email, String password) async {
    try {
      Logger.info('Iniciando login HTTP para: $email');

      final response = await _dio.post(
        ApiConstants.login,
        data: {'email': email, 'password': password},
      );

      if (response.statusCode == 200) {
        final data = response.data as Map<String, dynamic>;

        final user = User.fromJson(data['user']);
        final token = data['token'] as String;
        final groupsData = data['groups'] as List<dynamic>? ?? [];

        final groups = groupsData
            .map(
              (groupJson) => Group.fromJson(groupJson as Map<String, dynamic>),
            )
            .toList();

        Logger.info('Login HTTP exitoso para: ${user.name}');

        return AuthResult.success(user: user, token: token, groups: groups);
      } else {
        Logger.error('Error HTTP: ${response.statusCode}');
        return AuthResult.failure(
          'Error de autenticación: ${response.statusMessage}',
        );
      }
    } on DioException catch (e) {
      Logger.error('Error Dio durante login', e);

      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout) {
        return AuthResult.failure(
          'Tiempo de conexión agotado. Verifique su conexión a internet.',
        );
      } else if (e.response?.statusCode == 401) {
        return AuthResult.failure('Credenciales inválidas.');
      } else if (e.response?.statusCode == 500) {
        return AuthResult.failure('Error del servidor. Intente más tarde.');
      } else {
        return AuthResult.failure('Error de conexión. Verifique su internet.');
      }
    } catch (e, stackTrace) {
      Logger.error('Error inesperado durante login HTTP', e, stackTrace);
      return AuthResult.failure('Error inesperado. Intente nuevamente.');
    }
  }

  @override
  Future<AuthResult> logout() async {
    try {
      Logger.info('Cerrando sesión HTTP');

      final response = await _dio.post(ApiConstants.logout);

      if (response.statusCode == 200) {
        Logger.info('Logout HTTP exitoso');
        return AuthResult.success(
          user: const User(id: '', email: '', name: '', role: ''),
          token: '',
        );
      } else {
        return AuthResult.failure('Error al cerrar sesión');
      }
    } on DioException catch (e) {
      Logger.error('Error Dio durante logout', e);
      return AuthResult.failure('Error de conexión durante logout');
    } catch (e, stackTrace) {
      Logger.error('Error inesperado durante logout HTTP', e, stackTrace);
      return AuthResult.failure('Error al cerrar sesión');
    }
  }

  @override
  Future<User?> getCurrentUser() async {
    try {
      Logger.info('Obteniendo usuario actual HTTP');

      final response = await _dio.get(ApiConstants.me);

      if (response.statusCode == 200) {
        final userData = response.data as Map<String, dynamic>;
        return User.fromJson(userData);
      }

      return null;
    } on DioException catch (e) {
      Logger.error('Error obteniendo usuario actual HTTP', e);
      return null;
    } catch (e, stackTrace) {
      Logger.error('Error inesperado obteniendo usuario HTTP', e, stackTrace);
      return null;
    }
  }

  @override
  Future<bool> isTokenValid(String token) async {
    try {
      final response = await _dio.post(
        ApiConstants.validateToken,
        data: {'token': token},
      );

      return response.statusCode == 200;
    } catch (e) {
      Logger.error('Error validando token HTTP', e);
      return false;
    }
  }

  @override
  Future<AuthResult> refreshToken(String token) async {
    try {
      Logger.info('Refrescando token HTTP');

      final response = await _dio.post(
        ApiConstants.refresh,
        data: {'token': token},
      );

      if (response.statusCode == 200) {
        final data = response.data as Map<String, dynamic>;
        final newToken = data['token'] as String;

        return AuthResult.success(
          user: const User(id: '', email: '', name: '', role: ''),
          token: newToken,
        );
      } else {
        return AuthResult.failure('Error al refrescar token');
      }
    } on DioException catch (e) {
      Logger.error('Error refrescando token HTTP', e);
      return AuthResult.failure('Error de conexión al refrescar token');
    } catch (e, stackTrace) {
      Logger.error('Error inesperado refrescando token HTTP', e, stackTrace);
      return AuthResult.failure('Error al refrescar token');
    }
  }

  @override
  Future<List<Group>> getUserGroups(String userId) async {
    try {
      Logger.info('Obteniendo grupos HTTP para usuario: $userId');

      final response = await _dio.get('${ApiConstants.groups}?userId=$userId');

      if (response.statusCode == 200) {
        final groupsData = response.data as List<dynamic>;

        final groups = groupsData
            .map(
              (groupJson) => Group.fromJson(groupJson as Map<String, dynamic>),
            )
            .toList();

        Logger.info('Grupos HTTP obtenidos: ${groups.length}');
        return groups;
      }

      return [];
    } on DioException catch (e) {
      Logger.error('Error obteniendo grupos HTTP', e);
      return [];
    } catch (e, stackTrace) {
      Logger.error('Error inesperado obteniendo grupos HTTP', e, stackTrace);
      return [];
    }
  }
}
