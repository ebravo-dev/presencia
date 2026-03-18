import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dartz/dartz.dart';
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
  sessionExpired, // token caducó — datos locales intactos, sólo se pide re-login
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
  bool get isSessionExpired => status == ProfesorAuthStatus.sessionExpired;
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

          // Save password for sync/retry and set sync flag
          final encryptedPassword = _apiService.encryptPassword(password);
          await _authStorage.saveEncryptedPassword(encryptedPassword);

          if (loginResponse.needsSync == true) {
            await _authStorage.setSyncInProgress(true);
          }

          state = state.copyWith(
            status: ProfesorAuthStatus.authenticated,
            profesor: loginResponse.profesor,
            token: loginResponse.token,
          );

          // Cargar grupos del profesor (from local cache if available)
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
        (data) async {
          Logger.info('✅ ${data.grupos.length} clases descargadas del servidor');
          state = state.copyWith(grupos: data.grupos);
          // Guardar en cache para futuras sesiones
          await _authStorage.saveGrupos(data.grupos);
          // Guardar beacons
          await _authStorage.saveBeacons(data.beacons);
          Logger.info('💾 Clases y beacons guardados en cache local');
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

  /// Limpiar grupos locales (usado al iniciar nueva sincronización)
  Future<void> clearGrupos() async {
    state = state.copyWith(grupos: []);
    await _authStorage.clearGrupos();
  }

  /// Sincronizar ciclo (scraping forzado)
  Future<Either<String, String>> syncGroups(String password) async {
    if (!state.isAuthenticated ||
        state.profesor == null ||
        state.token == null) {
      return Left('No hay sesión activa');
    }

    // Set sync in progress flag for app redirect on reopen
    await _authStorage.setSyncInProgress(true);

    // Save encrypted password locally for retry
    final encryptedPassword = _apiService.ensureEncryptedPassword(password);
    await _authStorage.saveEncryptedPassword(encryptedPassword);

    // Clear local groups before syncing to avoid showing stale data
    await clearGrupos();

    // Usar ApiService para iniciar sync forzada
    return _apiService.forceSync(
      email: state.profesor!.institutionalEmail,
      encryptedPassword: encryptedPassword,
      token: state.token!,
    );
  }

  /// Verificar si existe una sesión almacenada y restaurarla.
  /// Valida la expiración del JWT antes de restaurar como "autenticado".
  Future<void> checkStoredSession() async {
    try {
      Logger.info('Verificando sesión almacenada');

      if (_authStorage.hasActiveSession()) {
        final token = _authStorage.getToken();
        final profesor = _authStorage.getProfesor();

        if (token != null && token.isNotEmpty && profesor != null) {
          // Validar si el JWT no ha expirado localmente
          final tokenValido = _authStorage.isTokenValid();

          if (!tokenValido) {
            // Token expirado — conservar datos locales, pedir re-auth
            Logger.info(
              '⚠️ Token expirado para ${profesor.nombreCompleto} — solicitando re-login',
            );
            // Guardar solo el profesor (sin token) para mostrar en relogin
            state = ProfesorAuthState(
              status: ProfesorAuthStatus.sessionExpired,
              profesor: profesor,
              token: null,
              errorMessage: 'Tu sesión expiró. Ingresa tu contraseña para continuar.',
            );
            // Intentar relogin automático con contraseña guardada
            await relogin();
            return;
          }

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
          Logger.info('Sesión inválida — limpiando');
          await _authStorage.clearSession();
          state = const ProfesorAuthState(status: ProfesorAuthStatus.unauthenticated);
        }
      } else {
        Logger.info('No hay sesión almacenada');
        state = const ProfesorAuthState(status: ProfesorAuthStatus.unauthenticated);
      }
    } catch (e, stackTrace) {
      Logger.error('Error verificando sesión almacenada', e, stackTrace);
      await _authStorage.clearSession();
      state = const ProfesorAuthState(status: ProfesorAuthStatus.unauthenticated);
    }
  }

  /// Cerrar sesión
  Future<void> logout() async {
    Logger.info('Cerrando sesión del profesor');
    await _authStorage.clearSession();
    state = const ProfesorAuthState(status: ProfesorAuthStatus.unauthenticated);
  }

  /// Marcar sesión como expirada (llamado por el interceptor 401 de Dio).
  /// Conserva datos locales (profesor, grupos) para mostrar info al usuario,
  /// sólo invalida el token.
  void markSessionExpired() {
    if (state.status == ProfesorAuthStatus.sessionExpired) return; // ya marcado
    Logger.info('⚠️ Sesión expirada — solicitando re-autenticación');
    // Borrar token del storage pero conservar el resto
    _authStorage.saveToken('');
    state = state.copyWith(
      status: ProfesorAuthStatus.sessionExpired,
      token: null,
      errorMessage: 'Tu sesión expiró. Vuelve a ingresar tu contraseña.',
    );
  }

  /// Re-autenticación ligera: usa email guardado + contraseña encriptada almacenada,
  /// o acepta una contraseña en texto plano nueva.
  Future<void> relogin({String? plainPassword}) async {
    final profesor = state.profesor ?? _authStorage.getProfesor();
    if (profesor == null) {
      // No hay datos de profesor — logout completo
      await logout();
      return;
    }

    state = state.copyWith(
      status: ProfesorAuthStatus.loading,
      errorMessage: null,
      profesor: profesor,
    );

    Either<String, LoginResponse> result;

    if (plainPassword != null && plainPassword.isNotEmpty) {
      // Login con contraseña nueva en texto plano
      result = await _apiService.loginProfesor(
        email: profesor.institutionalEmail,
        password: plainPassword,
      );
    } else {
      // Intentar con la contraseña encriptada guardada
      final encryptedPwd = _authStorage.getEncryptedPassword();
      if (encryptedPwd == null || encryptedPwd.isEmpty) {
        // No hay contraseña guardada — pedir al usuario
        state = state.copyWith(
          status: ProfesorAuthStatus.sessionExpired,
          errorMessage: 'Ingresa tu contraseña para continuar.',
        );
        return;
      }
      result = await _apiService.loginProfesorWithEncryptedPassword(
        email: profesor.institutionalEmail,
        encryptedPassword: encryptedPwd,
      );
    }

    result.fold(
      (error) {
        Logger.error('Error en re-login: $error');
        state = state.copyWith(
          status: ProfesorAuthStatus.sessionExpired,
          errorMessage: error,
        );
      },
      (loginResponse) async {
        Logger.info('Re-login exitoso para: ${loginResponse.profesor.nombreCompleto}');
        await _authStorage.saveSession(
          token: loginResponse.token,
          profesor: loginResponse.profesor,
        );
        // Actualizar contraseña encriptada si se usó plainPassword
        if (plainPassword != null && plainPassword.isNotEmpty) {
          final enc = _apiService.encryptPassword(plainPassword);
          await _authStorage.saveEncryptedPassword(enc);
        }
        state = state.copyWith(
          status: ProfesorAuthStatus.authenticated,
          profesor: loginResponse.profesor,
          token: loginResponse.token,
          errorMessage: null,
        );
        // Recargar grupos si no hay cache
        await _loadGrupos();
      },
    );
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
      final notifier = ProfesorAuthNotifier(apiService, authStorage);
      // Registrar callback de 401 en ApiService sin dependencia circular.
      // markSessionExpired() tiene su propio guard interno.
      apiService.onSessionExpired = notifier.markSessionExpired;
      return notifier;
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
