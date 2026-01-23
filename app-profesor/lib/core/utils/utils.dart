import 'dart:convert';
import 'dart:developer' as dev;

/// Utility class for logging
class Logger {
  static void info(String message, [dynamic data]) {
    dev.log(message, name: 'INFO');
    if (data != null) {
      dev.log(jsonEncode(data), name: 'DATA');
    }
  }

  static void error(String message, [dynamic error, StackTrace? stackTrace]) {
    dev.log(message, name: 'ERROR', error: error, stackTrace: stackTrace);
  }

  static void debug(String message, [dynamic data]) {
    dev.log(message, name: 'DEBUG');
    if (data != null) {
      dev.log(jsonEncode(data), name: 'DEBUG_DATA');
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
