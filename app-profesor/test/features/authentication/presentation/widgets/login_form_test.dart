import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:appprofesoresuniversidad/features/authentication/presentation/widgets/profesor_login_form.dart';
import 'package:appprofesoresuniversidad/features/authentication/providers/profesor_auth_provider.dart';
import 'package:appprofesoresuniversidad/services/api_service.dart';
import 'package:appprofesoresuniversidad/services/auth_storage_service.dart';

class TestProfesorAuthNotifier extends ProfesorAuthNotifier {
  TestProfesorAuthNotifier([
    ProfesorAuthState initialState = const ProfesorAuthState(),
  ]) : super(ApiService(), AuthStorageService()) {
    state = initialState;
  }

  String? submittedEmail;
  String? submittedPassword;

  @override
  Future<void> login(String email, String password) async {
    submittedEmail = email;
    submittedPassword = password;
    state = state.copyWith(status: ProfesorAuthStatus.loading);
  }

  void emit(ProfesorAuthState nextState) {
    state = nextState;
  }
}

void main() {
  group('ProfesorLoginForm Widget Tests', () {
    late TestProfesorAuthNotifier notifier;

    Widget createTestWidget({ProfesorAuthState? state}) {
      notifier = TestProfesorAuthNotifier(state ?? const ProfesorAuthState());

      return ProviderScope(
        overrides: [profesorAuthProvider.overrideWith((ref) => notifier)],
        child: const MaterialApp(home: Scaffold(body: ProfesorLoginForm())),
      );
    }

    testWidgets('renders institutional credential fields', (tester) async {
      await tester.pumpWidget(createTestWidget());

      expect(find.byKey(const Key('email_field')), findsOneWidget);
      expect(find.text('Email institucional'), findsOneWidget);
      expect(find.byKey(const Key('password_field')), findsOneWidget);
      expect(find.text('Contraseña'), findsOneWidget);
      expect(find.byKey(const Key('login_button')), findsOneWidget);
      expect(find.text('Iniciar Sesión'), findsOneWidget);
      expect(
        find.text('Usa tu email y contraseña institucional'),
        findsOneWidget,
      );
    });

    testWidgets('validates required institutional credentials', (tester) async {
      await tester.pumpWidget(createTestWidget());

      final form = tester.state<FormState>(find.byType(Form));
      expect(form.validate(), isFalse);
      await tester.pump();

      expect(find.text('Por favor ingresa tu email'), findsOneWidget);
      expect(find.text('Por favor ingresa tu contraseña'), findsOneWidget);
    });

    testWidgets('validates malformed email and short password', (tester) async {
      await tester.pumpWidget(createTestWidget());

      await tester.enterText(find.byKey(const Key('email_field')), 'docente');
      await tester.enterText(find.byKey(const Key('password_field')), '123');
      final form = tester.state<FormState>(find.byType(Form));
      expect(form.validate(), isFalse);
      await tester.pump();

      expect(find.text('Por favor ingresa un email válido'), findsOneWidget);
      expect(
        find.text('La contraseña debe tener al menos 4 caracteres'),
        findsOneWidget,
      );
    });

    testWidgets('toggles password visibility', (tester) async {
      await tester.pumpWidget(createTestWidget());

      expect(find.byIcon(Icons.visibility), findsOneWidget);
      await tester.tap(find.byIcon(Icons.visibility));
      await tester.pump();
      expect(find.byIcon(Icons.visibility_off), findsOneWidget);
    });

    testWidgets('submits the exact UAT credentials', (tester) async {
      await tester.pumpWidget(createTestWidget());

      await tester.enterText(
        find.byKey(const Key('email_field')),
        'juan.perez@docentes.uat.edu.mx',
      );
      await tester.enterText(
        find.byKey(const Key('password_field')),
        'uat2024',
      );
      await tester.pump();
      await tester.tap(find.byKey(const Key('login_button')));
      await tester.pump();

      expect(notifier.submittedEmail, 'juan.perez@docentes.uat.edu.mx');
      expect(notifier.submittedPassword, 'uat2024');
    });

    testWidgets('disables fields and button while authenticating', (
      tester,
    ) async {
      await tester.pumpWidget(
        createTestWidget(
          state: const ProfesorAuthState(status: ProfesorAuthStatus.loading),
        ),
      );

      final emailField = tester.widget<TextFormField>(
        find.byKey(const Key('email_field')),
      );
      final passwordField = tester.widget<TextFormField>(
        find.byKey(const Key('password_field')),
      );
      final loginButton = tester.widget<ElevatedButton>(
        find.byKey(const Key('login_button')),
      );

      expect(emailField.enabled, isFalse);
      expect(passwordField.enabled, isFalse);
      expect(loginButton.onPressed, isNull);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('shows backend authentication errors', (tester) async {
      await tester.pumpWidget(createTestWidget());

      notifier.emit(
        const ProfesorAuthState(
          status: ProfesorAuthStatus.error,
          errorMessage: 'Credenciales inválidas',
        ),
      );
      await tester.pump();

      expect(find.text('Credenciales inválidas'), findsOneWidget);
      expect(find.text('Cerrar'), findsOneWidget);
    });

    testWidgets('submits when pressing done on password', (tester) async {
      await tester.pumpWidget(createTestWidget());

      await tester.enterText(
        find.byKey(const Key('email_field')),
        'docente@uat.edu.mx',
      );
      await tester.enterText(find.byKey(const Key('password_field')), 'secret');
      await tester.tap(find.byKey(const Key('password_field')));
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pump();

      expect(notifier.submittedEmail, 'docente@uat.edu.mx');
      expect(notifier.submittedPassword, 'secret');
    });
  });
}
