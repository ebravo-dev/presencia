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
      statusBarBrightness: Brightness.light,
      statusBarIconBrightness: Brightness.dark,
      systemNavigationBarColor: Color(0xFFF7FAFE),
      systemNavigationBarIconBrightness: Brightness.dark,
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
        brightness: Brightness.light,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF2348ED),
          brightness: Brightness.light,
          primary: const Color(0xFF2348ED),
          secondary: const Color(0xFF10AF74),
          surface: const Color(0xFFFFFFFF),
        ),
        scaffoldBackgroundColor: const Color(0xFFF7FAFE),
        fontFamily: 'Roboto',
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(
            foregroundColor: const Color(0xFF2348ED),
            textStyle: const TextStyle(fontWeight: FontWeight.w800),
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFF2348ED),
            foregroundColor: Colors.white,
            disabledBackgroundColor: const Color(0xFFE0ECFF),
            disabledForegroundColor: const Color(0xFF65728B),
            textStyle: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
            ),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          labelStyle: const TextStyle(
            color: Color(0xFF65728B),
            fontWeight: FontWeight.w700,
          ),
          hintStyle: TextStyle(
            color: const Color(0xFF65728B).withValues(alpha: 0.62),
            fontWeight: FontWeight.w700,
          ),
          prefixIconColor: const Color(0xFF65728B),
          errorStyle: const TextStyle(
            color: Color(0xFFED4444),
            fontWeight: FontWeight.w700,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(color: Color(0xFFDAE2F0)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(color: Color(0xFFDAE2F0)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(color: Color(0xFF2348ED), width: 1.4),
          ),
          errorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(color: Color(0xFFED4444)),
          ),
          focusedErrorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(color: Color(0xFFED4444), width: 1.4),
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
          await widget.storage.saveInstitutionalCredentials(
            username: username,
            password: password,
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
      studentAuthService: widget.studentAuthService,
    );
  }
}
