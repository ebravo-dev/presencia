import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'services/local_storage_service.dart';
import 'services/ble_advertiser_service.dart';
import 'services/attendance_session_service.dart';
import 'services/student_auth_service.dart';
import 'screens/setup_screen.dart';
import 'screens/home_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);

  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarBrightness: Brightness.dark,
      statusBarIconBrightness: Brightness.light,
    ),
  );

  final storage = LocalStorageService();
  await storage.init();
  await storage.ensureDeviceBinding();

  final bleService = BleAdvertiserService();
  final attendanceSession = AttendanceSessionService(
    storage: storage,
    advertiser: bleService,
  );
  final studentAuthService = StudentAuthService();

  // Sync student identity to native so attendance services can read it.
  if (storage.isProfileSet) {
    await bleService.setStudentIdentity(
      matricula: storage.matricula,
      attendanceUuid: storage.attendanceUuid,
      deviceBindingId: storage.deviceBindingId,
    );
  }

  runApp(
    PresenciaAlumnoApp(
      storage: storage,
      bleService: bleService,
      attendanceSession: attendanceSession,
      studentAuthService: studentAuthService,
    ),
  );
}

class PresenciaAlumnoApp extends StatelessWidget {
  final LocalStorageService storage;
  final BleAdvertiserService bleService;
  final AttendanceSessionService attendanceSession;
  final StudentAuthService studentAuthService;

  const PresenciaAlumnoApp({
    super.key,
    required this.storage,
    required this.bleService,
    required this.attendanceSession,
    required this.studentAuthService,
  });

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Presencia Alumno',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF62D6A2),
          brightness: Brightness.dark,
          primary: const Color(0xFF62D6A2),
          surface: const Color(0xFF111923),
        ),
        scaffoldBackgroundColor: const Color(0xFF0B0F14),
        fontFamily: 'Roboto',
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFF62D6A2),
            foregroundColor: const Color(0xFF07110D),
            disabledBackgroundColor: const Color(0xFF27313B),
            disabledForegroundColor: const Color(0xFF8F9BA8),
            textStyle: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFF111923),
          labelStyle: const TextStyle(
            color: Color(0xFF8F9BA8),
            fontWeight: FontWeight.w700,
          ),
          hintStyle: TextStyle(
            color: Colors.white.withValues(alpha: 0.28),
            fontWeight: FontWeight.w700,
          ),
          prefixIconColor: const Color(0xFF8F9BA8),
          errorStyle: const TextStyle(
            color: Color(0xFFFF7A70),
            fontWeight: FontWeight.w700,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: Color(0xFF223040)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: Color(0xFF223040)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: Color(0xFF62D6A2), width: 1.4),
          ),
          errorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: Color(0xFFFF7A70)),
          ),
          focusedErrorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: Color(0xFFFF7A70), width: 1.4),
          ),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 18,
          ),
        ),
      ),
      home: _AppRouter(
        storage: storage,
        bleService: bleService,
        attendanceSession: attendanceSession,
        studentAuthService: studentAuthService,
      ),
    );
  }
}

/// Handles routing between setup and home, including navigation after setup
class _AppRouter extends StatefulWidget {
  final LocalStorageService storage;
  final BleAdvertiserService bleService;
  final AttendanceSessionService attendanceSession;
  final StudentAuthService studentAuthService;

  const _AppRouter({
    required this.storage,
    required this.bleService,
    required this.attendanceSession,
    required this.studentAuthService,
  });

  @override
  State<_AppRouter> createState() => _AppRouterState();
}

class _AppRouterState extends State<_AppRouter> {
  bool _profileSet = false;

  @override
  void initState() {
    super.initState();
    _profileSet = widget.storage.isProfileSet;
  }

  @override
  Widget build(BuildContext context) {
    if (!_profileSet) {
      return SetupScreen(
        onComplete: ({required username, required password}) async {
          final authResult = await widget.studentAuthService.loginAndBind(
            username: username,
            password: password,
            storage: widget.storage,
          );
          await widget.storage.saveProfile(
            authResult.matricula,
            institutionalEmail: username.trim().toLowerCase(),
            uatStudentSessionId: authResult.sessionId,
          );
          await widget.bleService.setStudentIdentity(
            matricula: authResult.matricula,
            attendanceUuid: widget.storage.attendanceUuid,
            deviceBindingId: widget.storage.deviceBindingId,
          );
          await widget.storage.setDeviceBindingSyncPending(false);
          setState(() => _profileSet = true);
        },
      );
    }

    return HomeScreen(
      storage: widget.storage,
      bleService: widget.bleService,
      attendanceSession: widget.attendanceSession,
    );
  }
}
