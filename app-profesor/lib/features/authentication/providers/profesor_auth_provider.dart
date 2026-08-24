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
  static const Object _notProvided = Object();

  final ProfesorAuthStatus status;
  final Profesor? profesor;
  final List<Grupo> grupos;
  final String? token;
  final String? errorMessage;
  final String? groupsNotice;
  final bool isLoadingGroups;

  const ProfesorAuthState({
    this.status = ProfesorAuthStatus.initial,
    this.profesor,
    this.grupos = const [],
    this.token,
    this.errorMessage,
    this.groupsNotice,
    this.isLoadingGroups = false,
  });

  ProfesorAuthState copyWith({
    ProfesorAuthStatus? status,
    Profesor? profesor,
    List<Grupo>? grupos,
    Object? token = _notProvided,
    Object? errorMessage = _notProvided,
    Object? groupsNotice = _notProvided,
    bool? isLoadingGroups,
  }) {
    return ProfesorAuthState(
      status: status ?? this.status,
      profesor: profesor ?? this.profesor,
      grupos: grupos ?? this.grupos,
      token: identical(token, _notProvided) ? this.token : token as String?,
      errorMessage: identical(errorMessage, _notProvided)
          ? this.errorMessage
          : errorMessage as String?,
      groupsNotice: identical(groupsNotice, _notProvided)
          ? this.groupsNotice
          : groupsNotice as String?,
      isLoadingGroups: isLoadingGroups ?? this.isLoadingGroups,
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

      await result.fold(
        (error) async {
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

          // La credencial UAT queda cifrada por Keychain/Keystore y se usa
          // únicamente para operaciones de sincronización.
          await _authStorage.cacheUatPasswordForProcess(password);

          if (loginResponse.needsSync == true) {
            await _authStorage.setSyncInProgress(true);
          }

          state = state.copyWith(
            status: ProfesorAuthStatus.authenticated,
            profesor: loginResponse.profesor,
            token: loginResponse.token,
            grupos: [],
            groupsNotice: null,
          );

          // Cargar grupos y configuración de aulas desde el servidor
          await _loadGrupos(forceRefresh: true);
          await _authStorage.setSyncInProgress(false);
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
          final debugData = _apiService.withDebugCurrentClass(
            cachedGrupos,
            _authStorage.getBeacons() ?? const <Map<String, dynamic>>[],
          );
          Logger.info(
            '💾 ${debugData.grupos.length} clases cargadas desde cache local',
          );
          await _authStorage.saveBeacons(debugData.beacons);
          state = state.copyWith(
            grupos: debugData.grupos,
            isLoadingGroups: false,
          );
          // Mostrar cache al instante, pero continuar con una descarga en
          // segundo plano para ver materias debug agregadas desde el dashboard.
        }
      }

      // Si no hay cache o es refresh forzado, cargar desde el servidor
      Logger.info(
        '🌐 Cargando clases desde el servidor: ${state.profesor!.id}',
      );

      state = state.copyWith(isLoadingGroups: true);

      final result = await _apiService.getGruposProfesor(state.token!);

      await result.fold(
        (error) async {
          Logger.error('Error cargando clases: $error');
          // Un login o una sincronizacion explicita nunca deben rescatar
          // silenciosamente clases de un ciclo anterior.
          if (forceRefresh) {
            await _authStorage.clearGrupos();
            await _authStorage.saveBeacons(const []);
            state = state.copyWith(
              grupos: [],
              isLoadingGroups: false,
              groupsNotice:
                  'No se pudieron consultar las clases del ciclo actual. '
                  'No se mostrarán datos guardados de ciclos anteriores.',
            );
            return;
          }

          // Al restaurar una sesion se permite continuar sin conexion con la
          // ultima cache conocida, dejando claro que no fue actualizada.
          final cachedGrupos = _authStorage.getGrupos();
          if (cachedGrupos != null && cachedGrupos.isNotEmpty) {
            final debugData = _apiService.withDebugCurrentClass(
              cachedGrupos,
              _authStorage.getBeacons() ?? const <Map<String, dynamic>>[],
            );
            Logger.info(
              '⚠️ Usando cache como fallback: ${debugData.grupos.length} clases',
            );
            await _authStorage.saveBeacons(debugData.beacons);
            state = state.copyWith(
              grupos: debugData.grupos,
              token: _authStorage.getToken() ?? state.token,
              isLoadingGroups: false,
              groupsNotice:
                  'No se pudo verificar el ciclo actual. Estas son las '
                  'últimas clases guardadas en el dispositivo.',
            );
          } else {
            state = state.copyWith(
              isLoadingGroups: false,
              groupsNotice:
                  'No se pudieron consultar las clases del ciclo actual.',
            );
          }
        },
        (data) async {
          Logger.info(
            '✅ ${data.grupos.length} clases descargadas del servidor',
          );
          final groupsNotice = data.classesPending
              ? 'Las clases y listas del ciclo ${data.cycle.name} aún no '
                    'están disponibles. No se mostrarán clases de ciclos '
                    'anteriores.'
              : data.rostersPending
              ? 'Las listas de alumnos del ciclo ${data.cycle.name} aún no '
                    'están disponibles para ${data.unavailableRosterCount} '
                    '${data.unavailableRosterCount == 1 ? 'clase' : 'clases'}.'
              : null;
          state = state.copyWith(
            grupos: data.grupos,
            isLoadingGroups: false,
            groupsNotice: groupsNotice,
          );
          final refreshedToken = _authStorage.getToken();
          if (refreshedToken != null && refreshedToken.isNotEmpty) {
            state = state.copyWith(token: refreshedToken);
          }
          // Guardar en cache para futuras sesiones
          await _authStorage.saveGrupos(data.grupos);
          // Guardar beacons
          await _authStorage.saveBeacons(data.beacons);
          Logger.info(
            '💾 Clases y configuración de aulas guardados en cache local',
          );
        },
      );
    } catch (e, stackTrace) {
      Logger.error('Error inesperado cargando clases', e, stackTrace);
      if (forceRefresh) {
        await _authStorage.clearGrupos();
        await _authStorage.saveBeacons(const []);
        state = state.copyWith(
          grupos: [],
          isLoadingGroups: false,
          groupsNotice:
              'No se pudieron consultar las clases del ciclo actual. '
              'No se mostrarán datos guardados de ciclos anteriores.',
        );
        return;
      }

      // Intentar usar cache como fallback al restaurar una sesion.
      final cachedGrupos = _authStorage.getGrupos();
      if (cachedGrupos != null && cachedGrupos.isNotEmpty) {
        final debugData = _apiService.withDebugCurrentClass(
          cachedGrupos,
          _authStorage.getBeacons() ?? const <Map<String, dynamic>>[],
        );
        Logger.info(
          '⚠️ Usando cache como fallback tras error: ${debugData.grupos.length} clases',
        );
        await _authStorage.saveBeacons(debugData.beacons);
        state = state.copyWith(
          grupos: debugData.grupos,
          isLoadingGroups: false,
          groupsNotice:
              'No se pudo verificar el ciclo actual. Estas son las últimas '
              'clases guardadas en el dispositivo.',
        );
      } else {
        state = state.copyWith(
          isLoadingGroups: false,
          groupsNotice: 'No se pudieron consultar las clases del ciclo actual.',
        );
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
    state = state.copyWith(
      grupos: [],
      isLoadingGroups: false,
      groupsNotice: null,
    );
    await _authStorage.clearGrupos();
  }

  /// Solicitar una nueva cosecha academica al backend.
  Future<Either<String, String>> syncGroups(String password) async {
    if (!state.isAuthenticated ||
        state.profesor == null ||
        state.token == null) {
      return Left('No hay sesión activa');
    }

    // Set sync in progress flag for app redirect on reopen
    await _authStorage.setSyncInProgress(true);

    // Mantiene disponible la credencial cifrada para reintentos automáticos.
    await _authStorage.cacheUatPasswordForProcess(password);

    final result = await _apiService.forceSync(token: state.token!);

    await result.fold(
      (error) async {
        await _authStorage.setSyncInProgress(false);
      },
      (message) async {
        await _authStorage.setSyncInProgress(false);
        await _loadGrupos(forceRefresh: true);
      },
    );

    return result;
  }

  /// Verificar si existe una sesión almacenada y restaurarla.
  /// Valida la expiración del JWT antes de restaurar como "autenticado".
  Future<void> checkStoredSession() async {
    try {
      Logger.info('Verificando sesión almacenada');

      final token = _authStorage.getToken();
      final profesor = _authStorage.getProfesor();
      final cachedGrupos = _authStorage.getGrupos() ?? const <Grupo>[];

      if (profesor != null) {
        if (token != null && token.isNotEmpty) {
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
              grupos: cachedGrupos,
              token: null,
              errorMessage:
                  'Tu sesión expiró. Ingresa tu contraseña para continuar.',
            );
            // Reintentar automáticamente con la credencial cifrada.
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
          Logger.info('Identidad local disponible; renovando la sesión UAT');
          state = ProfesorAuthState(
            status: ProfesorAuthStatus.sessionExpired,
            profesor: profesor,
            grupos: cachedGrupos,
            errorMessage: 'Actualizando tu acceso...',
          );
          await relogin();
        }
      } else {
        Logger.info('No hay sesión almacenada');
        state = const ProfesorAuthState(
          status: ProfesorAuthStatus.unauthenticated,
        );
      }
    } catch (e, stackTrace) {
      Logger.error('Error verificando sesión almacenada', e, stackTrace);
      final profesor = _authStorage.getProfesor();
      if (profesor == null) {
        state = const ProfesorAuthState(
          status: ProfesorAuthStatus.unauthenticated,
        );
        return;
      }
      state = ProfesorAuthState(
        status: ProfesorAuthStatus.authenticated,
        profesor: profesor,
        grupos: _authStorage.getGrupos() ?? const <Grupo>[],
        token: _authStorage.getToken(),
        errorMessage:
            'No se pudo actualizar la sesión; continúas con los datos locales.',
      );
    }
  }

  /// Cerrar sesión
  Future<void> logout() async {
    Logger.info('Cerrando sesión del profesor');
    final token = state.token ?? _authStorage.getToken();
    if (token != null && token.isNotEmpty) {
      final result = await _apiService.logoutProfesor(token);
      result.fold(
        (error) => Logger.error(
          'La sesión local se cerrará aunque no se pudo revocar la remota: $error',
        ),
        (_) {},
      );
    }
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

  /// Re-autenticación ligera con la credencial cifrada o con
  /// una contraseña nueva ingresada por la persona usuaria.
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
      // Reusar la credencial protegida por Keychain/Keystore.
      final cachedPassword = _authStorage.getCachedUatPassword();
      if (cachedPassword == null || cachedPassword.isEmpty) {
        state = state.copyWith(
          status: ProfesorAuthStatus.sessionExpired,
          errorMessage: 'Ingresa tu contraseña para continuar.',
        );
        return;
      }
      result = await _apiService.loginProfesor(
        email: profesor.institutionalEmail,
        password: cachedPassword,
      );
    }

    await result.fold(
      (error) async {
        Logger.error('Error en re-login: $error');
        if (!_apiService.lastLoginCredentialsRejected) {
          state = state.copyWith(
            status: ProfesorAuthStatus.authenticated,
            token: _authStorage.getToken(),
            errorMessage: 'No pudimos actualizar la información; puedes seguir usando los datos disponibles.',
          );
          return;
        }
        state = state.copyWith(
          status: ProfesorAuthStatus.sessionExpired,
          errorMessage: error,
        );
      },
      (loginResponse) async {
        Logger.info(
          'Re-login exitoso para: ${loginResponse.profesor.nombreCompleto}',
        );
        await _authStorage.saveSession(
          token: loginResponse.token,
          profesor: loginResponse.profesor,
        );
        // Sustituir la credencial cifrada después de un re-login correcto.
        if (plainPassword != null && plainPassword.isNotEmpty) {
          await _authStorage.cacheUatPasswordForProcess(plainPassword);
        }
        state = state.copyWith(
          status: ProfesorAuthStatus.authenticated,
          profesor: loginResponse.profesor,
          token: loginResponse.token,
          errorMessage: null,
        );
        // La sesion se renovo en linea: validar siempre el ciclo actual y no
        // rescatar clases de otro periodo.
        await _loadGrupos(forceRefresh: true);
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

/// Provider para saber si las clases estan descargandose del backend.
final profesorGroupsLoadingProvider = Provider<bool>((ref) {
  final state = ref.watch(profesorAuthProvider);
  return state.isLoadingGroups;
});

/// Aviso contextual sobre disponibilidad o vigencia de las listas.
final profesorGroupsNoticeProvider = Provider<String?>((ref) {
  return ref.watch(profesorAuthProvider).groupsNotice;
});

/// Provider para obtener el error actual
final profesorAuthErrorProvider = Provider<String?>((ref) {
  final state = ref.watch(profesorAuthProvider);
  return state.errorMessage;
});
