import '../utils/utils.dart';

/// API endpoints constants for the Fastify ACL backend.
class ApiConstants {
  // Base configuration for the main Presencia backend.
  // For Android emulator use:
  // --dart-define=API_BASE_URL=http://10.0.2.2:3000
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://administracionuat.149828.xyz/',
  );
  static const String presenceApiBaseUrl = String.fromEnvironment(
    'PRESENCIA_API_BASE_URL',
    defaultValue: baseUrl,
  );
  static const String attendanceBackendBaseUrl = String.fromEnvironment(
    'ATTENDANCE_BACKEND_URL',
    defaultValue: 'https://backendasistencia.duckdns.org/',
  );
  static const String mainBackendBaseUrl = String.fromEnvironment(
    'MAIN_BACKEND_API_URL',
    defaultValue: 'https://backendasistencia.duckdns.org/',
  );
  static const bool useBackendApiRest = bool.fromEnvironment(
    'USE_BACKEND_API_REST',
    defaultValue: true,
  );
  static const bool presenciaDebugMode = bool.fromEnvironment(
    'PRESENCIA_DEBUG_MODE',
    defaultValue: false,
  );
  static const bool skipApiRestAttendanceUpload = bool.fromEnvironment(
    'SKIP_API_REST_ATTENDANCE_UPLOAD',
    defaultValue: false,
  );
  static const bool debugExtraCurrentClass = bool.fromEnvironment(
    'PRESENCIA_DEBUG_EXTRA_CURRENT_CLASS',
    defaultValue: false,
  );
  static const bool debugSimulateRoomBeacon = bool.fromEnvironment(
    'PRESENCIA_DEBUG_SIMULATE_ROOM_BEACON',
    defaultValue: false,
  );
  static const String debugExtraClassCode = String.fromEnvironment(
    'PRESENCIA_DEBUG_EXTRA_CLASS_CODE',
    defaultValue: '990001',
  );
  static const String debugExtraClassGroupLetter = String.fromEnvironment(
    'PRESENCIA_DEBUG_EXTRA_CLASS_GROUP',
    defaultValue: 'DBG',
  );
  static const String debugExtraClassPeriod = String.fromEnvironment(
    'PRESENCIA_DEBUG_EXTRA_CLASS_PERIOD',
    defaultValue: '2026-2',
  );
  static const String debugExtraClassroom = String.fromEnvironment(
    'PRESENCIA_DEBUG_EXTRA_CLASSROOM',
    defaultValue: 'DEBUG-101',
  );
  static const String debugExtraClassName = String.fromEnvironment(
    'PRESENCIA_DEBUG_EXTRA_CLASS_NAME',
    defaultValue: 'DEBUG ASISTENCIA ACTUAL',
  );
  static const int debugExtraClassHours = int.fromEnvironment(
    'PRESENCIA_DEBUG_EXTRA_CLASS_HOURS',
    defaultValue: 4,
  );
  static const String debugExtraBeaconUuid = String.fromEnvironment(
    'PRESENCIA_DEBUG_EXTRA_BEACON_UUID',
    defaultValue: '11111111-2222-4333-8444-555555555555',
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
  static const int uatAcademicYear = int.fromEnvironment(
    'UAT_ACADEMIC_YEAR',
    defaultValue: 2026,
  );
  static const int uatAcademicTerm = int.fromEnvironment(
    'UAT_ACADEMIC_TERM',
    defaultValue: 1,
  );

  static void printConfig() {
    Logger.info('API Configuration:');
    Logger.info('   Backend baseUrl: $baseUrl');
    Logger.info('   Presencia baseUrl: $presenceApiBaseUrl');
    Logger.info('   Attendance backend baseUrl: $attendanceBackendBaseUrl');
    Logger.info('   Main backend baseUrl: $mainBackendBaseUrl');
    Logger.info('   Use backend API REST: $useBackendApiRest');
    Logger.info('   Debug mode: $presenciaDebugMode');
    Logger.info(
      '   Skip API REST attendance upload: $skipApiRestAttendanceUpload',
    );
    Logger.info('   Debug extra current class: $debugExtraCurrentClass');
    Logger.info('   Debug simulate room beacon: $debugSimulateRoomBeacon');
    Logger.info('   Debug extra class hours: $debugExtraClassHours');
    Logger.info('   timeout: $timeoutDuration ms');
    Logger.info('   UAT cycle: $uatDefaultIdCiclo');
    Logger.info('   UAT DES: $uatDefaultIdDes');
    Logger.info('   UAT academic cycle: $uatAcademicYear-$uatAcademicTerm');
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
  static const String uatSharedClasses = '/api/uat/profesor/clases-compartidas';
  static const String uatControlSemanas =
      '/api/uat/profesor/control-asistencia/semanas';
  static const String uatControlAsistenciaGrupo =
      '/api/uat/profesor/control-asistencia/asistencia-grupo';
  static const String uatControlGuardarAsistencias =
      '/api/uat/profesor/control-asistencia/asistencias';
  static const String uatAsistenciaGuardar = '/api/uat/asistencia/guardar';
  static const String uatAttendanceBatches = '/api/uat/asistencia/lotes';
  static const String uatAttendanceRecordStatuses =
      '/api/uat/asistencia/registros/estado';

  // Legacy feature aliases retained only for compatibility.
  static const String professors = '/professors';
  static const String students = '/students';
  static const String groups = classes;
  static const String attendance = '/attendance';
  static const String reports = '/reports';
}
