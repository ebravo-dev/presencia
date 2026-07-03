import 'dart:convert';
import 'dart:io';

import '../config/app_environment.dart';
import 'local_storage_service.dart';

class StudentDeviceBindingService {
  static const String baseUrl = AppEnvironment.presenceApiBaseUrl;
  static const Duration _timeout = Duration(
    milliseconds: AppEnvironment.apiTimeoutMs,
  );

  Future<bool> sync(LocalStorageService storage) async {
    final matricula = storage.matricula.trim().toUpperCase();
    final attendanceUuid = storage.attendanceUuid.trim();

    if (matricula.isEmpty || attendanceUuid.isEmpty) return false;

    final client = HttpClient()..connectionTimeout = _timeout;
    try {
      final uri = Uri.parse(baseUrl).resolve('/api/student-device-bindings');
      final request = await client.postUrl(uri).timeout(_timeout);
      request.headers.contentType = ContentType.json;
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
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
      await response.drain<void>();
      return response.statusCode >= 200 && response.statusCode < 300;
    } catch (_) {
      return false;
    } finally {
      client.close(force: true);
    }
  }
}
