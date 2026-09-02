import 'dart:async';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive/hive.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:dartz/dartz.dart';
import 'package:mocktail/mocktail.dart';
import 'package:appprofesoresuniversidad/services/auth_storage_service.dart';
import 'package:appprofesoresuniversidad/services/api_service.dart';
import 'package:appprofesoresuniversidad/features/authentication/providers/profesor_auth_provider.dart';
import 'package:appprofesoresuniversidad/main.dart' as app;
import 'package:appprofesoresuniversidad/shared/models/profesor.dart';
import 'package:appprofesoresuniversidad/shared/models/grupo.dart';

class MockApiService extends Mock implements ApiService {}

void main() {
  late AuthStorageService authStorage;
  late Directory testDir;

  setUpAll(() async {
    FlutterSecureStorage.setMockInitialValues({});
    // Crear directorio temporal para tests
    testDir = Directory.systemTemp.createTempSync('hive_test_');
    // Inicializar Hive con el directorio temporal
    Hive.init(testDir.path);
  });

  tearDownAll(() async {
    // Limpiar directorio temporal
    await Hive.close();
    if (testDir.existsSync()) {
      testDir.deleteSync(recursive: true);
    }
  });

  setUp(() async {
    authStorage = AuthStorageService();
    await authStorage.init();
    await authStorage.clearSession(); // Limpiar antes de cada test
  });

  tearDown(() async {
    await authStorage.clearSession(); // Limpiar después de cada test
  });

  group('Login Flow Tests', () {
    test('Escenario 1: Login sin JWT guardado', () async {
      // Arrange
      expect(authStorage.hasActiveSession(), false);

      // Este test valida que no hay sesión guardada
      final token = authStorage.getToken();
      final profesor = authStorage.getProfesor();

      // Assert
      expect(token, isNull);
      expect(profesor, isNull);
      expect(authStorage.hasActiveSession(), false);
    });

    test('Escenario 2: Guardar sesión después de login', () async {
      // Arrange
      const testToken =
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMyIsImVtYWlsIjoidGVzdEB1YXQuZWR1Lm14IiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjk5OTk5OTk5OTl9.test';
      final testProfesor = Profesor(
        id: '123',
        name: 'Test Profesor',
        institutionalEmail: 'test@uat.edu.mx',
      );

      // Act
      await authStorage.saveSession(token: testToken, profesor: testProfesor);

      // Assert
      expect(authStorage.hasActiveSession(), true);
      expect(authStorage.getToken(), testToken);
      expect(Hive.box('auth').containsKey('jwt_token'), isFalse);
      expect(
        await const FlutterSecureStorage().read(key: 'professor_session_token'),
        testToken,
      );

      final savedProfesor = authStorage.getProfesor();
      expect(savedProfesor, isNotNull);
      expect(savedProfesor?.id, '123');
      expect(savedProfesor?.name, 'Test Profesor');
      expect(savedProfesor?.institutionalEmail, 'test@uat.edu.mx');
    });

    test('guarda vínculos GATT resueltos por el servidor', () async {
      await authStorage.cacheResolvedStudentDeviceBindings(const [
        {
          'matricula': ' 2251330008 ',
          'attendanceUuid': '12345678-1234-4234-9234-123456789ABC',
          'deviceBindingId': 'binding-1',
        },
      ]);

      final cached = authStorage.getStudentDeviceBindings(
        matriculas: const ['2251330008'],
      );
      expect(cached, hasLength(1));
      expect(cached.single['matricula'], '2251330008');
      expect(
        cached.single['attendanceUuid'],
        '12345678-1234-4234-9234-123456789abc',
      );
      expect(cached.single['deviceBindingId'], 'binding-1');
      expect(cached.single['pendingSync'], isFalse);
    });

    test('Escenario 3: Auto-login con JWT guardado válido', () async {
      // Arrange
      const validToken =
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMyIsImVtYWlsIjoidGVzdEB1YXQuZWR1Lm14IiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjk5OTk5OTk5OTl9.test';
      final testProfesor = Profesor(
        id: '123',
        name: 'Test Profesor',
        institutionalEmail: 'test@uat.edu.mx',
      );

      await authStorage.saveSession(token: validToken, profesor: testProfesor);

      // Act
      final hasSession = authStorage.hasActiveSession();
      final isValid = authStorage.isTokenValid();

      // Assert
      expect(hasSession, true);
      expect(isValid, true);
    });

    test('Escenario 4: Logout limpia la sesión', () async {
      // Arrange
      const testToken =
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMyIsImVtYWlsIjoidGVzdEB1YXQuZWR1Lm14IiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjk5OTk5OTk5OTl9.test';
      final testProfesor = Profesor(
        id: '123',
        name: 'Test Profesor',
        institutionalEmail: 'test@uat.edu.mx',
      );

      await authStorage.saveSession(token: testToken, profesor: testProfesor);

      expect(authStorage.hasActiveSession(), true);

      // Act
      await authStorage.clearSession();

      // Assert
      expect(authStorage.hasActiveSession(), false);
      expect(authStorage.getToken(), isNull);
      expect(authStorage.getProfesor(), isNull);
    });

    test('Escenario 5: Token expirado no es válido', () async {
      // Arrange - Token con exp en el pasado
      const expiredToken =
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMyIsImVtYWlsIjoidGVzdEB1YXQuZWR1Lm14IiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjE2MDAwMDAwMDB9.test';
      final testProfesor = Profesor(
        id: '123',
        name: 'Test Profesor',
        institutionalEmail: 'test@uat.edu.mx',
      );

      await authStorage.saveSession(
        token: expiredToken,
        profesor: testProfesor,
      );

      // Act
      final isValid = authStorage.isTokenValid();
      final hasSession = authStorage.hasActiveSession();

      // Assert
      expect(isValid, false); // El token está expirado
      expect(
        hasSession,
        true,
      ); // Pero sí hay sesión guardada (solo valida existencia)
    });

    test('Escenario 6: La contraseña UAT nunca se persiste en Hive', () async {
      final box = Hive.box('auth');
      await box.put('encrypted_password', 'credencial-heredada');

      await authStorage.init();
      expect(box.containsKey('encrypted_password'), isFalse);

      await authStorage.cacheUatPasswordForProcess('solo-en-memoria');
      expect(authStorage.getCachedUatPassword(), 'solo-en-memoria');
      expect(box.containsKey('encrypted_password'), isFalse);

      await authStorage.clearCachedUatPassword();
      expect(authStorage.getCachedUatPassword(), isNull);
    });

    test('Escenario 7: Migra UAT y elimina la sesión monolítica', () async {
      final box = Hive.box('auth');
      await box.put('jwt_token', 'uat-session-heredada');
      await box.put('main_backend_jwt_token', 'backend-session-heredada');
      const secureStorage = FlutterSecureStorage();
      await secureStorage.write(
        key: 'professor_main_backend_token',
        value: 'backend-session-segura-heredada',
      );

      await authStorage.init();

      expect(authStorage.getToken(), 'uat-session-heredada');
      expect(box.containsKey('jwt_token'), isFalse);
      expect(box.containsKey('main_backend_jwt_token'), isFalse);
      expect(
        await secureStorage.read(key: 'professor_session_token'),
        'uat-session-heredada',
      );
      expect(
        await secureStorage.read(key: 'professor_main_backend_token'),
        isNull,
      );
    });
  });

  group('ProfesorAuthNotifier Tests', () {
    test(
      'checkStoredSession sin JWT debe mantener estado unauthenticated',
      () async {
        // Arrange
        final container = ProviderContainer();
        final notifier = container.read(profesorAuthProvider.notifier);

        // Act
        await notifier.checkStoredSession();
        final state = container.read(profesorAuthProvider);

        // Assert
        expect(state.status, ProfesorAuthStatus.unauthenticated);
        expect(state.profesor, isNull);
        expect(state.token, isNull);

        container.dispose();
      },
    );

    test('checkStoredSession con JWT válido debe restaurar sesión', () async {
      // Arrange
      const validToken =
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMyIsImVtYWlsIjoidGVzdEB1YXQuZWR1Lm14IiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjk5OTk5OTk5OTl9.test';
      final testProfesor = Profesor(
        id: '123',
        name: 'Test Profesor',
        institutionalEmail: 'test@uat.edu.mx',
      );

      await authStorage.saveSession(token: validToken, profesor: testProfesor);

      final apiService = MockApiService();
      when(() => apiService.getGruposProfesor(validToken)).thenAnswer(
        (_) async => const Right(
          ProfesorGroupsData(
            grupos: <Grupo>[],
            beacons: <Map<String, dynamic>>[],
            cycle: AcademicCycleContext(
              externalId: 152,
              year: 2026,
              term: 3,
              name: '2026 - 3 OTOÑO',
            ),
          ),
        ),
      );

      final container = ProviderContainer(
        overrides: [apiServiceProvider.overrideWithValue(apiService)],
      );
      final notifier = container.read(profesorAuthProvider.notifier);

      // Act
      await notifier.checkStoredSession();
      final state = container.read(profesorAuthProvider);

      // Assert
      expect(state.status, ProfesorAuthStatus.authenticated);
      expect(state.profesor, isNotNull);
      expect(state.token, validToken);

      container.dispose();
    });

    test(
      'logout limpia el equipo sin esperar a la revocación remota',
      () async {
        const validToken = 'uat-session-activa';
        final testProfesor = Profesor(
          id: '123',
          name: 'Test Profesor',
          institutionalEmail: 'test@uat.edu.mx',
        );
        await authStorage.saveSession(
          token: validToken,
          profesor: testProfesor,
        );
        final apiService = MockApiService();
        when(() => apiService.getGruposProfesor(validToken)).thenAnswer(
          (_) async => const Right(
            ProfesorGroupsData(
              grupos: <Grupo>[],
              beacons: <Map<String, dynamic>>[],
              cycle: AcademicCycleContext(
                externalId: 152,
                year: 2026,
                term: 3,
                name: '2026 - 3 OTOÑO',
              ),
            ),
          ),
        );
        final remoteLogout = Completer<Either<String, bool>>();
        when(
          () => apiService.logoutProfesor(validToken),
        ).thenAnswer((_) => remoteLogout.future);
        final notifier = ProfesorAuthNotifier(apiService, authStorage);

        await notifier.checkStoredSession();
        await authStorage.cacheUatPasswordForProcess('contraseña-protegida');
        await authStorage.setSyncInProgress(true);
        await authStorage.saveBeacons(const [
          {'classroom': 'A1', 'uuid': 'beacon-de-prueba'},
        ]);
        final logout = notifier.logout();
        await untilCalled(() => apiService.logoutProfesor(validToken));

        verify(() => apiService.logoutProfesor(validToken)).called(1);
        expect(notifier.state.status, ProfesorAuthStatus.unauthenticated);
        expect(authStorage.hasActiveSession(), isFalse);
        expect(authStorage.getProfesor(), isNull);
        expect(authStorage.getGrupos(), isNull);
        expect(authStorage.getBeacons(), isNull);
        expect(authStorage.getCachedUatPassword(), isNull);
        expect(authStorage.isSyncInProgress(), isFalse);

        remoteLogout.complete(const Right(true));
        await logout;
      },
    );

    test(
      'un 401 tardío no revive la pantalla de contraseña tras logout',
      () async {
        const validToken = 'uat-session-activa';
        final testProfesor = Profesor(
          id: '123',
          name: 'Test Profesor',
          institutionalEmail: 'test@uat.edu.mx',
        );
        await authStorage.saveSession(
          token: validToken,
          profesor: testProfesor,
        );

        final apiService = MockApiService();
        when(
          () => apiService.logoutProfesor(validToken),
        ).thenAnswer((_) async => const Right(true));
        final notifier = ProfesorAuthNotifier(apiService, authStorage);

        await notifier.logout();
        notifier.markSessionExpired();

        expect(notifier.state.status, ProfesorAuthStatus.unauthenticated);
        expect(notifier.state.profesor, isNull);
        expect(authStorage.hasActiveSession(), isFalse);
      },
    );

    test(
      'el router recibe el cambio de reautenticación a sesión cerrada',
      () async {
        const validToken = 'uat-session-activa';
        final testProfesor = Profesor(
          id: '123',
          name: 'Test Profesor',
          institutionalEmail: 'test@uat.edu.mx',
        );
        await authStorage.saveSession(
          token: validToken,
          profesor: testProfesor,
        );

        final apiService = MockApiService();
        when(() => apiService.getGruposProfesor(validToken)).thenAnswer(
          (_) async => const Right(
            ProfesorGroupsData(
              grupos: <Grupo>[],
              beacons: <Map<String, dynamic>>[],
              cycle: AcademicCycleContext(
                externalId: 152,
                year: 2026,
                term: 3,
                name: '2026 - 3 OTOÑO',
              ),
            ),
          ),
        );
        final container = ProviderContainer(
          overrides: [apiServiceProvider.overrideWithValue(apiService)],
        );
        final routeListenable = container.read(app.authStateListenableProvider);
        final notifier = container.read(profesorAuthProvider.notifier);
        await notifier.checkStoredSession();
        notifier.markSessionExpired();
        expect(notifier.state.status, ProfesorAuthStatus.sessionExpired);

        var routerNotifications = 0;
        routeListenable.addListener(() => routerNotifications++);
        await notifier.logout();

        expect(notifier.state.status, ProfesorAuthStatus.unauthenticated);
        expect(routerNotifications, greaterThan(0));
        container.dispose();
      },
    );

    test(
      'token expirado sin credencial protegida va al login completo',
      () async {
        const expiredToken =
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MDAwMDAwMDB9.test';
        final testProfesor = Profesor(
          id: '123',
          name: 'Test Profesor',
          institutionalEmail: 'test@uat.edu.mx',
        );
        await authStorage.saveSession(
          token: expiredToken,
          profesor: testProfesor,
        );

        final apiService = MockApiService();
        final notifier = ProfesorAuthNotifier(apiService, authStorage);

        await notifier.checkStoredSession();

        expect(notifier.state.status, ProfesorAuthStatus.unauthenticated);
        expect(notifier.state.isSessionExpired, isFalse);
        expect(authStorage.hasActiveSession(), isFalse);
        verifyNever(
          () => apiService.loginProfesor(
            email: any(named: 'email'),
            password: any(named: 'password'),
          ),
        );
      },
    );

    test('sólo una contraseña rechazada abre la reautenticación', () async {
      const expiredToken =
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MDAwMDAwMDB9.test';
      final testProfesor = Profesor(
        id: '123',
        name: 'Test Profesor',
        institutionalEmail: 'test@uat.edu.mx',
      );
      await authStorage.saveSession(
        token: expiredToken,
        profesor: testProfesor,
      );
      await authStorage.cacheUatPasswordForProcess('contraseña-anterior');

      final apiService = MockApiService();
      when(
        () => apiService.loginProfesor(
          email: testProfesor.institutionalEmail,
          password: 'contraseña-anterior',
        ),
      ).thenAnswer((_) async => const Left('Credenciales inválidas'));
      when(() => apiService.lastLoginCredentialsRejected).thenReturn(true);
      final notifier = ProfesorAuthNotifier(apiService, authStorage);

      await notifier.checkStoredSession();

      expect(notifier.state.status, ProfesorAuthStatus.sessionExpired);
      expect(notifier.state.profesor?.id, testProfesor.id);
      expect(notifier.state.token, isNull);
      expect(notifier.state.errorMessage, contains('contraseña'));
    });

    test(
      'una falla de red al renovar no abre la pantalla de contraseña',
      () async {
        const expiredToken =
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MDAwMDAwMDB9.test';
        final testProfesor = Profesor(
          id: '123',
          name: 'Test Profesor',
          institutionalEmail: 'test@uat.edu.mx',
        );
        await authStorage.saveSession(
          token: expiredToken,
          profesor: testProfesor,
        );
        await authStorage.cacheUatPasswordForProcess('contraseña-vigente');

        final apiService = MockApiService();
        when(
          () => apiService.loginProfesor(
            email: testProfesor.institutionalEmail,
            password: 'contraseña-vigente',
          ),
        ).thenAnswer((_) async => const Left('Sin conexión'));
        when(() => apiService.lastLoginCredentialsRejected).thenReturn(false);
        final notifier = ProfesorAuthNotifier(apiService, authStorage);

        await notifier.checkStoredSession();

        expect(notifier.state.status, ProfesorAuthStatus.authenticated);
        expect(notifier.state.isSessionExpired, isFalse);
        expect(notifier.state.profesor?.id, testProfesor.id);
      },
    );

    test(
      'login nuevo no rescata clases antiguas si falla el ciclo actual',
      () async {
        const cachedGroup = Grupo(
          id: 'old-group',
          code: 'old-group',
          period: '2026-1',
          group: 'A',
          classroom: 'A1',
          name: 'Clase del ciclo anterior',
          students: [],
        );
        await authStorage.saveGrupos(const [cachedGroup]);

        final profesor = Profesor(
          id: '123',
          name: 'Test Profesor',
          institutionalEmail: 'test@uat.edu.mx',
        );
        final apiService = MockApiService();
        when(
          () => apiService.loginProfesor(
            email: 'test@uat.edu.mx',
            password: 'password-seguro',
          ),
        ).thenAnswer(
          (_) async => Right(
            LoginResponse(
              message: 'OK',
              profesor: profesor,
              token: 'uat-session',
            ),
          ),
        );
        when(
          () => apiService.getGruposProfesor('uat-session'),
        ).thenAnswer((_) async => const Left('Portal no disponible'));
        final notifier = ProfesorAuthNotifier(apiService, authStorage);

        await notifier.login('test@uat.edu.mx', 'password-seguro');

        expect(notifier.state.status, ProfesorAuthStatus.authenticated);
        expect(notifier.state.grupos, isEmpty);
        expect(authStorage.getGrupos(), isNull);
        expect(
          notifier.state.groupsNotice,
          contains('No se mostrarán datos guardados de ciclos anteriores'),
        );
      },
    );
  });
}
