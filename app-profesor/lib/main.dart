import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'services/database_service.dart';
import 'services/auth_storage_service.dart';
import 'services/asistencia_local_service.dart';
import 'core/constants/app_constants.dart';
import 'core/constants/api_constants.dart';
import 'core/permissions/permission_service.dart';
import 'core/utils/utils.dart';
import 'core/theme/uat_theme.dart';
import 'core/theme/theme_controller.dart';
import 'features/authentication/presentation/pages/login_page.dart';
import 'features/authentication/presentation/pages/relogin_page.dart';
import 'features/groups/screens/grupos_page.dart';
import 'features/groups/screens/sync_status_screen.dart';
import 'features/authentication/providers/profesor_auth_provider.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    // Initialize Hive for local storage
    await Hive.initFlutter();
    Logger.info('Hive initialized');

    // Initialize auth storage service
    await AuthStorageService().init();
    Logger.info('Auth storage initialized');

    // Initialize asistencia local service
    await AsistenciaLocalService().init();
    Logger.info('Asistencia local service initialized');

    // Initialize database
    await DatabaseService().init();
    Logger.info('App initialization completed');

    // Request Bluetooth permissions at startup.
    PermissionService.requestBluetoothPermissions().then((granted) {
      Logger.info('Bluetooth permissions: ${granted ? "granted" : "denied"}');
    });

    // Debug: Print API configuration
    ApiConstants.printConfig();
  } catch (e, stackTrace) {
    Logger.error('Error during app initialization', e, stackTrace);
  }

  runApp(const ProviderScope(child: MyApp()));
}

// Provider para observar cambios en autenticación
final authStateListenableProvider = Provider<AuthStateNotifier>((ref) {
  return AuthStateNotifier(ref);
});

class AuthStateNotifier extends ChangeNotifier {
  final Ref _ref;

  AuthStateNotifier(this._ref) {
    _ref.listen<ProfesorAuthState>(profesorAuthProvider, (previous, next) {
      // El router necesita enterarse también de sessionExpired ->
      // unauthenticated. Comparar sólo el booleano de autenticación dejaba la
      // pantalla de contraseña abierta después de cerrar sesión completamente.
      if (previous?.status != next.status) {
        notifyListeners();
      }
    }, fireImmediately: true);
  }

  bool get isAuthenticated => _ref.read(profesorAuthProvider).isAuthenticated;
}

final routerProvider = Provider<GoRouter>((ref) {
  final authNotifier = ref.watch(authStateListenableProvider);
  final authStorage = AuthStorageService();

  return GoRouter(
    refreshListenable: authNotifier,
    initialLocation: '/login',
    redirect: (context, state) {
      final authState = ref.read(profesorAuthProvider);
      final isAuthenticated = authState.isAuthenticated;
      final isSessionExpired = authState.isSessionExpired;
      final isLoggingIn = state.matchedLocation == '/login';
      final isRelogging = state.matchedLocation == '/relogin';
      final isOnSyncStatus = state.matchedLocation == '/sync-status';
      final isSyncInProgress = authStorage.isSyncInProgress();

      // Mantener la ruta actual durante una operación de login o renovación.
      // El siguiente estado terminal decidirá el destino correcto.
      if (authState.status == ProfesorAuthStatus.initial ||
          authState.status == ProfesorAuthStatus.loading) {
        return null;
      }

      // Sólo se usa cuando el backend rechazó la contraseña guardada.
      if (isSessionExpired && !isRelogging) {
        return '/relogin';
      }

      // Si está autenticado y hay sync en progreso, ir a sync-status
      if (isAuthenticated && isSyncInProgress && !isOnSyncStatus) {
        return '/sync-status';
      }

      // Si está autenticado y está en login o relogin, ir a grupos
      if (isAuthenticated && (isLoggingIn || isRelogging)) {
        return '/grupos';
      }

      // Si no está autenticado y no está en login, ir a login
      if (!isAuthenticated && !isSessionExpired && !isLoggingIn) {
        return '/login';
      }

      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginPage()),
      GoRoute(
        path: '/relogin',
        builder: (context, state) => const ReloginPage(),
      ),
      GoRoute(path: '/grupos', builder: (context, state) => const GruposPage()),
      GoRoute(
        path: '/sync-status',
        builder: (context, state) => const SyncStatusScreen(),
      ),
      GoRoute(
        path: '/dashboard', // Mantener compatibilidad
        redirect: (context, state) => '/grupos',
      ),
      GoRoute(
        path: '/',
        redirect: (context, state) {
          final authState = ref.read(profesorAuthProvider);
          if (authState.isAuthenticated) return '/grupos';
          if (authState.isSessionExpired) return '/relogin';
          return '/login';
        },
      ),
    ],
  );
});

