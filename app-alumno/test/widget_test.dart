import 'package:app_alumno/models/student_academic_profile.dart';
import 'package:app_alumno/models/student_schedule_entry.dart';
import 'package:app_alumno/screens/home_screen.dart';
import 'package:app_alumno/screens/login_screen.dart';
import 'package:app_alumno/services/attendance_session_service.dart';
import 'package:app_alumno/services/ble_advertiser_service.dart';
import 'package:app_alumno/services/local_storage_service.dart';
import 'package:app_alumno/services/student_auth_service.dart';
import 'package:app_alumno/services/student_device_binding_service.dart';
import 'package:app_alumno/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _EmptyStorage extends LocalStorageService {
  @override
  bool get isProfileSet => false;

  @override
  int get attendanceHistoryCount => 0;
}

class _SyncStorage extends _EmptyStorage {
  @override
  bool get isProfileSet => true;

  @override
  String get matricula => '123456';

  @override
  Future<void> setDeviceBindingSyncPending(bool pending) async {}
}

class _ScheduleStorage extends _EmptyStorage {
  _ScheduleStorage(this.schedule);

  final List<StudentScheduleEntry> schedule;

  @override
  List<StudentScheduleEntry> get studentSchedule => schedule;
}

class _RecordingAuth extends StudentAuthService {
  _RecordingAuth({required this.online, required this.events});

  final bool online;
  final List<String> events;
  int syncCount = 0;

  @override
  Future<bool> isServerOnline() async {
    events.add('online');
    return online;
  }

  @override
  Future<StudentInfoSyncResult> syncAcademicInfo(
    LocalStorageService storage, {
    String? sessionId,
  }) async {
    events.add('academic');
    syncCount++;
    return StudentInfoSyncResult(
      schedule: const [],
      partialGradesCount: 0,
      finalGradesCount: 0,
      syncedAt: DateTime(2026, 8, 3, 12, 30),
      profile: syncCount > 1
          ? const StudentAcademicProfile(
              matricula: '123456',
              institutionalEmail: 'alumno@alumnos.uat.edu.mx',
              displayName: 'Nombre Actualizado',
              programName: 'Ingeniería Actualizada',
              cycleName: '2026-3',
              average: '95',
              approvedCredits: '210',
            )
          : null,
    );
  }
}

class _RecordingDeviceBinding extends StudentDeviceBindingService {
  _RecordingDeviceBinding(this.events);

  final List<String> events;

  @override
  Future<bool> sync(LocalStorageService storage) async {
    events.add('device');
    return true;
  }
}

