import 'package:dartz/dartz.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:appprofesoresuniversidad/features/groups/screens/grupo_detail_page.dart';
import 'package:appprofesoresuniversidad/services/api_service.dart';
import 'package:appprofesoresuniversidad/shared/models/alumno.dart';
import 'package:appprofesoresuniversidad/shared/models/grupo.dart';

class _MockApiService extends Mock implements ApiService {}

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

    await tester.tap(find.text('Alumnos'));
    await tester.pumpAndSettle();
    final scannerButton = find.byKey(const ValueKey('open-student-scanner'));
    expect(scannerButton, findsOneWidget);
    expect(find.text('Escanear alumnos'), findsOneWidget);
    expect(find.text('Detección automática'), findsNothing);
    expect(tester.getSize(scannerButton).width, greaterThan(300));
  });

  testWidgets('no muestra alta manual para alumnos sin vínculo GATT', (
    WidgetTester tester,
  ) async {
    final apiService = _MockApiService();
    when(() => apiService.listAvailableClassroomBeacons()).thenAnswer(
      (_) async => const Right<String, List<Map<String, dynamic>>>([]),
    );
    when(
      () => apiService.resolveStudentDeviceBindings(
        matriculas: any(named: 'matriculas'),
      ),
    ).thenAnswer(
      (_) async => const Right<String, List<Map<String, dynamic>>>([]),
    );
    final grupo = Grupo(
      id: '947699',
      group: 'A',
      name: 'Matemáticas',
      classroom: 'A101',
      students: const [
        Alumno(
          id: '515722',
          matricula: '2251330008',
          number: 1,
          name: 'Ana Alumna',
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: GrupoDetailPage(
          grupo: grupo,
          gradientColors: const [Colors.blue, Colors.purple],
          accentColor: Colors.blue,
          horario: '10:00 - 12:00',
          dias: 'Lunes, Martes, Miércoles, Jueves, Viernes',
          apiService: apiService,
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 800));
    await tester.tap(find.text('Alumnos'));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('bind-student-uuid-2251330008')),
      findsNothing,
    );
    expect(find.text('Dar de alta'), findsNothing);
    expect(find.text('Código de asistencia'), findsNothing);
    expect(find.textContaining('iBeacon'), findsNothing);
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