class MyApp extends ConsumerStatefulWidget {
  const MyApp({super.key});

  @override
  ConsumerState<MyApp> createState() => _MyAppState();
}

class _MyAppState extends ConsumerState<MyApp> {
  bool _initialized = false;
  bool _isChecking = true;

  @override
  void initState() {
    super.initState();
    // Usar addPostFrameCallback para evitar problemas con ref en initState
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkStoredSession();
    });
  }

  Future<void> _checkStoredSession() async {
    try {
      Logger.info('Iniciando verificación de sesión almacenada');
      // Check for stored session on app start
      await ref.read(profesorAuthProvider.notifier).checkStoredSession();
      Logger.info('Verificación de sesión completada');
    } catch (e, stackTrace) {
      Logger.error('Error verificando sesión almacenada', e, stackTrace);
      // Si hay error, asegurar que el estado quede en unauthenticated
      // para que el usuario pueda hacer login sin problemas
      ref.read(profesorAuthProvider.notifier).clearError();
    } finally {
      if (mounted) {
        setState(() {
          _initialized = true;
          _isChecking = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final themeMode = ref.watch(themeControllerProvider);
    final activeTheme = themeMode == ThemeMode.light
        ? UATTheme.lightTheme
        : UATTheme.darkTheme;

    if (_isChecking || !_initialized) {
      // Show splash screen while checking stored session
      return MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: UATTheme.lightTheme,
        darkTheme: UATTheme.darkTheme,
        themeMode: themeMode,
        builder: (context, child) => _DebugModeOverlay(child: child),
        home: Scaffold(
          backgroundColor: activeTheme.scaffoldBackgroundColor,
          body: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: UATTheme.lightTheme.primaryColor,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Icon(
                    Icons.school_rounded,
                    size: 40,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 24),
                CircularProgressIndicator(
                  color: UATTheme.lightTheme.primaryColor,
                ),
                const SizedBox(height: 16),
                Text(
                  'Cargando...',
                  style: TextStyle(
                    fontSize: 16,
                    color: activeTheme.colorScheme.onSurface.withValues(
                      alpha: 0.72,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      debugShowCheckedModeBanner: false,
      title: AppConstants.appName,
      theme: UATTheme.lightTheme,
      darkTheme: UATTheme.darkTheme,
      themeMode: themeMode,
      routerConfig: router,
      builder: (context, child) => _DebugModeOverlay(child: child),
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('es', 'MX')],
      locale: const Locale('es', 'MX'),
    );
  }
}

class _DebugModeOverlay extends StatelessWidget {
  final Widget? child;

  const _DebugModeOverlay({required this.child});

  @override
  Widget build(BuildContext context) {
    if (!ApiConstants.isDemoMode) {
      return child ?? const SizedBox.shrink();
    }

    return Stack(
      children: [
        child ?? const SizedBox.shrink(),
        Positioned(
          top: MediaQuery.of(context).padding.top + 8,
          left: 12,
          right: 12,
          child: IgnorePointer(
            child: Material(
              color: Colors.transparent,
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 7,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEAB308),
                    borderRadius: BorderRadius.circular(999),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.22),
                        blurRadius: 12,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: const Text(
                    'VERSIÓN DE PRUEBA · SIN ENVÍO INSTITUCIONAL',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Color(0xFF111827),
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.4,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
