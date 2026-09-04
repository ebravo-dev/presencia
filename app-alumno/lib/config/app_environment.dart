class AppEnvironment {
  AppEnvironment._();

  static const String presenceApiBaseUrl = String.fromEnvironment(
    'PRESENCIA_API_BASE_URL',
    defaultValue: 'https://dashboarduat.presenciauat.fit',
  );

  // Toda llamada pública entra por el Gateway; Attendance no se expone
  // directamente a los clientes móviles.
  static const String studentBindingApiBaseUrl = presenceApiBaseUrl;

  static const int apiTimeoutMs = int.fromEnvironment(
    'PRESENCIA_API_TIMEOUT',
    defaultValue: 12000,
  );

  static const String appLogIngestionKey = String.fromEnvironment(
    'PRESENCIA_LOG_INGESTION_KEY',
    defaultValue: 'development-app-log-ingestion-key-change-me',
  );
  static const String appVersion = String.fromEnvironment(
    'PRESENCIA_APP_VERSION',
    defaultValue: '1.2.0',
  );
  static const String appBuildNumber = String.fromEnvironment(
    'PRESENCIA_APP_BUILD_NUMBER',
    defaultValue: '5',
  );
}
