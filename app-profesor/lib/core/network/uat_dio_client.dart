import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../services/auth_storage_service.dart';
import '../constants/api_constants.dart';
import '../utils/utils.dart';
import 'interceptors/uat_auth.interceptor.dart';

class UatDioClient {
  UatDioClient._();

  static Dio create({
    AuthStorageService? authStorage,
    void Function()? onSessionExpired,
  }) {
    final dio = Dio(
      BaseOptions(
        baseUrl: ApiConstants.baseUrl,
        headers: const {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        connectTimeout: Duration(milliseconds: ApiConstants.timeoutDuration),
        receiveTimeout: Duration(milliseconds: ApiConstants.timeoutDuration),
        sendTimeout: Duration(milliseconds: ApiConstants.timeoutDuration),
      ),
    );

    dio.interceptors.add(
      UatAuthInterceptor(authStorage: authStorage ?? AuthStorageService()),
    );

    dio.interceptors.add(
      InterceptorsWrapper(
        onError: (DioException error, ErrorInterceptorHandler handler) {
          if (error.response?.statusCode == 401) {
            Logger.info(
              'Interceptor: sesion UAT expirada o no encontrada en backend',
            );
            onSessionExpired?.call();
          }
          handler.next(error);
        },
      ),
    );

    if (kDebugMode) {
      dio.interceptors.add(
        LogInterceptor(
          requestBody: true,
          responseBody: true,
          logPrint: (object) => Logger.info(object.toString()),
        ),
      );
    }

    return dio;
  }
}
