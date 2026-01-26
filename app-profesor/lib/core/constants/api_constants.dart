/// API endpoints constants
class ApiConstants {
  // Base configuration
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://apipresencia.110694.xyz',
  );
  static const int timeoutDuration = int.fromEnvironment(
    'API_TIMEOUT',
    defaultValue: 30000,
  );

  // Debug: Print the actual baseUrl value
  static void printConfig() {
    print('🔧 API Configuration:');
    print('   baseUrl: $baseUrl');
    print('   timeout: $timeoutDuration ms');
  }

  // Auth endpoints
  static const String auth = '/auth';
  static const String login = '/professors/login';
  static const String logout = '/auth/logout';
  static const String refresh = '/auth/refresh';
  static const String validateToken = '/auth/validate';
  static const String me = '/auth/me';

  // Feature endpoints
  static const String professors = '/professors';
  static const String students = '/students';
  static const String groups = '/groups';
  static const String attendance = '/attendance';
  static const String reports = '/reports';
}
