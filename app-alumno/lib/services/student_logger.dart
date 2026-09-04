import 'dart:async';

import 'package:flutter/foundation.dart';

import 'app_log_service.dart';

class StudentLogger {
  StudentLogger._();

  static void debug(
    String eventName,
    String message, {
    Map<String, dynamic>? context,
  }) => _write('DEBUG', eventName, message, context: context);
  static void info(
    String eventName,
    String message, {
    Map<String, dynamic>? context,
  }) => _write('INFO', eventName, message, context: context);
  static void warning(
    String eventName,
    String message, {
    Object? error,
    StackTrace? stackTrace,
    Map<String, dynamic>? context,
  }) => _write(
    'WARN',
    eventName,
    message,
    error: error,
    stackTrace: stackTrace,
    context: context,
  );
  static void error(
    String eventName,
    String message, {
    Object? error,
    StackTrace? stackTrace,
    Map<String, dynamic>? context,
  }) => _write(
    'ERROR',
    eventName,
    message,
    error: error,
    stackTrace: stackTrace,
    context: context,
  );

  static void _write(
    String level,
    String eventName,
    String message, {
    Object? error,
    StackTrace? stackTrace,
    Map<String, dynamic>? context,
  }) {
    debugPrint('[$eventName] $message${error == null ? '' : ': $error'}');
    unawaited(
      AppLogService.instance.record(
        level: level,
        eventName: eventName,
        message: message,
        error: error,
        stackTrace: stackTrace,
        context: context,
      ),
    );
  }
}
