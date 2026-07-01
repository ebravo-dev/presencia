import 'package:dio/dio.dart';

import '../../../services/auth_storage_service.dart';
import '../../constants/api_constants.dart';

class UatAuthInterceptor extends Interceptor {
  final AuthStorageService authStorage;

  UatAuthInterceptor({required this.authStorage});

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final isCreatingSession =
        options.method.toUpperCase() == 'POST' &&
        options.path == ApiConstants.uatSessions;

    if (!isCreatingSession &&
        !options.headers.containsKey('X-UAT-Session-Id')) {
      final sessionId = authStorage.getToken();
      if (sessionId != null && sessionId.isNotEmpty) {
        options.headers['X-UAT-Session-Id'] = sessionId;
      }
    }

    handler.next(options);
  }
}
