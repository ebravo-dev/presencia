import 'package:app_alumno/models/student_academic_profile.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('StudentAcademicProfile', () {
    test('maps the selected UAT career and student identity', () {
      final profile = StudentAcademicProfile.fromSessionResponse(
        {
          'login': {
            'parametros': {'Txt_Nombre_Alumno': 'Ana Alumna'},
          },
          'selectedCareer': {
            'parametros': {'Id_Plan_Estudio_AlumnosUAT': 3314},
          },
          'careers': [
            {
              'Id_Plan_Estudio': 3313,
              'Txt_Programa_Academico': 'Programa anterior',
            },
            {
              'Id_Plan_Estudio': 3314,
              'Txt_Programa_Academico': 'Ingeniería de Software',
              'CicloActivo': '2026 - 2 VERANO',
              'Promedio': 92.5,
              'CreditosAprobados': 180,
            },
          ],
        },
        matricula: 'a0000000000',
        institutionalEmail: ' ALUMNA@ALUMNOS.UAT.EDU.MX ',
      );

      expect(profile.matricula, 'A0000000000');
      expect(profile.institutionalEmail, 'alumna@alumnos.uat.edu.mx');
      expect(profile.displayName, 'Ana Alumna');
      expect(profile.programName, 'Ingeniería de Software');
      expect(profile.cycleName, '2026 - 2 VERANO');
      expect(profile.average, '92.5');
      expect(profile.approvedCredits, '180');
    });

    test('falls back safely when optional UAT profile fields are absent', () {
      final profile = StudentAcademicProfile.fromSessionResponse(
        const {},
        matricula: '2251330007',
        institutionalEmail: 'student@alumnos.uat.edu.mx',
      );

      expect(profile.displayName, 'student@alumnos.uat.edu.mx');
      expect(profile.programName, isNull);
      expect(profile.cycleName, isNull);
    });
  });
}
