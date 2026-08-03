import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:appprofesoresuniversidad/features/groups/screens/grupo_detail_page.dart';
import 'package:appprofesoresuniversidad/shared/models/grupo.dart';

void main() {
  testWidgets('GrupoDetailPage debe renderizarse correctamente', (
    WidgetTester tester,
  ) async {
    final grupo = Grupo(
      id: 'test-id-1',
      group: 'A',
      name: 'Matemáticas',
      classroom: 'A101',
      students: [],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: GrupoDetailPage(
          grupo: grupo,
          gradientColors: const [Colors.blue, Colors.purple],
          accentColor: Colors.blue,
          horario: '10:00 - 12:00',
          dias: 'Lunes, Miércoles',
        ),
      ),
    );

    // Pump los frames suficientes para que las animaciones se completen
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();

    // Verificar que la página se renderiza
    expect(find.byType(GrupoDetailPage), findsOneWidget);
    expect(find.byType(CustomScrollView), findsOneWidget);
  });

  testWidgets('Botón de back debe cerrar la página', (
    WidgetTester tester,
  ) async {
    final grupo = Grupo(
      id: 'test-id-2',
      group: 'A',
      name: 'Matemáticas',
      classroom: 'A101',
      students: [],
    );

    bool pagePopped = false;

    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () {
                  Navigator.of(context)
                      .push(
                        MaterialPageRoute(
                          builder: (_) => GrupoDetailPage(
                            grupo: grupo,
                            gradientColors: const [Colors.blue, Colors.purple],
                            accentColor: Colors.blue,
                            horario: '10:00 - 12:00',
                            dias: 'Lunes, Miércoles',
                          ),
                        ),
                      )
                      .then((_) {
                        pagePopped = true;
                      });
                },
                child: const Text('Open Detail'),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open Detail'));
    await tester.pumpAndSettle();

    expect(find.byType(GrupoDetailPage), findsOneWidget);

    // Buscar y tap el control de cierre vigente.
    final backButton = find.byIcon(Icons.close);
    expect(backButton, findsOneWidget);

    await tester.tap(backButton);
    await tester.pumpAndSettle();

    // Verificar que la página se cerró
    expect(find.byType(GrupoDetailPage), findsNothing);
    expect(pagePopped, true);
  });

  testWidgets('CustomScrollView debe permitir scroll', (
    WidgetTester tester,
  ) async {
    final grupo = Grupo(
      id: 'test-id-3',
      group: 'A',
      name: 'Matemáticas',
      classroom: 'A101',
      students: [],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: GrupoDetailPage(
          grupo: grupo,
          gradientColors: const [Colors.blue, Colors.purple],
          accentColor: Colors.blue,
          horario: '10:00 - 12:00',
          dias: 'Lunes, Miércoles',
        ),
      ),
    );

    // Pump los frames suficientes para que las animaciones se completen
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();

    final scrollView = find.byType(CustomScrollView);
    expect(scrollView, findsOneWidget);

    // Intentar scroll hacia abajo
    await tester.drag(scrollView, const Offset(0, -100));
    await tester.pump();

    // La página debe seguir ahí (no debe cerrarse con scroll normal)
    expect(find.byType(GrupoDetailPage), findsOneWidget);
  });

  testWidgets(
    'Pull to dismiss debe funcionar con contenido mínimo (sin scroll natural)',
    (WidgetTester tester) async {
      // Crear un grupo sin estudiantes para simular poco contenido
      final grupo = Grupo(
        id: 'test-id-4',
        group: 'A',
        name: 'Matemáticas',
        classroom: 'A101',
        students: [], // Sin estudiantes = poco contenido
      );

      bool pagePopped = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: ElevatedButton(
                  onPressed: () {
                    Navigator.of(context)
                        .push(
                          MaterialPageRoute(
                            builder: (_) => GrupoDetailPage(
                              grupo: grupo,
                              gradientColors: const [
                                Colors.blue,
                                Colors.purple,
                              ],
                              accentColor: Colors.blue,
                              horario: '10:00 - 12:00',
                              dias: 'Lunes, Miércoles',
                            ),
                          ),
                        )
                        .then((_) {
                          pagePopped = true;
                        });
                  },
                  child: const Text('Open Detail'),
                ),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('Open Detail'));
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();

      expect(find.byType(GrupoDetailPage), findsOneWidget);

      // Verificar que AlwaysScrollableScrollPhysics está activo
      final scrollView = find.byType(CustomScrollView);
      expect(scrollView, findsOneWidget);

      // Hacer drag hacia abajo grande (más de 100 pixels)
      // Incluso sin contenido suficiente, debería funcionar
      final Offset startLocation = tester.getCenter(scrollView);
      final TestGesture gesture = await tester.startGesture(startLocation);

      await gesture.moveBy(const Offset(0, 150));
      await tester.pump();

      await gesture.up();
      await tester.pumpAndSettle();

      // Verificar que la página se cerró
      expect(find.byType(GrupoDetailPage), findsNothing);
      expect(pagePopped, true);
    },
  );
}
