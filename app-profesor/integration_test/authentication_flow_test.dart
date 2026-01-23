import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:appprofesoresuniversidad/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Authentication Flow Integration Tests', () {
    testWidgets('complete login flow with valid credentials', (tester) async {
      // Start the app
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 10));

      // Should start on login page - wait for it to load
      await tester.pump(const Duration(seconds: 3));
      expect(find.text('Universidad Autónoma de Tamaulipas'), findsOneWidget);
      expect(find.text('Sistema de Asistencia Profesores'), findsOneWidget);

      // Check if we're on login page by looking for login elements
      expect(find.byKey(const Key('username_field')), findsOneWidget);
      expect(find.byKey(const Key('password_field')), findsOneWidget);

      // Find and fill username field
      final usernameField = find.byKey(const Key('username_field'));
      expect(usernameField, findsOneWidget);
      await tester.enterText(usernameField, 'juan.perez@uat.edu.mx');
      await tester.pump(const Duration(seconds: 1));

      // Find and fill password field
      final passwordField = find.byKey(const Key('password_field'));
      expect(passwordField, findsOneWidget);
      await tester.enterText(passwordField, 'uat2024');
      await tester.pump(const Duration(seconds: 1));

      // Tap login button
      final loginButton = find.byKey(const Key('login_button'));
      expect(loginButton, findsOneWidget);
      await tester.tap(loginButton);

      // Wait for navigation and loading - much more time for integration tests
      await tester.pumpAndSettle(const Duration(seconds: 10));

      // Should now be on dashboard
      expect(find.text('Dashboard'), findsOneWidget);
      expect(
        find.text('Bienvenido, Dr. Juan Carlos Pérez García'),
        findsOneWidget,
      );
      expect(find.text('juan.perez@uat.edu.mx'), findsOneWidget);
      expect(find.text('Departamento: Ingeniería en Sistemas'), findsOneWidget);

      // Check quick actions are present
      expect(find.text('Mis Grupos'), findsOneWidget);
      expect(find.text('Tomar Asistencia'), findsOneWidget);
      expect(find.text('Detectar Beacons'), findsOneWidget);
      expect(find.text('Reportes'), findsOneWidget);

      // Check groups are displayed
      expect(find.text('Mis Grupos (2)'), findsOneWidget);
      expect(find.text('ISC-801 Grupo A'), findsOneWidget);
      expect(find.text('ISC-601 Grupo B'), findsOneWidget);
    });

    testWidgets('login flow with invalid credentials shows error', (
      tester,
    ) async {
      // Start the app
      app.main();
      await tester.pumpAndSettle();

      // Fill invalid credentials
      await tester.enterText(
        find.byKey(const Key('username_field')),
        'invalid.user',
      );
      await tester.enterText(
        find.byKey(const Key('password_field')),
        'wrongpassword',
      );
      await tester.pump();

      // Tap login button
      await tester.tap(find.byKey(const Key('login_button')));

      // Wait for error to appear
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // Should show error message
      expect(
        find.text(
          'Credenciales inválidas. Verifique su correo institucional UAT.',
        ),
        findsOneWidget,
      );
      expect(find.byIcon(Icons.error_outline), findsOneWidget);

      // Should still be on login page
      expect(find.byKey(const Key('username_field')), findsOneWidget);
    });

    testWidgets('login with empty fields shows validation errors', (
      tester,
    ) async {
      // Start the app
      app.main();
      await tester.pumpAndSettle();

      // Tap login button without entering data
      await tester.tap(find.byKey(const Key('login_button')));
      await tester.pump();

      // Should show validation errors
      expect(find.text('Por favor ingrese su usuario'), findsOneWidget);
      expect(find.text('Por favor ingrese su contraseña'), findsOneWidget);

      // Should still be on login page
      expect(find.byKey(const Key('username_field')), findsOneWidget);
    });

    testWidgets('logout flow works correctly', (tester) async {
      // Start the app
      app.main();
      await tester.pumpAndSettle();

      // Login first
      await tester.enterText(
        find.byKey(const Key('username_field')),
        'juan.perez@uat.edu.mx',
      );
      await tester.enterText(
        find.byKey(const Key('password_field')),
        'uat2024',
      );
      await tester.tap(find.byKey(const Key('login_button')));
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // Should be on dashboard
      expect(find.text('Dashboard'), findsOneWidget);

      // Find and tap the menu button in app bar
      final menuButton = find.byIcon(Icons.more_vert);
      expect(menuButton, findsOneWidget);
      await tester.tap(menuButton);
      await tester.pumpAndSettle();

      // Find and tap logout option
      final logoutOption = find.text('Cerrar Sesión');
      expect(logoutOption, findsOneWidget);
      await tester.tap(logoutOption);
      await tester.pumpAndSettle(const Duration(seconds: 2));

      // Should be back on login page
      expect(find.byKey(const Key('username_field')), findsOneWidget);
      expect(find.text('Universidad Autónoma de Tamaulipas'), findsOneWidget);
    });

    testWidgets('password visibility toggle works', (tester) async {
      // Start the app
      app.main();
      await tester.pumpAndSettle();

      // Find password field and visibility toggle
      final passwordField = find.byKey(const Key('password_field'));
      await tester.enterText(passwordField, 'testpassword');
      await tester.pump();

      // Initially should show visibility icon (password hidden)
      expect(find.byIcon(Icons.visibility), findsOneWidget);

      // Tap visibility toggle
      final visibilityToggle = find.descendant(
        of: passwordField,
        matching: find.byType(IconButton),
      );
      await tester.tap(visibilityToggle);
      await tester.pump();

      // Should now show visibility_off icon (password visible)
      expect(find.byIcon(Icons.visibility_off), findsOneWidget);

      // Tap again to hide
      await tester.tap(visibilityToggle);
      await tester.pump();

      // Should show visibility icon again
      expect(find.byIcon(Icons.visibility), findsOneWidget);
    });

    testWidgets('form validation works for short inputs', (tester) async {
      // Start the app
      app.main();
      await tester.pumpAndSettle();

      // Enter short username and password
      await tester.enterText(find.byKey(const Key('username_field')), 'ab');
      await tester.enterText(find.byKey(const Key('password_field')), '123');
      await tester.pump();

      // Tap login button
      await tester.tap(find.byKey(const Key('login_button')));
      await tester.pump();

      // Should show validation errors
      expect(
        find.text('El usuario debe tener al menos 3 caracteres'),
        findsOneWidget,
      );
      expect(
        find.text('La contraseña debe tener al menos 6 caracteres'),
        findsOneWidget,
      );
    });

    testWidgets('loading state is shown during authentication', (tester) async {
      // Start the app
      app.main();
      await tester.pumpAndSettle();

      // Fill valid credentials
      await tester.enterText(
        find.byKey(const Key('username_field')),
        'juan.perez@uat.edu.mx',
      );
      await tester.enterText(
        find.byKey(const Key('password_field')),
        'uat2024',
      );
      await tester.pump();

      // Tap login button
      await tester.tap(find.byKey(const Key('login_button')));
      await tester.pump(const Duration(milliseconds: 100));

      // Should show loading indicators
      expect(find.byType(CircularProgressIndicator), findsWidgets);
      expect(find.text('Verificando credenciales...'), findsOneWidget);

      // Wait for login to complete
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // Should be on dashboard
      expect(find.text('Dashboard'), findsOneWidget);
    });

    testWidgets('second professor login shows different data', (tester) async {
      // Start the app
      app.main();
      await tester.pumpAndSettle();

      // Login with mathematics professor
      await tester.enterText(
        find.byKey(const Key('username_field')),
        'maria.rodriguez@uat.edu.mx',
      );
      await tester.enterText(
        find.byKey(const Key('password_field')),
        'uat2024',
      );
      await tester.tap(find.byKey(const Key('login_button')));
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // Should be on dashboard with mathematics professor data
      expect(find.text('Dashboard'), findsOneWidget);
      expect(
        find.text('Bienvenido, Dra. María Elena Rodríguez Sánchez'),
        findsOneWidget,
      );
      expect(find.text('maria.rodriguez@uat.edu.mx'), findsOneWidget);
      expect(find.text('Departamento: Matemáticas Aplicadas'), findsOneWidget);

      // Should show mathematics group
      expect(find.text('Mis Grupos (1)'), findsOneWidget);
      expect(find.text('MAT-401 Grupo A'), findsOneWidget);
    });
  });
}
