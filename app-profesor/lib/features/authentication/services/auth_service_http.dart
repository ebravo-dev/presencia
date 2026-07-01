import 'package:dio/dio.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/utils/utils.dart';
import '../models/auth_models.dart';
import '../services/auth_service.dart';

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

    Logger.info(
      'AuthServiceHttp initialized with baseUrl: ${_dio.options.baseUrl}',
    );
  }

  @override
  Future<AuthResult> login(String email, String password) async {
    try {
      Logger.info('Iniciando login UAT HTTP para: $email');

      final response = await _dio.post(
        ApiConstants.uatSessions,
        data: {'username': email, 'password': password},
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = Map<String, dynamic>.from(response.data as Map);
        final login = Map<String, dynamic>.from(
          (data['login'] as Map?) ?? const {},
        );
        final parametros = Map<String, dynamic>.from(
          (login['parametros'] as Map?) ?? const {},
        );

        final user = User(
          id: parametros['Id_Plantilla_AdmonUAT']?.toString() ?? email,
          email: parametros['Cve_Usuario_AdmonUAT']?.toString() ?? email,
          name:
              parametros['Txt_Usuario_AdmonUAT']?.toString() ??
              email.split('@').first,
          role: 'professor',
          employeeId: parametros['Id_Usuario_AdmonUAT']?.toString(),
          department: parametros['Id_Sistema_AdmonUAT']?.toString(),
        );

        return AuthResult.success(
          user: user,
          token: data['sessionId']?.toString() ?? '',
          groups: const [],
        );
      }

      return AuthResult.failure(
        'Error de autenticacion: ${response.statusMessage}',
      );
    } on DioException catch (e) {
      Logger.error('Error Dio durante login UAT', e);
      final data = e.response?.data;
      if (data is Map && data['message'] != null) {
        return AuthResult.failure(data['message'].toString());
      }
      if (e.response?.statusCode == 401) {
        return AuthResult.failure('Credenciales invalidas.');
      }
      return AuthResult.failure('Error de conexion. Verifique su internet.');
    } catch (e, stackTrace) {
      Logger.error('Error inesperado durante login UAT HTTP', e, stackTrace);
      return AuthResult.failure('Error inesperado. Intente nuevamente.');
    }
  }

  @override
  Future<AuthResult> logout() async {
    return AuthResult.success(
      user: const User(id: '', email: '', name: '', role: ''),
      token: '',
    );
  }

  @override
  Future<User?> getCurrentUser() async => null;

  @override
  Future<bool> isTokenValid(String token) async => token.isNotEmpty;

  @override
  Future<AuthResult> refreshToken(String token) async {
    return AuthResult.success(
      user: const User(id: '', email: '', name: '', role: ''),
      token: token,
    );
  }

  @override
  Future<List<Group>> getUserGroups(String userId) async => const [];
}
