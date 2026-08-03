import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'models/student_academic_profile.dart';
import 'services/local_storage_service.dart';
import 'services/ble_advertiser_service.dart';
import 'services/attendance_session_service.dart';
import 'services/student_device_binding_service.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'theme/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);

  final storage = LocalStorageService();
  await storage.init();
  await storage.ensureDeviceBinding();

  final bleService = BleAdvertiserService();
  final attendanceSession = AttendanceSessionService(
    storage: storage,
    advertiser: bleService,
  );
  final deviceBindingService = StudentDeviceBindingService();

  // Sync the local identity immediately; server reconciliation must not delay UI.
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
      deviceBindingService: deviceBindingService,
    ),
  );

  if (storage.isProfileSet) {
    unawaited(_syncDeviceBindingInBackground(deviceBindingService, storage));
  }
}

Future<void> _syncDeviceBindingInBackground(
  StudentDeviceBindingService service,
  LocalStorageService storage,
) async {
  final synced = await service.sync(storage);
  await storage.setDeviceBindingSyncPending(!synced);
}

class PresenciaAlumnoApp extends StatefulWidget {
  final LocalStorageService storage;
  final BleAdvertiserService bleService;
  final AttendanceSessionService attendanceSession;
  final StudentDeviceBindingService deviceBindingService;

  const PresenciaAlumnoApp({
    super.key,
    required this.storage,
    required this.bleService,
    required this.attendanceSession,
    required this.deviceBindingService,
  });

  @override
  State<PresenciaAlumnoApp> createState() => _PresenciaAlumnoAppState();
}

class _PresenciaAlumnoAppState extends State<PresenciaAlumnoApp> {
  ThemeMode _themeMode = ThemeMode.system;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FIUAT Student Hub',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(Brightness.light),
      darkTheme: buildAppTheme(Brightness.dark),
      themeMode: _themeMode,
      home: _AppRouter(
        storage: widget.storage,
        bleService: widget.bleService,
        attendanceSession: widget.attendanceSession,
        deviceBindingService: widget.deviceBindingService,
        onThemeModeChanged: (value) => setState(() => _themeMode = value),
        themeMode: _themeMode,
      ),
    );
  }
}

/// Handles routing between setup and home, including navigation after setup
class _AppRouter extends StatefulWidget {
  final LocalStorageService storage;
  final BleAdvertiserService bleService;
  final AttendanceSessionService attendanceSession;
  final StudentDeviceBindingService deviceBindingService;
  final ThemeMode themeMode;
  final ValueChanged<ThemeMode> onThemeModeChanged;

  const _AppRouter({
    required this.storage,
    required this.bleService,
    required this.attendanceSession,
    required this.deviceBindingService,
    required this.themeMode,
    required this.onThemeModeChanged,
  });

  @override
  State<_AppRouter> createState() => _AppRouterState();
}

class _AppRouterState extends State<_AppRouter> {
  bool _profileSet = false;
  StudentAcademicProfile? _academicProfile;
  String? _initialUatSessionId;

  @override
  Widget build(BuildContext context) {
    if (!_profileSet) {
      return LoginScreen(
        storage: widget.storage,
        onAuthenticated: (username, password, result) async {
          await widget.storage.saveInstitutionalCredentials(
            username: username,
            password: password,
          );
          await widget.storage.saveDeviceBindingToken(
            result.deviceBindingToken,
          );
          await widget.storage.saveProfile(
            result.matricula,
            institutionalEmail: username,
          );
          await widget.bleService.setStudentIdentity(
            matricula: result.matricula,
            attendanceUuid: widget.storage.attendanceUuid,
            deviceBindingId: widget.storage.deviceBindingId,
          );
          setState(() {
            _academicProfile = result.profile;
            _initialUatSessionId = result.sessionId;
            _profileSet = true;
          });
          unawaited(
            _syncDeviceBindingInBackground(
              widget.deviceBindingService,
              widget.storage,
            ),
          );
        },
      );
    }

    return HomeScreen(
      storage: widget.storage,
      bleService: widget.bleService,
      attendanceSession: widget.attendanceSession,
      deviceBindingService: widget.deviceBindingService,
      profile: _academicProfile!,
      initialUatSessionId: _initialUatSessionId,
      themeMode: widget.themeMode,
      onThemeModeChanged: widget.onThemeModeChanged,
    );
  }
}
