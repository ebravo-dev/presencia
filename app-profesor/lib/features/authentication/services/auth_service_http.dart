import 'dart:io';

import 'package:dio/dio.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/utils/utils.dart';
import '../../../services/auth_storage_service.dart';
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
      final storage = AuthStorageService();
      final deviceBindingId = await storage.ensureProfessorDeviceIdentity();

      final response = await _dio.post(
        ApiConstants.uatSessions,
        data: {
          'username': email,
          'password': password,
          'deviceBindingId': deviceBindingId,
          'platform': Platform.operatingSystem,
          'deviceInfo': Platform.operatingSystemVersion,
        },
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = Map<String, dynamic>.from(response.data as Map);
        final capabilities = Map<String, dynamic>.from(
          (data['demoCapabilities'] as Map?) ?? const {},
        );
        ApiConstants.configureRuntimeMode(
          demoMode: data['demoMode'] == true,
          simulateRoomBeacon: capabilities['simulateRoomBeacon'] == true,
        );
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

      return AuthResult.failure('No pudimos iniciar sesión. Revisa tus datos.');
    } on DioException catch (e) {
      Logger.error('Error Dio durante login UAT', e);
      if (e.response?.statusCode == 401) {
        return AuthResult.failure(
          'Tu usuario o contraseña son incorrectos. Revisa tus datos.',
        );
      }
      return AuthResult.failure(
        'No pudimos conectar. Revisa tu internet e intenta de nuevo.',
      );
    } catch (e, stackTrace) {
      Logger.error('Error inesperado durante login UAT HTTP', e, stackTrace);
      return AuthResult.failure('No pudimos iniciar sesión. Intenta de nuevo.');
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
