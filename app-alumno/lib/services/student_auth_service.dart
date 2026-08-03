import 'dart:convert';
import 'dart:io';

import '../config/app_environment.dart';
import '../models/student_academic_profile.dart';
import '../models/student_schedule_entry.dart';
import 'local_storage_service.dart';
import 'student_session_request.dart';

class StudentAuthResult {
  final String matricula;
  final String deviceBindingToken;
  final StudentAcademicProfile profile;
  final String sessionId;

  const StudentAuthResult({
    required this.matricula,
    required this.deviceBindingToken,
    required this.profile,
    required this.sessionId,
  });
}

class StudentInfoSyncResult {
  final List<StudentScheduleEntry> schedule;
  final int partialGradesCount;
  final int finalGradesCount;
  final DateTime syncedAt;

  const StudentInfoSyncResult({
    required this.schedule,
    required this.partialGradesCount,
    required this.finalGradesCount,
    required this.syncedAt,
  });

  int get scheduleCount => schedule.length;
}

class StudentAuthException implements Exception {
  final String message;
  final bool authenticationFailed;

  const StudentAuthException(this.message, {this.authenticationFailed = false});

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
    final decoded = await _createStudentSession(
      username: username,
      password: password,
      storage: storage,
    );

    final sessionId = decoded['sessionId']?.toString() ?? '';
    final matricula = _extractMatricula(decoded);
    final deviceBindingToken = decoded['deviceBindingToken']?.toString() ?? '';

    if (sessionId.isEmpty || matricula.isEmpty || deviceBindingToken.isEmpty) {
      if (sessionId.isNotEmpty) await _deleteStudentSession(sessionId);
      throw const StudentAuthException(
        'No pudimos preparar tu cuenta. Inténtalo de nuevo.',
      );
    }

