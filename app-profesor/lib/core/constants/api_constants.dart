import '../utils/utils.dart';

/// API endpoints constants for the Fastify ACL backend.
class ApiConstants {
  // Base configuration for the backend-apirest bridge.
  // For Android emulator use:
  // --dart-define=API_BASE_URL=http://10.0.2.2:3100
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://backendapirest.149828.xyz',
  );
  static const int timeoutDuration = int.fromEnvironment(
    'API_TIMEOUT',
    defaultValue: 30000,
  );
  static const int uatDefaultIdCiclo = int.fromEnvironment(
    'UAT_ID_CICLO',
    defaultValue: 150,
  );
  static const int uatDefaultIdDes = int.fromEnvironment(
    'UAT_ID_DES',
    defaultValue: 12,
  );

  static void printConfig() {
    Logger.info('API Configuration:');
    Logger.info('   baseUrl: $baseUrl');
    Logger.info('   timeout: $timeoutDuration ms');
    Logger.info('   UAT cycle: $uatDefaultIdCiclo');
    Logger.info('   UAT DES: $uatDefaultIdDes');
  }

  // Legacy auth aliases kept for screens/services that still reference them.
  static const String auth = '/auth';
  static const String login = uatSessions;
  static const String logout = '/auth/logout';
  static const String refresh = '/auth/refresh';
  static const String validateToken = '/auth/validate';
  static const String me = '/auth/me';

  // backend-apirest UAT endpoints.
  static const String uatSessions = '/api/uat/sessions';
  static const String uatHorarios = '/api/uat/profesor/consultas/horarios';
  static const String uatExamenes = '/api/uat/profesor/consultas/examenes';
  static const String uatCatalogoNiveles =
      '/api/uat/catalogos/niveles-educativos';
  static const String uatCatalogoCampus = '/api/uat/catalogos/campus';
  static const String uatCatalogoDes = '/api/uat/catalogos/des';
  static const String uatCatalogoCiclos = '/api/uat/catalogos/ciclos-escolares';
  static const String uatControlGrupos =
      '/api/uat/profesor/control-asistencia/grupos';
  static const String uatControlSemanas =
      '/api/uat/profesor/control-asistencia/semanas';
  static const String uatControlAsistenciaGrupo =
      '/api/uat/profesor/control-asistencia/asistencia-grupo';
  static const String uatControlGuardarAsistencias =
      '/api/uat/profesor/control-asistencia/asistencias';
  static const String uatAsistenciaGuardar = '/api/uat/asistencia/guardar';

  // Legacy feature aliases retained only for compatibility.
  static const String professors = '/api/uat/profesor';
  static const String students = '/students';
  static const String groups = uatControlGrupos;
  static const String attendance = uatAsistenciaGuardar;
  static const String reports = '/reports';
}
