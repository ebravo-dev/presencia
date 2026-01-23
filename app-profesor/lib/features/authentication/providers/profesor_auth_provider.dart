import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../shared/models/profesor.dart';
import '../../../shared/models/grupo.dart';
import '../../../services/api_service.dart';
import '../../../services/auth_storage_service.dart';
import '../../../core/utils/utils.dart';

/// Estado de la autenticación del profesor
enum ProfesorAuthStatus {
  initial,
  loading,
  authenticated,
  unauthenticated,
  error,
}

/// Estado del profesor autenticado
class ProfesorAuthState {
  final ProfesorAuthStatus status;
  final Profesor? profesor;
  final List<Grupo> grupos;
  final String? token;
  final String? errorMessage;

  const ProfesorAuthState({
    this.status = ProfesorAuthStatus.initial,
    this.profesor,
    this.grupos = const [],
    this.token,
    this.errorMessage,
  });

  ProfesorAuthState copyWith({
    ProfesorAuthStatus? status,
    Profesor? profesor,
    List<Grupo>? grupos,
    String? token,
    String? errorMessage,
  }) {
    return ProfesorAuthState(
      status: status ?? this.status,
      profesor: profesor ?? this.profesor,
      grupos: grupos ?? this.grupos,
      token: token ?? this.token,
      errorMessage: errorMessage ?? this.errorMessage,
    );
  }

  bool get isAuthenticated =>
      status == ProfesorAuthStatus.authenticated && profesor != null;
  bool get isLoading => status == ProfesorAuthStatus.loading;
  bool get hasError => status == ProfesorAuthStatus.error;
}

/// Provider del servicio de API
final apiServiceProvider = Provider<ApiService>((ref) {
  return ApiService();
});

/// Provider del servicio de almacenamiento de autenticación
final authStorageServiceProvider = Provider<AuthStorageService>((ref) {
  return AuthStorageService();
});

/// Notifier para manejar la autenticación del profesor
class ProfesorAuthNotifier extends StateNotifier<ProfesorAuthState> {
  final ApiService _apiService;
  final AuthStorageService _authStorage;

  ProfesorAuthNotifier(this._apiService, this._authStorage)
    : super(const ProfesorAuthState());

  /// Iniciar sesión del profesor (crea cuenta automáticamente si no existe)
  Future<void> login(String email, String password) async {
    try {
      Logger.info('Iniciando login del profesor con email: $email');
      state = state.copyWith(
        status: ProfesorAuthStatus.loading,
        errorMessage: null,
      );

      final result = await _apiService.loginProfesor(
        email: email,
        password: password,
      );

      result.fold(
        (error) {
          Logger.error('Error en login: $error');
          state = state.copyWith(
            status: ProfesorAuthStatus.error,
            errorMessage: error,
          );
        },
        (loginResponse) async {
          Logger.info(
            'Login exitoso para: ${loginResponse.profesor.nombreCompleto}',
          );

          // Guardar sesión en almacenamiento local
          await _authStorage.saveSession(
            token: loginResponse.token,
            profesor: loginResponse.profesor,
          );

          state = state.copyWith(
            status: ProfesorAuthStatus.authenticated,
            profesor: loginResponse.profesor,
            token: loginResponse.token,
          );

          // Cargar grupos del profesor
          await _loadGrupos();
        },
      );
    } catch (e, stackTrace) {
      Logger.error('Error inesperado en login', e, stackTrace);
      state = state.copyWith(
        status: ProfesorAuthStatus.error,
        errorMessage: 'Error inesperado durante el login',
      );
    }
  }

  /// Cargar grupos del profesor autenticado
  /// Si [forceRefresh] es true, ignora el cache y carga desde el servidor
  Future<void> _loadGrupos({bool forceRefresh = false}) async {
    if (state.profesor == null || state.token == null) return;

    try {
      // Primero intentar cargar desde storage local si no es refresh forzado
      if (!forceRefresh) {
        final cachedGrupos = _authStorage.getGrupos();
        if (cachedGrupos != null && cachedGrupos.isNotEmpty) {
          Logger.info(
            '💾 ${cachedGrupos.length} clases cargadas desde cache local',
          );
          state = state.copyWith(grupos: cachedGrupos);
          return; // No hacer petición HTTP
        }
      }

      // Si no hay cache o es refresh forzado, cargar desde el servidor
      Logger.info(
        '🌐 Cargando clases desde el servidor: ${state.profesor!.id}',
      );

      final result = await _apiService.getGruposProfesor(state.token!);

      result.fold(
        (error) {
          Logger.error('Error cargando clases: $error');
          // Si falla, intentar usar cache como fallback
          final cachedGrupos = _authStorage.getGrupos();
          if (cachedGrupos != null && cachedGrupos.isNotEmpty) {
            Logger.info(
              '⚠️ Usando cache como fallback: ${cachedGrupos.length} clases',
            );
            state = state.copyWith(grupos: cachedGrupos);
          }
        },
        (grupos) async {
          Logger.info('✅ ${grupos.length} clases descargadas del servidor');
          state = state.copyWith(grupos: grupos);
          // Guardar en cache para futuras sesiones
          await _authStorage.saveGrupos(grupos);
          Logger.info('💾 Clases guardadas en cache local');
        },
      );
    } catch (e, stackTrace) {
      Logger.error('Error inesperado cargando clases', e, stackTrace);
      // Intentar usar cache como fallback en caso de error
      final cachedGrupos = _authStorage.getGrupos();
      if (cachedGrupos != null && cachedGrupos.isNotEmpty) {
        Logger.info(
          '⚠️ Usando cache como fallback tras error: ${cachedGrupos.length} clases',
        );
        state = state.copyWith(grupos: cachedGrupos);
      }
    }
  }

