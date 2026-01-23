import 'package:flutter/foundation.dart';
import '../../services/auth_storage_service.dart';
import 'utils.dart';

/// Herramientas de debug para desarrollo
class DebugTools {
  /// Limpiar todo el storage (útil para testing)
  static Future<void> clearAllStorage() async {
    if (kDebugMode) {
      try {
        Logger.info('🧹 Limpiando todo el storage...');
        final authStorage = AuthStorageService();
        await authStorage.init();
        await authStorage.clearSession();
        Logger.info('✅ Storage limpiado exitosamente');
      } catch (e, stackTrace) {
        Logger.error('❌ Error limpiando storage', e, stackTrace);
      }
    }
  }

  /// Verificar si hay sesión guardada
  static Future<void> checkStoredSession() async {
    if (kDebugMode) {
      try {
        Logger.info('🔍 Verificando sesión almacenada...');
        final authStorage = AuthStorageService();
        await authStorage.init();

        final hasSession = authStorage.hasActiveSession();
        Logger.info('📊 Tiene sesión activa: $hasSession');

        if (hasSession) {
          final token = authStorage.getToken();
          final profesor = authStorage.getProfesor();

          Logger.info('🎫 Token: ${token?.substring(0, 20)}...');
          Logger.info('👤 Profesor: ${profesor?.nombreCompleto}');
          Logger.info('📧 Email: ${profesor?.email}');

          final isValid = authStorage.isTokenValid();
          Logger.info('✅ Token válido: $isValid');
        }
      } catch (e, stackTrace) {
        Logger.error('❌ Error verificando sesión', e, stackTrace);
      }
    }
  }

  /// Mostrar información de debug
  static void showDebugInfo() {
    if (kDebugMode) {
      Logger.info('🐛 Debug Mode: Enabled');
      Logger.info('📱 Platform: ${defaultTargetPlatform.name}');
      Logger.info('🔧 Release Mode: ${kReleaseMode ? "Yes" : "No"}');
    }
  }
}
