import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive/hive.dart';
import 'package:appprofesoresuniversidad/services/auth_storage_service.dart';
import 'package:appprofesoresuniversidad/features/authentication/providers/profesor_auth_provider.dart';
import 'package:appprofesoresuniversidad/shared/models/profesor.dart';

void main() {
  late AuthStorageService authStorage;
  late Directory testDir;

  setUpAll(() async {
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
      expect(hasSession, true); // Pero sí hay sesión guardada (solo valida existencia)
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

      final container = ProviderContainer();
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
