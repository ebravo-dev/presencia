import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mocktail/mocktail.dart';

import 'package:appprofesoresuniversidad/features/authentication/presentation/widgets/login_form.dart';
import 'package:appprofesoresuniversidad/features/authentication/providers/auth_provider.dart';
import 'package:appprofesoresuniversidad/features/authentication/models/auth_models.dart';
import 'package:appprofesoresuniversidad/features/authentication/services/auth_service.dart';

// Mock classes
class MockAuthService extends Mock implements AuthService {}

void main() {
  group('LoginForm Widget Tests', () {
    late MockAuthService mockAuthService;

    setUp(() {
      mockAuthService = MockAuthService();

      // Setup default auth service behavior
      when(() => mockAuthService.login(any(), any())).thenAnswer(
        (_) async =>
            const AuthResult(isSuccess: true, message: 'Login successful'),
      );
    });

    Widget createTestWidget({AuthState? overrideState}) {
      return ProviderScope(
        overrides: [
          authServiceProvider.overrideWithValue(mockAuthService),
          if (overrideState != null)
            authStateProvider.overrideWith(
              (ref) => AuthNotifier(mockAuthService)..state = overrideState,
            ),
        ],
        child: MaterialApp(home: Scaffold(body: const LoginForm())),
      );
    }

    testWidgets('renders all required fields and elements', (tester) async {
      await tester.pumpWidget(createTestWidget());

      // Check if username field exists
      expect(find.byKey(const Key('username_field')), findsOneWidget);
      // Find elements
      expect(find.text('Usuario institucional'), findsOneWidget);

      // Check if password field exists
      expect(find.byKey(const Key('password_field')), findsOneWidget);
      expect(find.text('Contraseña'), findsOneWidget);

      // Check if login button exists
      expect(find.byKey(const Key('login_button')), findsOneWidget);
      expect(find.text('Iniciar Sesión'), findsOneWidget);

      // Check if demo credentials hint exists
      expect(find.text('Credenciales de prueba:'), findsOneWidget);
      expect(find.text('• juan.perez + @docentes.uat.edu.mx'), findsOneWidget);
    });

    testWidgets('shows validation errors for empty fields', (tester) async {
      await tester.pumpWidget(createTestWidget());

      // Tap login button without entering data
      await tester.tap(find.byKey(const Key('login_button')));
      await tester.pump();

      // Check validation messages
      expect(find.text('Por favor ingrese su usuario'), findsOneWidget);
      expect(find.text('Por favor ingrese su contraseña'), findsOneWidget);
    });

    testWidgets('shows validation errors for short inputs', (tester) async {
      await tester.pumpWidget(createTestWidget());

      // Enter short username and password
      await tester.enterText(find.byKey(const Key('username_field')), 'ab');
      await tester.enterText(find.byKey(const Key('password_field')), '123');

      // Tap login button
      await tester.tap(find.byKey(const Key('login_button')));
      await tester.pump();

      // Check validation messages
      expect(
        find.text('El usuario debe tener al menos 3 caracteres'),
        findsOneWidget,
      );
      expect(
        find.text('La contraseña debe tener al menos 6 caracteres'),
        findsOneWidget,
      );
    });

    testWidgets('toggles password visibility', (tester) async {
      await tester.pumpWidget(createTestWidget());

      // Find password field
      final passwordField = find.byKey(const Key('password_field'));
      expect(passwordField, findsOneWidget);

      // Initially password should be obscured (check for visibility icon)
      expect(find.byIcon(Icons.visibility), findsOneWidget);

      // Find and tap the visibility toggle button
      final visibilityButton = find.descendant(
        of: passwordField,
        matching: find.byType(IconButton),
      );
      await tester.tap(visibilityButton);
      await tester.pump();

      // Password should now be visible (check for visibility_off icon)
      expect(find.byIcon(Icons.visibility_off), findsOneWidget);
    });

    testWidgets('calls auth service when form is valid', (tester) async {
      await tester.pumpWidget(createTestWidget());

      // Enter valid credentials
      await tester.enterText(
        find.byKey(const Key('username_field')),
        'juan.perez',
      );
      await tester.enterText(
        find.byKey(const Key('password_field')),
        'uat2024',
      );

      // Tap login button
      await tester.tap(find.byKey(const Key('login_button')));
      await tester.pump();

      // Wait for async operations
      await tester.pumpAndSettle();

      // Verify auth service was called
      verify(
        () =>
            mockAuthService.login('juan.perez@docentes.uat.edu.mx', 'uat2024'),
      ).called(1);
    });

    testWidgets('shows loading state during authentication', (tester) async {
      // Create a widget with loading state
      await tester.pumpWidget(
        createTestWidget(
          overrideState: const AuthState(status: AuthStatus.loading),
        ),
      );

      // Wait for the widget to rebuild
      await tester.pump();

      // Fields should be disabled
      final usernameField = tester.widget<TextFormField>(
        find.byKey(const Key('username_field')),
      );
      final passwordField = tester.widget<TextFormField>(
        find.byKey(const Key('password_field')),
      );
      final loginButton = tester.widget<ElevatedButton>(
        find.byKey(const Key('login_button')),
      );

      expect(usernameField.enabled, isFalse);
      expect(passwordField.enabled, isFalse);
      expect(loginButton.onPressed, isNull);

      // Should show loading indicator in button
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('shows error message when authentication fails', (
      tester,
    ) async {
      // Create a widget with error state
      await tester.pumpWidget(
        createTestWidget(
          overrideState: const AuthState(
            status: AuthStatus.error,
            errorMessage: 'Credenciales inválidas',
          ),
        ),
      );

      // Wait for the widget to rebuild
      await tester.pump();

      // Should show error message
      expect(find.text('Credenciales inválidas'), findsOneWidget);
      expect(find.byIcon(Icons.error_outline), findsOneWidget);
    });

    testWidgets('submits form when pressing done on password field', (
      tester,
    ) async {
      await tester.pumpWidget(createTestWidget());

      // Enter valid credentials
      await tester.enterText(
        find.byKey(const Key('username_field')),
        'juan.perez',
      );
      await tester.enterText(
        find.byKey(const Key('password_field')),
        'uat2024',
      );

      // Find the password field and simulate pressing done
      final passwordField = find.byKey(const Key('password_field'));
      await tester.tap(passwordField);
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();

      // Verify auth service was called
      verify(
        () =>
            mockAuthService.login('juan.perez@docentes.uat.edu.mx', 'uat2024'),
      ).called(1);
    });
  });
}
