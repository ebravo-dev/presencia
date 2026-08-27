import 'package:app_alumno/utils/subject_name.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('subjectDisplayName', () {
    test('removes an RC code before the subject name', () {
      expect(
        subjectDisplayName('RC123456 - Arquitectura de Software'),
        'Arquitectura de Software',
      );
      expect(
        subjectDisplayName('rc-123-456: Programación móvil'),
        'Programación móvil',
      );
      expect(
        subjectDisplayName('(RC.IT.06061.2873.5-5) Estructuras de Datos'),
        'Estructuras de Datos',
      );
      expect(
        subjectDisplayName('RC.IT.06061.2873.5-5 Bases de Datos'),
        'Bases de Datos',
      );
    });

    test('removes an RC code after the subject name', () {
      expect(subjectDisplayName('Redes (RC 987654)'), 'Redes');
    });

    test('keeps subject names that do not contain a code', () {
      expect(subjectDisplayName('Cálculo Vectorial'), 'Cálculo Vectorial');
    });

    test('uses the requested fallback when there is no visible name', () {
      expect(
        subjectDisplayName('RC123456', fallback: 'Clase registrada'),
        'Clase registrada',
      );
    });

    test('keeps the semester number already included with the name', () {
      expect(
        subjectDisplayName('(RC.IT.06061.2873.5-5) (5) Redes'),
        '(5) Redes',
      );
    });
  });

  group('groupDisplayName', () {
    test('keeps only the group suffix from an institutional code', () {
      expect(groupDisplayName('RC.IT.06061.2873.5-5-M'), 'M');
      expect(groupDisplayName('A'), 'A');
    });
  });
}
