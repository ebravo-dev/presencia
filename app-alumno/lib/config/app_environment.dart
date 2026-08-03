class AppEnvironment {
  AppEnvironment._();

  static const String presenceApiBaseUrl = String.fromEnvironment(
    'PRESENCIA_API_BASE_URL',
    defaultValue: 'https://debugasistencia.duckdns.org',
  );

  // Toda llamada pública entra por el Gateway; Attendance no se expone
  // directamente a los clientes móviles.
  static const String studentBindingApiBaseUrl = presenceApiBaseUrl;

  static const int apiTimeoutMs = int.fromEnvironment(
    'PRESENCIA_API_TIMEOUT',
    defaultValue: 12000,
  );
}
