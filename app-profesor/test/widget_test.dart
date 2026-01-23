// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:appprofesoresuniversidad/main.dart';

void main() {
  testWidgets('App starts and shows login page', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(
      const ProviderScope(
        child: MyApp(),
      ),
    );

    // Wait for the app to settle
    await tester.pumpAndSettle();

    // Verify that we start on the login page
    expect(find.text('Universidad Autónoma de Tamaulipas'), findsOneWidget);
    expect(find.text('Sistema de Asistencia Profesores'), findsOneWidget);
    expect(find.text('Usuario UAT'), findsOneWidget);
    expect(find.text('Contraseña'), findsOneWidget);
  });
}
