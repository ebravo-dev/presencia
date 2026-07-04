import '../utils/utils.dart';

/// API endpoints constants for the Fastify ACL backend.
class ApiConstants {
  // Base configuration for the main Presencia backend.
  // For Android emulator use:
  // --dart-define=API_BASE_URL=http://10.0.2.2:3000
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://backendapirest.149828.xyz/',
  );
  static const String presenceApiBaseUrl = String.fromEnvironment(
    'PRESENCIA_API_BASE_URL',
    defaultValue: baseUrl,
  );
  static const int timeoutDuration = int.fromEnvironment(
    'API_TIMEOUT',
    defaultValue: 30000,
  );
  static const int presenceTimeoutDuration = int.fromEnvironment(
    'PRESENCIA_API_TIMEOUT',
    defaultValue: timeoutDuration,
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
    Logger.info('   Backend baseUrl: $baseUrl');
    Logger.info('   Presencia baseUrl: $presenceApiBaseUrl');
    Logger.info('   timeout: $timeoutDuration ms');
    Logger.info('   UAT cycle: $uatDefaultIdCiclo');
    Logger.info('   UAT DES: $uatDefaultIdDes');
  }

  // Main backend professor endpoints.
  static const String auth = '/auth';
  static const String login = '/professors/login';
  static const String classes = '/professors/classes';
  static const String sync = '/professors/sync';
  static const String logout = '/auth/logout';
  static const String refresh = '/auth/refresh';
  static const String validateToken = '/auth/validate';
  static const String me = '/auth/me';

  // UAT endpoints exposed through the main backend proxy.
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
  static const String uatSharedClasses =
      '/api/uat/profesor/clases-compartidas';
  static const String uatControlSemanas =
      '/api/uat/profesor/control-asistencia/semanas';
  static const String uatControlAsistenciaGrupo =
      '/api/uat/profesor/control-asistencia/asistencia-grupo';
  static const String uatControlGuardarAsistencias =
      '/api/uat/profesor/control-asistencia/asistencias';
  static const String uatAsistenciaGuardar = '/api/uat/asistencia/guardar';

  // Legacy feature aliases retained only for compatibility.
  static const String professors = '/professors';
  static const String students = '/students';
  static const String groups = classes;
  static const String attendance = '/attendance';
  static const String reports = '/reports';
}
