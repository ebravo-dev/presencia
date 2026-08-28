import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:appprofesoresuniversidad/core/theme/uat_colors.dart';
import 'package:appprofesoresuniversidad/features/authentication/presentation/pages/login_page.dart';
import 'package:appprofesoresuniversidad/features/authentication/providers/profesor_auth_provider.dart';
import 'package:appprofesoresuniversidad/services/api_service.dart';
import 'package:appprofesoresuniversidad/services/auth_storage_service.dart';

class TestProfesorAuthNotifier extends ProfesorAuthNotifier {
  TestProfesorAuthNotifier([
    ProfesorAuthState initialState = const ProfesorAuthState(),
  ]) : super(ApiService(), AuthStorageService()) {
    state = initialState;
  }

  void emit(ProfesorAuthState nextState) {
    state = nextState;
  }
}

void main() {
  group('LoginPage Widget Tests', () {
    late TestProfesorAuthNotifier notifier;

    void setViewport(WidgetTester tester, Size size) {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = size;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
    }

    Widget createTestWidget({ProfesorAuthState? state}) {
      notifier = TestProfesorAuthNotifier(state ?? const ProfesorAuthState());
      return ProviderScope(
        overrides: [profesorAuthProvider.overrideWith((ref) => notifier)],
        child: const MaterialApp(home: LoginPage()),
      );
    }

    setUp(() {
      TestWidgetsFlutterBinding.ensureInitialized();
    });

    testWidgets('renders current professor login contract', (tester) async {
      setViewport(tester, const Size(390, 844));
      await tester.pumpWidget(createTestWidget());

      expect(find.byIcon(Icons.school_rounded), findsOneWidget);
      expect(find.text('Universidad Autónoma de Tamaulipas'), findsOneWidget);
      expect(
        find.text('Sistema de asistencia para profesores'),
        findsOneWidget,
      );
      expect(find.text('Acceso de profesores'), findsOneWidget);
      expect(find.byKey(const Key('email_field')), findsOneWidget);
      expect(find.byKey(const Key('password_field')), findsOneWidget);
      expect(find.byKey(const Key('login_button')), findsOneWidget);
    });

    testWidgets('shows loading state while authenticating', (tester) async {
      setViewport(tester, const Size(390, 844));
      await tester.pumpWidget(
        createTestWidget(
          state: const ProfesorAuthState(status: ProfesorAuthStatus.loading),
        ),
      );

      expect(find.byType(CircularProgressIndicator), findsNWidgets(2));
      expect(find.text('Comprobando tus datos...'), findsOneWidget);
    });

    testWidgets('uses the responsive narrow layout', (tester) async {
      setViewport(tester, const Size(390, 844));
      await tester.pumpWidget(createTestWidget());

      expect(find.byType(Scaffold), findsOneWidget);
      expect(find.byType(SafeArea), findsOneWidget);
      expect(find.byType(SingleChildScrollView), findsOneWidget);
      final constrainedContainer = find.descendant(
        of: find.byType(SingleChildScrollView),
        matching: find.byWidgetPredicate(
          (widget) =>
              widget is ConstrainedBox && widget.constraints.maxWidth == 400,
        ),
      );
      expect(constrainedContainer, findsOneWidget);
    });

    testWidgets('uses the responsive wide layout', (tester) async {
      setViewport(tester, const Size(1200, 800));
      await tester.pumpWidget(createTestWidget());

      expect(find.byType(SingleChildScrollView), findsNothing);
      expect(find.text('Universidad Autónoma\nde Tamaulipas'), findsOneWidget);
      expect(
        find.text('Sistema de asistencia para profesores'),
        findsOneWidget,
      );
    });

    testWidgets('uses the UAT surface color', (tester) async {
      await tester.pumpWidget(createTestWidget());

      final scaffold = tester.widget<Scaffold>(find.byType(Scaffold));
      expect(scaffold.backgroundColor, UATColors.surface);
    });

    testWidgets('shows authentication errors as an actionable snackbar', (
      tester,
    ) async {
      await tester.pumpWidget(createTestWidget());
      notifier.emit(
        const ProfesorAuthState(
          status: ProfesorAuthStatus.error,
          errorMessage: 'Error de conexión',
        ),
      );
      await tester.pump();

      expect(find.text('Error de conexión'), findsOneWidget);
      expect(find.text('Cerrar'), findsOneWidget);
      expect(find.text('Verificando credenciales...'), findsNothing);
    });
  });
}
