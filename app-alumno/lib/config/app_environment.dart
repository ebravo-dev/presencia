class AppEnvironment {
  AppEnvironment._();

  static const String presenceApiBaseUrl = String.fromEnvironment(
    'PRESENCIA_API_BASE_URL',
    defaultValue: 'https://debugasistencia.duckdns.org',
  );

  static const String studentBindingApiBaseUrl = String.fromEnvironment(
    'STUDENT_BINDING_API_BASE_URL',
    defaultValue: 'https://debugasistencia.duckdns.org',
  );

  static const int apiTimeoutMs = int.fromEnvironment(
    'PRESENCIA_API_TIMEOUT',
    defaultValue: 12000,
  );
}
