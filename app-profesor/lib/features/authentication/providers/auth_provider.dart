import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/auth_models.dart';
import '../services/auth_service.dart';
import '../services/auth_service_mock.dart';
import '../services/auth_service_http.dart';
import '../../../core/utils/utils.dart';

/// Provider para el servicio de autenticación
/// Cambia entre mock y HTTP basado en environment variable
final authServiceProvider = Provider<AuthService>((ref) {
  const useMock = bool.fromEnvironment('USE_MOCK', defaultValue: true);

  if (useMock) {
    Logger.info('Usando AuthServiceMock');
    return AuthServiceMock();
  } else {
    Logger.info('Usando AuthServiceHttp');
    return AuthServiceHttp();
  }
});

/// Provider para el estado de autenticación
final authStateProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  final authService = ref.watch(authServiceProvider);
  return AuthNotifier(authService);
});

/// Notifier para manejar el estado de autenticación
class AuthNotifier extends StateNotifier<AuthState> {
  final AuthService _authService;

  AuthNotifier(this._authService) : super(const AuthState()) {
    _checkAuthStatus();
  }

  /// Verificar estado de autenticación al inicializar
  Future<void> _checkAuthStatus() async {
    try {
      Logger.info('Verificando estado de autenticación inicial');
      state = state.copyWith(status: AuthStatus.loading);

      final user = await _authService.getCurrentUser();
      if (user != null) {
        // Usuario encontrado, obtener sus grupos
        final groups = await _authService.getUserGroups(user.id);

        state = state.copyWith(
          status: AuthStatus.authenticated,
          user: user,
          groups: groups,
        );

        Logger.info('Usuario autenticado encontrado: ${user.name}');
      } else {
        state = state.copyWith(status: AuthStatus.unauthenticated);
        Logger.info('No hay usuario autenticado');
      }
    } catch (e, stackTrace) {
      Logger.error('Error verificando estado de auth', e, stackTrace);
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        errorMessage: 'Error verificando autenticación',
      );
    }
  }

  /// Iniciar sesión con credenciales UAT
  Future<void> login(String email, String password) async {
    try {
      Logger.info('Iniciando proceso de login');
      state = state.copyWith(status: AuthStatus.loading, errorMessage: null);

      final result = await _authService.login(email, password);

      if (result.isSuccess && result.user != null) {
        state = state.copyWith(
          status: AuthStatus.authenticated,
          user: result.user,
          token: result.token,
          groups: result.groups ?? [],
          errorMessage: null,
        );

        Logger.info('Login exitoso para: ${result.user!.name}');
        Logger.info('Grupos cargados: ${result.groups?.length ?? 0}');
      } else {
        state = state.copyWith(
          status: AuthStatus.error,
          errorMessage: result.message ?? 'Error desconocido durante login',
        );

        Logger.error('Login fallido: ${result.message}');
      }
    } catch (e, stackTrace) {
      Logger.error('Excepción durante login', e, stackTrace);
      state = state.copyWith(
        status: AuthStatus.error,
        errorMessage: 'Error inesperado durante login',
      );
    }
  }

  /// Cerrar sesión
  Future<void> logout() async {
    try {
      Logger.info('Iniciando proceso de logout');
      state = state.copyWith(status: AuthStatus.loading);

      final result = await _authService.logout();

      // Limpiar estado independientemente del resultado del servicio
      state = const AuthState(status: AuthStatus.unauthenticated);

      if (result.isSuccess) {
        Logger.info('Logout exitoso');
      } else {
        Logger.error('Error durante logout: ${result.message}');
      }
    } catch (e, stackTrace) {
      Logger.error('Excepción durante logout', e, stackTrace);
      // Aún así limpiar el estado local
      state = const AuthState(status: AuthStatus.unauthenticated);
    }
  }

  /// Limpiar error
  void clearError() {
    state = state.copyWith(
      status: state.user != null
          ? AuthStatus.authenticated
          : AuthStatus.unauthenticated,
      errorMessage: null,
    );
  }

  /// Refrescar grupos del usuario
  Future<void> refreshUserGroups() async {
    if (state.user == null) return;

    try {
      Logger.info('Refrescando grupos del usuario');
      final groups = await _authService.getUserGroups(state.user!.id);

      state = state.copyWith(groups: groups);
      Logger.info('Grupos refrescados: ${groups.length}');
    } catch (e, stackTrace) {
      Logger.error('Error refrescando grupos', e, stackTrace);
    }
  }
}

/// Provider para verificar si el usuario está autenticado
final isAuthenticatedProvider = Provider<bool>((ref) {
  final authState = ref.watch(authStateProvider);
  return authState.isAuthenticated;
});

/// Provider para obtener el usuario actual
final currentUserProvider = Provider<User?>((ref) {
  final authState = ref.watch(authStateProvider);
  return authState.user;
});

/// Provider para obtener los grupos del usuario actual
final userGroupsProvider = Provider<List<Group>>((ref) {
  final authState = ref.watch(authStateProvider);
  return authState.groups ?? [];
});

/// Provider para obtener credenciales de prueba (solo en modo mock)
final testCredentialsProvider = Provider<Map<String, String>>((ref) {
  const useMock = bool.fromEnvironment('USE_MOCK', defaultValue: true);

  if (useMock) {
    return AuthServiceMock.getTestCredentials();
  }

  return {};
});
