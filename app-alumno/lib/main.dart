import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'services/local_storage_service.dart';
import 'services/sync_service.dart';
import 'screens/setup_screen.dart';
import 'screens/home_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Lock to portrait
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);

  // Dark status bar
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarBrightness: Brightness.dark,
      statusBarIconBrightness: Brightness.light,
    ),
  );

  // Initialize local storage
  final storage = LocalStorageService();
  await storage.init();

  // Initialize sync service
  final syncService = SyncService(storage);
  syncService.startListening();

  runApp(PresenciaAlumnoApp(storage: storage, syncService: syncService));
}

class PresenciaAlumnoApp extends StatelessWidget {
  final LocalStorageService storage;
  final SyncService syncService;

  const PresenciaAlumnoApp({
    super.key,
    required this.storage,
    required this.syncService,
  });

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Presencia Alumno',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0A0A0A),
        fontFamily: 'SF Pro Display',
      ),
      home: storage.isProfileSet
          ? HomeScreen(storage: storage, syncService: syncService)
          : SetupScreen(
              onComplete: (name, matricula) async {
                await storage.saveProfile(name, matricula);
                // Navigate to home, replacing setup
                if (context.mounted) {
                  Navigator.of(context).pushAndRemoveUntil(
                    MaterialPageRoute(
                      builder: (_) => HomeScreen(
                        storage: storage,
                        syncService: syncService,
                      ),
                    ),
                    (route) => false,
                  );
                }
              },
            ),
    );
  }
}
