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
import 'core/utils/utils.dart';
import 'core/theme/uat_theme.dart';
import 'features/authentication/presentation/pages/login_page.dart';
import 'features/groups/screens/grupos_page.dart';
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
  bool _lastAuthState = false;

  AuthStateNotifier(this._ref) {
    _ref.listen<ProfesorAuthState>(profesorAuthProvider, (previous, next) {
      final newAuthState = next.isAuthenticated;
      if (_lastAuthState != newAuthState) {
        _lastAuthState = newAuthState;
        notifyListeners();
      }
    }, fireImmediately: true);
  }

  bool get isAuthenticated => _ref.read(profesorAuthProvider).isAuthenticated;
}

final routerProvider = Provider<GoRouter>((ref) {
  final authNotifier = ref.watch(authStateListenableProvider);

  return GoRouter(
    refreshListenable: authNotifier,
    initialLocation: '/login',
    redirect: (context, state) {
      final isAuthenticated = authNotifier.isAuthenticated;
      final isLoggingIn = state.matchedLocation == '/login';

      // Si está autenticado y está en login, ir a grupos
      if (isAuthenticated && isLoggingIn) {
        return '/grupos';
      }

      // Si no está autenticado y no está en login, ir a login
      if (!isAuthenticated && !isLoggingIn) {
        return '/login';
      }

      // No redirect needed
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginPage()),
      GoRoute(path: '/grupos', builder: (context, state) => const GruposPage()),
      GoRoute(
        path: '/dashboard', // Mantener compatibilidad
        redirect: (context, state) => '/grupos',
      ),
      GoRoute(
        path: '/',
        redirect: (context, state) {
          final isAuthenticated = authNotifier.isAuthenticated;
          return isAuthenticated ? '/grupos' : '/login';
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
    if (_isChecking || !_initialized) {
      // Show splash screen while checking stored session
      return MaterialApp(
        debugShowCheckedModeBanner: false,
        home: Scaffold(
          backgroundColor: Colors.white,
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
                const Text(
                  'Cargando...',
                  style: TextStyle(fontSize: 16, color: Colors.grey),
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
      routerConfig: router,
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
