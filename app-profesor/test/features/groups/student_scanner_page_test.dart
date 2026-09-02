import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:appprofesoresuniversidad/core/theme/uat_theme.dart';
import 'package:appprofesoresuniversidad/features/groups/screens/student_scanner_page.dart';
import 'package:appprofesoresuniversidad/shared/models/alumno.dart';

void main() {
  testWidgets('muestra al alumno más reciente arriba de la pila', (
    tester,
  ) async {
    final detectedKeys = ValueNotifier<List<String>>(['1002', '1001']);
    addTearDown(detectedKeys.dispose);

    await tester.pumpWidget(
      MaterialApp(
        theme: UATTheme.lightTheme,
        home: StudentScannerPage(
          students: const [
            Alumno(id: '1', matricula: '1001', number: 1, name: 'Ana Martínez'),
            Alumno(id: '2', matricula: '1002', number: 2, name: 'Bruno López'),
            Alumno(id: '3', matricula: '1003', number: 3, name: 'Carla Pérez'),
          ],
          detectedStudentKeys: detectedKeys,
          gradientColors: const [Color(0xFFCC6633), Color(0xFFB85C3E)],
          subject: 'Matemáticas',
          groupLabel: 'A',
          availableStudentCount: 3,
          onStart: () async => true,
          onStop: () async {},
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    expect(find.text('Escaneando alumnos'), findsOneWidget);
    expect(find.text('Bruno López'), findsOneWidget);
    expect(find.text('Ana Martínez'), findsOneWidget);
    expect(find.text('Cancelar escaneo'), findsOneWidget);

    final brunoCard = find.byKey(const ValueKey('detected-student-1002'));
    final anaCard = find.byKey(const ValueKey('detected-student-1001'));
    expect(
      tester.getTopLeft(brunoCard).dy,
      lessThan(tester.getTopLeft(anaCard).dy),
    );

    detectedKeys.value = ['1003', '1002', '1001'];
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    final carlaCard = find.byKey(const ValueKey('detected-student-1003'));
    expect(find.text('Carla Pérez'), findsOneWidget);
    expect(
      tester.getTopLeft(carlaCard).dy,
      lessThan(tester.getTopLeft(brunoCard).dy),
    );
  });

  testWidgets('el botón rojo detiene el escaneo antes de cerrar', (
    tester,
  ) async {
    final detectedKeys = ValueNotifier<List<String>>(const []);
    addTearDown(detectedKeys.dispose);
    var stopped = false;

    await tester.pumpWidget(
      MaterialApp(
        theme: UATTheme.lightTheme,
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: FilledButton(
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => StudentScannerPage(
                        students: const [],
                        detectedStudentKeys: detectedKeys,
                        gradientColors: const [
                          Color(0xFFCC6633),
                          Color(0xFFB85C3E),
                        ],
                        subject: 'Matemáticas',
                        groupLabel: 'A',
                        availableStudentCount: 0,
                        onStart: () async => true,
                        onStop: () async {
                          stopped = true;
                        },
                      ),
                    ),
                  );
                },
                child: const Text('Abrir escáner'),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Abrir escáner'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byKey(const ValueKey('student-scanner-page')), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('cancel-student-scan')));
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(stopped, isTrue);
    expect(find.byKey(const ValueKey('student-scanner-page')), findsNothing);
  });
}
