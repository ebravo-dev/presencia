import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'services/local_storage_service.dart';
import 'services/sync_service.dart';
import 'services/ble_scanner_service.dart';
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

  final syncService = SyncService(storage);
  syncService.startListening();

  // Initialize BLE service early so native background scan starts
  final bleService = BleScannerService();

  // Sync matrícula to native (UserDefaults) so iOS can use it in background
  if (storage.isProfileSet) {
    bleService.setMatricula(storage.matricula);
  }

  runApp(
    PresenciaAlumnoApp(
      storage: storage,
      syncService: syncService,
      bleService: bleService,
    ),
  );
}

class PresenciaAlumnoApp extends StatelessWidget {
  final LocalStorageService storage;
  final SyncService syncService;
  final BleScannerService bleService;

  const PresenciaAlumnoApp({
    super.key,
    required this.storage,
    required this.syncService,
    required this.bleService,
  });

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Presencia Alumno',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0A0A0A),
      ),
      home: _AppRouter(
        storage: storage,
        syncService: syncService,
        bleService: bleService,
      ),
    );
  }
}

/// Handles routing between setup and home, including navigation after setup
class _AppRouter extends StatefulWidget {
  final LocalStorageService storage;
  final SyncService syncService;
  final BleScannerService bleService;

  const _AppRouter({
    required this.storage,
    required this.syncService,
    required this.bleService,
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
        onComplete: (matricula) async {
          await widget.storage.saveProfile(matricula);
          widget.bleService.setMatricula(matricula);
          setState(() => _profileSet = true);
        },
      );
    }

    return HomeScreen(
      storage: widget.storage,
      syncService: widget.syncService,
      bleService: widget.bleService,
    );
  }
}