void main() {
  testWidgets('login fields have enough height to render entered text', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: buildAppTheme(Brightness.light),
        home: LoginScreen(
          storage: _EmptyStorage(),
          onAuthenticated: (_, _, _) async {},
        ),
      ),
    );

    final fields = find.byType(TextField);
    expect(fields, findsNWidgets(2));
    expect(tester.getSize(fields.at(0)).height, greaterThanOrEqualTo(52));
    expect(tester.getSize(fields.at(1)).height, greaterThanOrEqualTo(52));

    await tester.enterText(fields.at(0), 'alumno@alumnos.uat.edu.mx');
    await tester.enterText(fields.at(1), 'contraseña');
    await tester.pumpAndSettle();

    expect(find.text('alumno@alumnos.uat.edu.mx'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('home keeps its content visible and all tabs navigate', (
    WidgetTester tester,
  ) async {
    final storage = _EmptyStorage();
    final advertiser = BleAdvertiserService();
    final attendance = AttendanceSessionService(
      storage: storage,
      advertiser: advertiser,
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: buildAppTheme(Brightness.light),
        home: HomeScreen(
          storage: storage,
          bleService: advertiser,
          attendanceSession: attendance,
          deviceBindingService: StudentDeviceBindingService(),
          profile: const StudentAcademicProfile(
            matricula: '123456',
            institutionalEmail: 'alumno@alumnos.uat.edu.mx',
            displayName: 'Alumno Prueba',
          ),
          initialUatSessionId: null,
          demoMode: false,
          themeMode: ThemeMode.light,
          onThemeModeChanged: (_) {},
        ),
      ),
    );

    expect(tester.getSize(find.byType(IndexedStack)).height, greaterThan(300));
    expect(find.text('Materias de hoy'), findsOneWidget);

    await tester.tap(find.text('Horario'));
    await tester.pump();
    expect(find.text('Datos de UAT'), findsOneWidget);

    await tester.tap(find.text('Perfil'));
    await tester.pump();
    expect(find.text('Tu información estudiantil'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('attendance fits a compact screen and locks a finished day', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final advertiser = BleAdvertiserService();
    final storage = _ScheduleStorage([
      StudentScheduleEntry(
        externalGroupId: 'today-1',
        subject: 'Arquitectura móvil',
        classroom: 'LAB 1',
        group: 'A',
        slots: [
          StudentScheduleSlot(
            weekday: DateTime.now().weekday,
            raw: '00:00 - 00:00',
            startTime: '00:00',
            endTime: '00:00',
          ),
        ],
      ),
    ]);

    await tester.pumpWidget(
      MaterialApp(
        theme: buildAppTheme(Brightness.light),
        home: HomeScreen(
          storage: storage,
          bleService: advertiser,
          attendanceSession: AttendanceSessionService(
            storage: storage,
            advertiser: advertiser,
          ),
          deviceBindingService: StudentDeviceBindingService(),
          profile: const StudentAcademicProfile(
            matricula: '123456',
            institutionalEmail: 'alumno@alumnos.uat.edu.mx',
            displayName: 'Alumno Prueba',
          ),
          initialUatSessionId: null,
          demoMode: false,
          themeMode: ThemeMode.light,
          onThemeModeChanged: (_) {},
        ),
      ),
    );
    await tester.pump();

    expect(find.byType(CustomScrollView), findsNothing);
    expect(
      find.text('Ya no hay más materias disponibles el día de hoy'),
      findsOneWidget,
    );
    expect(find.text('Jornada terminada'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('profile checks the server before synchronizing information', (
    WidgetTester tester,
  ) async {
    final events = <String>[];
    final storage = _SyncStorage();
    final advertiser = BleAdvertiserService();
    final auth = _RecordingAuth(online: true, events: events);

    await tester.pumpWidget(
      MaterialApp(
        theme: buildAppTheme(Brightness.light),
        home: HomeScreen(
          storage: storage,
          bleService: advertiser,
          attendanceSession: AttendanceSessionService(
            storage: storage,
            advertiser: advertiser,
          ),
          deviceBindingService: _RecordingDeviceBinding(events),
          profile: const StudentAcademicProfile(
            matricula: '123456',
            institutionalEmail: 'alumno@alumnos.uat.edu.mx',
            displayName: 'Nombre Anterior',
          ),
          initialUatSessionId: null,
          demoMode: false,
          themeMode: ThemeMode.light,
          onThemeModeChanged: (_) {},
          studentAuth: auth,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Perfil'));
    await tester.pump();
    await tester.ensureVisible(find.text('Sincronizar con el servidor'));
    events.clear();

    await tester.tap(find.text('Sincronizar con el servidor'));
    await tester.pump();

    expect(events, ['online', 'academic', 'device']);
    expect(find.text('Nombre Actualizado'), findsOneWidget);
    expect(find.text('Ingeniería Actualizada'), findsNWidgets(2));
    expect(
      find.text('Tu perfil y horario están actualizados.'),
      findsOneWidget,
    );
    await tester.pumpAndSettle();
  });

  testWidgets('profile does not synchronize while the server is offline', (
    WidgetTester tester,
  ) async {
    final events = <String>[];
    final storage = _SyncStorage();
    final advertiser = BleAdvertiserService();
    final auth = _RecordingAuth(online: false, events: events);

    await tester.pumpWidget(
      MaterialApp(
        theme: buildAppTheme(Brightness.light),
        home: HomeScreen(
          storage: storage,
          bleService: advertiser,
          attendanceSession: AttendanceSessionService(
            storage: storage,
            advertiser: advertiser,
          ),
          deviceBindingService: _RecordingDeviceBinding(events),
          profile: const StudentAcademicProfile(
            matricula: '123456',
            institutionalEmail: 'alumno@alumnos.uat.edu.mx',
            displayName: 'Nombre Anterior',
          ),
          initialUatSessionId: null,
          demoMode: false,
          themeMode: ThemeMode.light,
          onThemeModeChanged: (_) {},
          studentAuth: auth,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Perfil'));
    await tester.pump();
    await tester.ensureVisible(find.text('Sincronizar con el servidor'));
    events.clear();

    await tester.tap(find.text('Sincronizar con el servidor'));
    await tester.pump();

    expect(events, ['online']);
    expect(
      find.text(
        'Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.',
      ),
      findsOneWidget,
    );
    await tester.pumpAndSettle();
  });
}