    return StudentAuthResult(
      matricula: matricula,
      deviceBindingToken: deviceBindingToken,
      profile: StudentAcademicProfile.fromSessionResponse(
        decoded,
        matricula: matricula,
        institutionalEmail: username,
      ),
      sessionId: sessionId,
    );
  }

  Future<StudentInfoSyncResult> syncAcademicInfo(
    LocalStorageService storage, {
    String? sessionId,
  }) async {
    var activeSessionId = sessionId?.trim() ?? '';
    if (activeSessionId.isEmpty) {
      final credentials = await storage.readInstitutionalCredentials();
      if (credentials == null) {
        throw const StudentAuthException(
          'No pudimos acceder a tus datos de UAT. Inicia sesión de nuevo.',
          authenticationFailed: true,
        );
      }

      final session = await _createStudentSession(
        username: credentials.username,
        password: credentials.password,
        storage: storage,
      );
      activeSessionId = session['sessionId']?.toString() ?? '';
      if (activeSessionId.isEmpty) {
        throw const StudentAuthException(
          'No pudimos actualizar tus datos de UAT. Inténtalo de nuevo.',
        );
      }

      final refreshedBindingToken = session['deviceBindingToken']?.toString();
      if (refreshedBindingToken != null && refreshedBindingToken.isNotEmpty) {
        await storage.saveDeviceBindingToken(refreshedBindingToken);
      }
    }

    try {
      final responses = await Future.wait<List<Map<String, dynamic>>>([
        _getStudentData('/api/uat/alumnos/horario', activeSessionId),
        _getOptionalStudentData(
          '/api/uat/alumnos/calificaciones/parciales',
          activeSessionId,
        ),
        _getOptionalStudentData(
          '/api/uat/alumnos/calificaciones/finales',
          activeSessionId,
        ),
      ]);

      return StudentInfoSyncResult(
        schedule: parseStudentSchedule(responses[0]),
        partialGradesCount: responses[1].length,
        finalGradesCount: responses[2].length,
        syncedAt: DateTime.now(),
      );
    } finally {
      await _deleteStudentSession(activeSessionId);
    }
  }

  Future<void> discardSession(String sessionId) async {
    final normalized = sessionId.trim();
    if (normalized.isEmpty) return;
    await _deleteStudentSession(normalized);
  }

  Future<Map<String, dynamic>> _createStudentSession({
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
        jsonEncode(
          buildStudentSessionRequest(
            username: username,
            password: password,
            attendanceUuid: storage.attendanceUuid,
            deviceBindingId: storage.deviceBindingId,
            platform: Platform.operatingSystem,
            deviceInfo: Platform.operatingSystemVersion,
          ),
        ),
      );

      final response = await request.close().timeout(_timeout);
      final body = await utf8.decodeStream(response);
      final decoded = body.trim().isEmpty
          ? <String, dynamic>{}
          : jsonDecode(body);

      if (response.statusCode < 200 || response.statusCode >= 300) {
        final error = decoded is Map<String, dynamic>
            ? decoded['error']?.toString()
            : null;
        final isAuthError =
            response.statusCode == 401 ||
            error == 'UAT_LOGIN_FAILED' ||
            error == 'UNAUTHORIZED';
        throw StudentAuthException(
          isAuthError
              ? 'No pudimos iniciar sesión. Revisa tus datos.'
              : 'No pudimos conectar con UAT. Inténtalo de nuevo.',
          authenticationFailed: isAuthError,
        );
      }

      if (decoded is! Map<String, dynamic>) {
        throw const StudentAuthException(
          'No pudimos conectar con UAT. Inténtalo de nuevo.',
        );
      }

      return decoded;
    } on StudentAuthException {
      rethrow;
    } on SocketException {
      throw const StudentAuthException('No hay conexión a internet.');
    } on FormatException {
      throw const StudentAuthException(
        'No pudimos conectar con UAT. Inténtalo de nuevo.',
      );
    } catch (_) {
      throw const StudentAuthException(
        'No pudimos iniciar sesión. Inténtalo de nuevo.',
      );
    } finally {
      client.close(force: true);
    }
  }

  Future<List<Map<String, dynamic>>> _getStudentData(
    String path,
    String sessionId,
  ) async {
    final client = HttpClient()..connectionTimeout = _timeout;
    try {
      final uri = Uri.parse(baseUrl).resolve(path);
      final request = await client.getUrl(uri).timeout(_timeout);
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      request.headers.set('X-UAT-Student-Session-Id', sessionId);

      final response = await request.close().timeout(_timeout);
      final body = await utf8.decodeStream(response);
      final decoded = body.trim().isEmpty
          ? <String, dynamic>{}
          : jsonDecode(body);

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw StudentAuthException(
          response.statusCode == 401
              ? 'No pudimos actualizar tus datos de UAT. Inicia sesión de nuevo.'
              : 'No pudimos actualizar tus datos de UAT. Inténtalo de nuevo.',
          authenticationFailed: response.statusCode == 401,
        );
      }

      if (decoded is Map<String, dynamic>) {
        final data = decoded['data'];
        if (data is List) {
          return data
              .whereType<Map>()
              .map((item) => Map<String, dynamic>.from(item))
              .toList(growable: false);
        }
      }

      return const [];
    } on StudentAuthException {
      rethrow;
    } catch (_) {
      throw const StudentAuthException(
        'No pudimos actualizar tus datos de UAT. Inténtalo de nuevo.',
      );
    } finally {
      client.close(force: true);
    }
  }

  Future<List<Map<String, dynamic>>> _getOptionalStudentData(
    String path,
    String sessionId,
  ) async {
    try {
      return await _getStudentData(path, sessionId);
    } on StudentAuthException catch (error) {
      if (error.authenticationFailed) rethrow;
      return const [];
    }
  }

  Future<void> _deleteStudentSession(String sessionId) async {
    final client = HttpClient()..connectionTimeout = _timeout;
    try {
      final uri = Uri.parse(
        baseUrl,
      ).resolve('/api/uat/alumnos/sessions/$sessionId');
      final request = await client.deleteUrl(uri).timeout(_timeout);
      await request.close().timeout(_timeout);
    } catch (_) {
      // Best-effort cleanup. La sesion expira sola en backend.
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
