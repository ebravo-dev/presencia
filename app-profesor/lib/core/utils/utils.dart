import 'dart:async';
import 'dart:convert';
import 'dart:developer' as dev;

import '../../services/app_log_service.dart';

/// Utility class for logging
class Logger {
  static void info(String message, [dynamic data]) {
    dev.log(message, name: 'INFO');
    _writeDeveloperData(data, 'DATA');
    unawaited(
      AppLogService.instance.record(
        level: 'INFO',
        eventName: 'app.log.info',
        message: message,
        context: _logContext(data),
      ),
    );
  }

  static void error(String message, [dynamic error, StackTrace? stackTrace]) {
    dev.log(message, name: 'ERROR', error: error, stackTrace: stackTrace);
    unawaited(
      AppLogService.instance.record(
        level: 'ERROR',
        eventName: 'app.log.error',
        message: message,
        error: error,
        stackTrace: stackTrace,
      ),
    );
  }

  static void debug(String message, [dynamic data]) {
    dev.log(message, name: 'DEBUG');
    _writeDeveloperData(data, 'DEBUG_DATA');
    unawaited(
      AppLogService.instance.record(
        level: 'DEBUG',
        eventName: 'app.log.debug',
        message: message,
        context: _logContext(data),
      ),
    );
  }

  static Map<String, dynamic>? _logContext(dynamic data) {
    if (data == null) return null;
    if (data is Map) {
      return {
        for (final entry in data.entries) entry.key.toString(): entry.value,
      };
    }
    return {'data': data.toString()};
  }

  static void _writeDeveloperData(dynamic data, String name) {
    if (data == null) return;
    try {
      dev.log(jsonEncode(data), name: name);
    } catch (_) {
      dev.log(data.toString(), name: name);
    }
  }
}

/// Utility class for formatting
class Formatters {
  static String formatDate(DateTime date) {
    return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
  }

  static String formatTime(DateTime time) {
    return '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
  }

  static String formatDateTime(DateTime dateTime) {
    return '${formatDate(dateTime)} ${formatTime(dateTime)}';
  }
}
