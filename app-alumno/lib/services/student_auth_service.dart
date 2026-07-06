import 'dart:convert';
import 'dart:io';

import '../config/app_environment.dart';
import 'local_storage_service.dart';

class StudentAuthResult {
  final String sessionId;
  final String matricula;

  const StudentAuthResult({required this.sessionId, required this.matricula});
}

class StudentAuthException implements Exception {
  final String message;

  const StudentAuthException(this.message);

  @override
  String toString() => message;
}

class StudentAuthService {
  static const String baseUrl = AppEnvironment.presenceApiBaseUrl;
  static const Duration _timeout = Duration(
    milliseconds: AppEnvironment.apiTimeoutMs,
  );

  Future<StudentAuthResult> loginAndBind({
    required String username,
    required String password,
    required LocalStorageService storage,
  }) async {
    await storage.ensureDeviceIdentity();

    final client = HttpClient()..connectionTimeout = _timeout;
    try {
      final uri = Uri.parse(baseUrl).resolve('/api/uat/alumnos/sessions');
      final request = await client.postUrl(uri).timeout(_timeout);
      request.headers.contentType = ContentType.json;
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      request.write(
        jsonEncode({
          'username': username.trim(),
          'password': password,
          'attendanceUuid': storage.attendanceUuid,
          'deviceBindingId': storage.deviceBindingId,
          'platform': Platform.operatingSystem,
          'deviceInfo': Platform.operatingSystemVersion,
        }),
      );

      final response = await request.close().timeout(_timeout);
      final body = await utf8.decodeStream(response);
      final decoded = body.trim().isEmpty
          ? <String, dynamic>{}
          : jsonDecode(body);

      if (response.statusCode < 200 || response.statusCode >= 300) {
        final message = decoded is Map<String, dynamic>
            ? decoded['message']?.toString()
            : null;
        throw StudentAuthException(
          message?.isNotEmpty == true
              ? message!
              : 'No fue posible iniciar sesión. Revisa tus datos.',
        );
      }

      if (decoded is! Map<String, dynamic>) {
        throw const StudentAuthException(
          'El backend devolvió una respuesta inválida.',
        );
      }

      final sessionId = decoded['sessionId']?.toString() ?? '';
      final matricula = _extractMatricula(decoded);

      if (sessionId.isEmpty || matricula.isEmpty) {
        throw const StudentAuthException(
          'El backend no devolvió la sesión o matrícula del alumno.',
        );
      }

      return StudentAuthResult(sessionId: sessionId, matricula: matricula);
    } on StudentAuthException {
      rethrow;
    } on SocketException {
      throw const StudentAuthException('No hay conexión con el backend.');
    } on FormatException {
      throw const StudentAuthException('El backend devolvió JSON inválido.');
    } catch (_) {
      throw const StudentAuthException('No fue posible iniciar sesión.');
    } finally {
      client.close(force: true);
    }
  }

  String _extractMatricula(Map<String, dynamic> response) {
    final selectedCareer = response['selectedCareer'];
    if (selectedCareer is Map<String, dynamic>) {
      final parametros = selectedCareer['parametros'];
      if (parametros is Map<String, dynamic>) {
        final value =
            parametros['Num_Matricula_AlumnosUAT'] ??
            parametros['Num_Matricula'];
        final matricula = value?.toString().trim().toUpperCase() ?? '';
        if (matricula.isNotEmpty) return matricula;
      }

      final directValue = selectedCareer['Num_Matricula'];
      final directMatricula =
          directValue?.toString().trim().toUpperCase() ?? '';
      if (directMatricula.isNotEmpty) return directMatricula;
    }

    final careers = response['careers'];
    if (careers is List && careers.isNotEmpty) {
      final first = careers.first;
      if (first is Map<String, dynamic>) {
        final matricula =
            first['Num_Matricula']?.toString().trim().toUpperCase() ?? '';
        if (matricula.isNotEmpty) return matricula;
      }
    }

    return '';
  }
}
