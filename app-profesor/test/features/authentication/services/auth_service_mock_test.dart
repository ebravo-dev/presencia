import 'package:flutter_test/flutter_test.dart';
import 'package:appprofesoresuniversidad/features/authentication/services/auth_service_mock.dart';
import 'package:appprofesoresuniversidad/features/authentication/models/auth_models.dart';

void main() {
  group('AuthServiceMock Tests', () {
    late AuthServiceMock authService;

    setUp(() {
      authService = AuthServiceMock();
    });

    group('login', () {
      test('successful login with valid credentials', () async {
        // Intentar múltiples veces para manejar la simulación de errores aleatorios del mock
        AuthResult? result;

        for (int i = 0; i < 5; i++) {
          result = await authService.login(
            'juan.perez@docentes.uat.edu.mx',
            'uat2024',
          );
          if (result.isSuccess) break;
          // Esperar un poco antes del siguiente intento
          await Future.delayed(const Duration(milliseconds: 10));
        }

        // Assert
        expect(result!.isSuccess, isTrue);
        expect(result.user, isNotNull);
        expect(result.token, isNotNull);
        expect(result.user!.name, equals('Dr. Juan Carlos Pérez García'));
        expect(result.user!.email, equals('juan.perez@docentes.uat.edu.mx'));
        expect(result.user!.department, equals('Ingeniería en Sistemas'));
        expect(result.message, equals('Login exitoso'));
      });

      test('successful login with second valid user', () async {
        // Intentar múltiples veces para manejar la simulación de errores aleatorios del mock
        AuthResult? result;

        for (int i = 0; i < 5; i++) {
          result = await authService.login(
            'maria.rodriguez@uat.edu.mx',
            'uat2024',
          );
          if (result.isSuccess) break;
          // Esperar un poco antes del siguiente intento
          await Future.delayed(const Duration(milliseconds: 10));
        }

        // Assert
        expect(result!.isSuccess, isTrue);
        expect(result.user, isNotNull);
        expect(result.token, isNotNull);
        expect(result.user!.name, equals('Dra. María Elena Rodríguez Sánchez'));
        expect(result.user!.email, equals('maria.rodriguez@uat.edu.mx'));
        expect(result.user!.department, equals('Matemáticas Aplicadas'));
      });

      test('failed login with invalid username', () async {
        // Act
        final result = await authService.login(
          'invalid.user@uat.edu.mx',
          'uat2024',
        );

        // Assert
        expect(result.isSuccess, isFalse);
        expect(result.user, isNull);
        expect(result.token, isNull);
        expect(
          result.message,
          equals('Tu usuario o contraseña son incorrectos. Revisa tus datos.'),
        );
      });

      test('failed login with invalid password', () async {
        // Act
        final result = await authService.login(
          'juan.perez@docentes.uat.edu.mx',
          'wrongpassword',
        );

        // Assert
        expect(result.isSuccess, isFalse);
        expect(result.user, isNull);
        expect(result.token, isNull);
        expect(
          result.message,
          equals('Contraseña incorrecta. Intenta de nuevo.'),
        );
      });

      test('failed login with empty username', () async {
        // Act
        final result = await authService.login('', 'uat2024');

        // Assert
        expect(result.isSuccess, isFalse);
        expect(
          result.message,
          equals('Tu usuario o contraseña son incorrectos. Revisa tus datos.'),
        );
      });

      test('failed login with empty password', () async {
        // Act
        final result = await authService.login(
          'juan.perez@docentes.uat.edu.mx',
          '',
        );

        // Assert
        expect(result.isSuccess, isFalse);
        expect(
          result.message,
          equals('Contraseña incorrecta. Intenta de nuevo.'),
        );
      });

      test('simulates network delay', () async {
        // Arrange
        final stopwatch = Stopwatch()..start();

        // Act
        await authService.login('juan.perez@docentes.uat.edu.mx', 'uat2024');

        // Assert
        stopwatch.stop();
        expect(
          stopwatch.elapsedMilliseconds,
          greaterThanOrEqualTo(1000),
        ); // At least 1 second
        expect(
          stopwatch.elapsedMilliseconds,
          lessThan(3000),
        ); // Less than 3 seconds (allowing for system load)
      });

      test('generates different tokens for each login', () async {
        // Act - Add small delay between logins to ensure different timestamps
        final result1 = await authService.login(
          'juan.perez@docentes.uat.edu.mx',
          'uat2024',
        );
        await Future.delayed(
          const Duration(milliseconds: 10),
        ); // Ensure different timestamp
        final result2 = await authService.login(
          'juan.perez@docentes.uat.edu.mx',
          'uat2024',
        );

        // Assert
        expect(result1.isSuccess, isTrue);
        expect(result2.isSuccess, isTrue);
        expect(result1.token, isNotNull);
        expect(result2.token, isNotNull);
        expect(result1.token, isNot(equals(result2.token)));
      });
    });

    group('logout', () {
      test('successful logout returns bool', () async {
        // Act & Assert - logout method should return AuthResult, not bool
        final result = await authService.logout();
        expect(result, isA<AuthResult>());
        expect(result.isSuccess, isTrue);
      });

      test('logout simulates network delay', () async {
        // Arrange
        final stopwatch = Stopwatch()..start();

        // Act
        await authService.logout();

        // Assert
        stopwatch.stop();
        expect(
          stopwatch.elapsedMilliseconds,
          greaterThanOrEqualTo(500),
        ); // At least 0.5 seconds
        expect(
          stopwatch.elapsedMilliseconds,
          lessThan(3000),
        ); // Less than 3 seconds (allowing for system load)
      });
    });

    group('getCurrentUser', () {
      test(
        'returns null when no user is logged in (stateless service)',
        () async {
          // Act
          final user = await authService.getCurrentUser();

          // Assert - Mock service is stateless, always returns null
          expect(user, isNull);
        },
      );

      test(
        'returns null even after successful login (stateless service)',
        () async {
          // Arrange
          final loginResult = await authService.login(
            'juan.perez@docentes.uat.edu.mx',
            'uat2024',
          );
          expect(loginResult.isSuccess, isTrue);

          // Act
          final user = await authService.getCurrentUser();

          // Assert - Mock service is stateless and doesn't maintain session
          expect(user, isNull);
        },
      );

      test('returns null after logout (stateless service)', () async {
        // Arrange
        await authService.login('juan.perez@docentes.uat.edu.mx', 'uat2024');
        await authService.logout();

        // Act
        final user = await authService.getCurrentUser();

        // Assert
        expect(user, isNull);
      });
    });

    group('getUserGroups', () {
      test('returns empty list when no user is logged in', () async {
        // Act
        final groups = await authService.getUserGroups('no-user');

        // Assert
        expect(groups, isEmpty);
      });

      test('returns groups for systems engineering professor', () async {
        // Arrange - Retry login if it fails due to random server error simulation
        AuthResult loginResult;
        int attempts = 0;
        do {
          loginResult = await authService.login(
            'juan.perez@docentes.uat.edu.mx',
            'uat2024',
          );
          attempts++;
        } while (!loginResult.isSuccess && attempts < 5);

        expect(
          loginResult.isSuccess,
          isTrue,
          reason: 'Login should succeed after retries',
        );

        // Act
        final groups = await authService.getUserGroups(loginResult.user!.id);

        // Assert
        expect(groups, hasLength(2));

        final group1 = groups.firstWhere((g) => g.id == 'group_001');
        expect(group1.name, equals('ISC-801 Grupo A'));
        expect(group1.subject, equals('Desarrollo de Aplicaciones Móviles'));
        expect(group1.classroom, equals('Aula 201 - Edificio B'));
        expect(group1.students, hasLength(3));

        final group2 = groups.firstWhere((g) => g.id == 'group_002');
        expect(group2.name, equals('ISC-601 Grupo B'));
        expect(group2.subject, equals('Programación Web Avanzada'));
        expect(group2.classroom, equals('Laboratorio 101 - Edificio A'));
        expect(group2.students, hasLength(2));
      });

      test('returns groups for mathematics professor', () async {
        // Arrange - Retry login if it fails due to random server error simulation
        AuthResult loginResult;
        int attempts = 0;
        do {
          loginResult = await authService.login(
            'maria.rodriguez@uat.edu.mx',
            'uat2024',
          );
          attempts++;
        } while (!loginResult.isSuccess && attempts < 5);

        expect(
          loginResult.isSuccess,
          isTrue,
          reason: 'Login should succeed after retries',
        );

        // Act
        final groups = await authService.getUserGroups(loginResult.user!.id);

        // Assert
        expect(groups, hasLength(1));

        final mathGroup = groups.first;
        expect(mathGroup.id, equals('group_003'));
        expect(mathGroup.name, equals('MAT-401 Grupo A'));
        expect(mathGroup.subject, equals('Cálculo Diferencial e Integral'));
        expect(mathGroup.classroom, equals('Aula 301 - Edificio C'));
        expect(mathGroup.students, hasLength(2));
      });

      test('group students have correct structure', () async {
        // Arrange - Retry login if it fails due to random server error simulation
        AuthResult loginResult;
        int attempts = 0;
        do {
          loginResult = await authService.login(
            'juan.perez@docentes.uat.edu.mx',
            'uat2024',
          );
          attempts++;
        } while (!loginResult.isSuccess && attempts < 5);

        expect(
          loginResult.isSuccess,
          isTrue,
          reason: 'Login should succeed after retries',
        );

        // Act
        final groups = await authService.getUserGroups(loginResult.user!.id);

        // Assert
        final group = groups.first;
        final student = group.students.first;

        expect(student.id, isNotEmpty);
        expect(student.studentId, isNotEmpty);
        expect(student.name, isNotEmpty);
        expect(student.email, contains('@uat.edu.mx'));
        expect(student.attendanceRecords, isA<List<AttendanceRecord>>());
      });

      test('simulates network delay for getUserGroups', () async {
        // Arrange - Retry login if it fails due to random server error simulation
        AuthResult loginResult;
        int attempts = 0;
        do {
          loginResult = await authService.login(
            'juan.perez@docentes.uat.edu.mx',
            'uat2024',
          );
          attempts++;
        } while (!loginResult.isSuccess && attempts < 5);

        expect(
          loginResult.isSuccess,
          isTrue,
          reason: 'Login should succeed after retries',
        );

        final stopwatch = Stopwatch()..start();

        // Act
        await authService.getUserGroups(loginResult.user!.id);

        // Assert
        stopwatch.stop();
        expect(
          stopwatch.elapsedMilliseconds,
          greaterThanOrEqualTo(800),
        ); // At least 0.8 seconds
        expect(
          stopwatch.elapsedMilliseconds,
          lessThan(3000),
        ); // Less than 3 seconds (allowing for system load)
      });
    });
  });
}
