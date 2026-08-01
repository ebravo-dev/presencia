import 'dart:convert';
import 'dart:io';

import '../config/app_environment.dart';
import 'local_storage_service.dart';

class StudentDeviceBindingService {
  static const String baseUrl = AppEnvironment.studentBindingApiBaseUrl;
  static const Duration _timeout = Duration(
    milliseconds: AppEnvironment.apiTimeoutMs,
  );

  Future<bool> sync(LocalStorageService storage) async {
    final matricula = storage.matricula.trim().toUpperCase();
    final attendanceUuid = storage.attendanceUuid.trim();

    if (matricula.isEmpty || attendanceUuid.isEmpty) return false;
    final bindingToken = await storage.readDeviceBindingToken();

    final client = HttpClient()..connectionTimeout = _timeout;
    try {
      final uri = Uri.parse(baseUrl).resolve('/api/student-device-bindings');
      final request = await client.postUrl(uri).timeout(_timeout);
      request.headers.contentType = ContentType.json;
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      if (bindingToken != null && bindingToken.isNotEmpty) {
        request.headers.set(
          HttpHeaders.authorizationHeader,
          'Bearer $bindingToken',
        );
      }
      request.write(
        jsonEncode({
          'matricula': matricula,
          'attendanceUuid': attendanceUuid,
          if (storage.deviceBindingId.isNotEmpty)
            'deviceBindingId': storage.deviceBindingId,
          'platform': Platform.operatingSystem,
          'deviceInfo': Platform.operatingSystemVersion,
        }),
      );

      final response = await request.close().timeout(_timeout);
      final body = await utf8.decodeStream(response);
      final successful =
          response.statusCode >= 200 && response.statusCode < 300;
      if (!successful) return false;

      if (body.trim().isNotEmpty) {
        final decoded = jsonDecode(body);
        if (decoded is Map<String, dynamic>) {
          final data = decoded['data'];
          if (data is Map<String, dynamic>) {
            final refreshedToken = data['bindingToken']?.toString();
            if (refreshedToken != null && refreshedToken.isNotEmpty) {
              await storage.saveDeviceBindingToken(refreshedToken);
            }
          }
        }
      }
      return true;
    } catch (_) {
      return false;
    } finally {
      client.close(force: true);
    }
  }
}
