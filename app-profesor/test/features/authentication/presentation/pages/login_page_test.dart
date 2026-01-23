import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mocktail/mocktail.dart';

import 'package:appprofesoresuniversidad/features/authentication/presentation/pages/login_page.dart';
import 'package:appprofesoresuniversidad/features/authentication/providers/auth_provider.dart';
import 'package:appprofesoresuniversidad/features/authentication/models/auth_models.dart';
import 'package:appprofesoresuniversidad/features/authentication/services/auth_service.dart';

// Mock classes
class MockAuthService extends Mock implements AuthService {}

class TestAuthNotifier extends AuthNotifier {
  TestAuthNotifier(AuthState initialState, AuthService authService)
    : super(authService) {
    state = initialState;
  }

  void setState(AuthState newState) {
    state = newState;
  }

  @override
  Future<void> login(String email, String password) async {
    state = state.copyWith(status: AuthStatus.loading);
  }

  @override
  void clearError() {
    state = state.copyWith(errorMessage: null);
  }
}

void main() {
  group('LoginPage Widget Tests', () {
    late MockAuthService mockAuthService;
    late TestAuthNotifier testAuthNotifier;

    setUp(() {
      mockAuthService = MockAuthService();

      // Set up default mock responses
      when(
        () => mockAuthService.getCurrentUser(),
      ).thenAnswer((_) async => null);
      when(
        () => mockAuthService.getUserGroups(any()),
      ).thenAnswer((_) async => []);
      when(() => mockAuthService.logout()).thenAnswer(
        (_) async =>
            const AuthResult(isSuccess: true, message: 'Logout exitoso'),
      );

      testAuthNotifier = TestAuthNotifier(const AuthState(), mockAuthService);
    });

    Widget createTestWidget({AuthState? authState}) {
      if (authState != null) {
        testAuthNotifier.setState(authState);
      }

      return ProviderScope(
        overrides: [
          authServiceProvider.overrideWithValue(mockAuthService),
          authStateProvider.overrideWith((ref) => testAuthNotifier),
        ],
        child: MaterialApp(home: const LoginPage()),
      );
    }

    testWidgets('renders login page with all elements', (tester) async {
      const authState = AuthState();

      await tester.pumpWidget(createTestWidget(authState: authState));

      // Check header elements
      expect(find.byIcon(Icons.school), findsOneWidget);
      expect(find.text('Universidad Autónoma de Tamaulipas'), findsOneWidget);
      expect(find.text('Sistema de Asistencia Profesores'), findsOneWidget);

      // Check login form title (check if there are multiple and that's OK)
      expect(find.text('Iniciar Sesión'), findsWidgets);

      // Check footer
      expect(find.text('Versión 1.0.0'), findsOneWidget);

      // Check that LoginForm is present (indirectly through its key elements)
      expect(find.text('Usuario UAT'), findsOneWidget);
      expect(find.text('Contraseña'), findsOneWidget);

      // Check that the login button exists using its key
      expect(find.byKey(const Key('login_button')), findsOneWidget);
    });

    testWidgets('shows loading indicator when authenticating', (tester) async {
      const authState = AuthState(status: AuthStatus.loading);

      await tester.pumpWidget(createTestWidget(authState: authState));

      // Should show loading indicator and text
      expect(find.byType(CircularProgressIndicator), findsWidgets);
      expect(find.text('Verificando credenciales...'), findsOneWidget);
    });

    testWidgets('has correct styling and layout', (tester) async {
      const authState = AuthState();

      await tester.pumpWidget(createTestWidget(authState: authState));

      // Check that it's wrapped in a Scaffold
      expect(find.byType(Scaffold), findsOneWidget);

      // Check that it has SafeArea
      expect(find.byType(SafeArea), findsOneWidget);

      // Check that it has SingleChildScrollView for responsiveness
      expect(find.byType(SingleChildScrollView), findsOneWidget);

      // Check that form is in a Card
      expect(find.byType(Card), findsOneWidget);
    });

    testWidgets('has correct color scheme', (tester) async {
      const authState = AuthState();

      await tester.pumpWidget(createTestWidget(authState: authState));

      // Check that scaffold has blue background
      final scaffold = tester.widget<Scaffold>(find.byType(Scaffold));
      expect(scaffold.backgroundColor, equals(Colors.blue.shade50));
    });

    testWidgets('shows error state correctly', (tester) async {
      const authState = AuthState(
        status: AuthStatus.error,
        errorMessage: 'Error de conexión',
      );

      await tester.pumpWidget(createTestWidget(authState: authState));

      // Should show error message from LoginForm
      expect(find.text('Error de conexión'), findsOneWidget);
      expect(find.byIcon(Icons.error_outline), findsOneWidget);

      // Should not show loading indicator
      expect(find.text('Verificando credenciales...'), findsNothing);
    });

    testWidgets('has responsive design constraints', (tester) async {
      const authState = AuthState();

      await tester.pumpWidget(createTestWidget(authState: authState));

      // Find the constrained container
      final constrainedContainer = find.descendant(
        of: find.byType(SingleChildScrollView),
        matching: find.byWidgetPredicate(
          (widget) =>
              widget is Container && widget.constraints?.maxWidth == 400,
        ),
      );

      expect(constrainedContainer, findsOneWidget);
    });

    testWidgets('displays university branding correctly', (tester) async {
      const authState = AuthState();

      await tester.pumpWidget(createTestWidget(authState: authState));

      // Check logo container styling
      final logoContainer = find.descendant(
        of: find.byType(SingleChildScrollView),
        matching: find.byWidgetPredicate(
          (widget) =>
              widget is Container &&
              widget.decoration is BoxDecoration &&
              (widget.decoration as BoxDecoration).shape == BoxShape.circle,
        ),
      );

      expect(logoContainer, findsOneWidget);

      // Check school icon
      expect(find.byIcon(Icons.school), findsOneWidget);
    });
  });
}
