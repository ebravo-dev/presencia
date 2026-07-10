class AppEnvironment {
  AppEnvironment._();

  static const String presenceApiBaseUrl = String.fromEnvironment(
    'PRESENCIA_API_BASE_URL',
    defaultValue: 'https://backendapirest.149828.xyz',
  );

  static const String studentBindingApiBaseUrl = String.fromEnvironment(
    'STUDENT_BINDING_API_BASE_URL',
    defaultValue: 'https://backendasistencia.duckdns.org',
  );

  static const int apiTimeoutMs = int.fromEnvironment(
    'PRESENCIA_API_TIMEOUT',
    defaultValue: 12000,
  );
}
