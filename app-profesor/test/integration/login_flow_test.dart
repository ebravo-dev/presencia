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

    test('Escenario 7: Migra sesiones heredadas al almacén seguro', () async {
      final box = Hive.box('auth');
      await box.put('jwt_token', 'uat-session-heredada');
      await box.put('main_backend_jwt_token', 'backend-session-heredada');

      await authStorage.init();

      expect(authStorage.getToken(), 'uat-session-heredada');
      expect(authStorage.getMainBackendToken(), 'backend-session-heredada');
      expect(box.containsKey('jwt_token'), isFalse);
      expect(box.containsKey('main_backend_jwt_token'), isFalse);
      const secureStorage = FlutterSecureStorage();
      expect(
        await secureStorage.read(key: 'professor_session_token'),
        'uat-session-heredada',
      );
      expect(
        await secureStorage.read(key: 'professor_main_backend_token'),
        'backend-session-heredada',
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
      when(() => apiService.usesBackendApiRest).thenReturn(false);
      when(() => apiService.getGruposProfesor(validToken)).thenAnswer(
        (_) async =>
            const Right((grupos: <Grupo>[], beacons: <Map<String, dynamic>>[])),
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
  });
}