  /// Refrescar grupos del profesor (fuerza descarga desde servidor)
  Future<void> refreshGrupos() async {
    if (!state.isAuthenticated) return;
    Logger.info('🔄 Refrescando clases (forzando descarga desde servidor)');
    await _loadGrupos(forceRefresh: true);
  }

  /// Verificar si existe una sesión almacenada y restaurarla
  Future<void> checkStoredSession() async {
    try {
      Logger.info('Verificando sesión almacenada');

      if (_authStorage.hasActiveSession()) {
        final token = _authStorage.getToken();
        final profesor = _authStorage.getProfesor();

        if (token != null && profesor != null) {
          Logger.info(
            'Sesión válida encontrada para: ${profesor.nombreCompleto}',
          );

          state = state.copyWith(
            status: ProfesorAuthStatus.authenticated,
            profesor: profesor,
            token: token,
          );

          // Cargar grupos del profesor
          await _loadGrupos();
        } else {
          Logger.info('Sesión inválida o expirada');
          await _authStorage.clearSession();
          // Establecer estado explícitamente como no autenticado
          state = const ProfesorAuthState(
            status: ProfesorAuthStatus.unauthenticated,
          );
        }
      } else {
        Logger.info('No hay sesión almacenada');
        // Establecer estado explícitamente como no autenticado
        state = const ProfesorAuthState(
          status: ProfesorAuthStatus.unauthenticated,
        );
      }
    } catch (e, stackTrace) {
      Logger.error('Error verificando sesión almacenada', e, stackTrace);
      await _authStorage.clearSession();
      // Establecer estado explícitamente como no autenticado en caso de error
      state = const ProfesorAuthState(
        status: ProfesorAuthStatus.unauthenticated,
      );
    }
  }

  /// Cerrar sesión
  Future<void> logout() async {
    Logger.info('Cerrando sesión del profesor');
    await _authStorage.clearSession();
    state = const ProfesorAuthState(status: ProfesorAuthStatus.unauthenticated);
  }

  /// Limpiar error
  void clearError() {
    if (state.hasError) {
      state = state.copyWith(
        status: state.profesor != null
            ? ProfesorAuthStatus.authenticated
            : ProfesorAuthStatus.unauthenticated,
        errorMessage: null,
      );
    }
  }
}

/// Provider del estado de autenticación del profesor
final profesorAuthProvider =
    StateNotifierProvider<ProfesorAuthNotifier, ProfesorAuthState>((ref) {
      final apiService = ref.watch(apiServiceProvider);
      final authStorage = ref.watch(authStorageServiceProvider);
      return ProfesorAuthNotifier(apiService, authStorage);
    });

/// Provider para verificar si el profesor está autenticado
final isProfesorAuthenticatedProvider = Provider<bool>((ref) {
  final state = ref.watch(profesorAuthProvider);
  return state.isAuthenticated;
});

/// Provider para obtener el profesor actual
final currentProfesorProvider = Provider<Profesor?>((ref) {
  final state = ref.watch(profesorAuthProvider);
  return state.profesor;
});

/// Provider para obtener los grupos del profesor actual
final profesorGruposProvider = Provider<List<Grupo>>((ref) {
  final state = ref.watch(profesorAuthProvider);
  return state.grupos;
});

/// Provider para obtener el estado de carga
final profesorAuthLoadingProvider = Provider<bool>((ref) {
  final state = ref.watch(profesorAuthProvider);
  return state.isLoading;
});

/// Provider para obtener el error actual
final profesorAuthErrorProvider = Provider<String?>((ref) {
  final state = ref.watch(profesorAuthProvider);
  return state.errorMessage;
});
