import 'package:flutter_test/flutter_test.dart';
import 'package:appprofesoresuniversidad/shared/models/grupo.dart';
import 'package:appprofesoresuniversidad/data/models/uat_horario_model.dart';

void main() {
  test('normaliza una clase compartida con horarios estructurados', () {
    final grupo = Grupo.fromJson({
      'id': '9900001',
      'code': 'RC.SEED',
      'groupLetter': 'Z',
      'period': '2026 - 2 VERANO',
      'group': 'RC.SEED-Z',
      'classroom': 'LAB-01',
      'name': 'Clase compartida',
      'students': [
        {
          'id': '500000',
          'matricula': 'DEMO0001',
          'number': 1,
          'name': 'Alumno Demo',
        },
      ],
      'schedule': {
        'monday': [
          {'raw': '10:00-11:00', 'startTime': '10:00', 'endTime': '11:00'},
          {'raw': '11:00-12:00', 'startTime': '11:00', 'endTime': '12:00'},
        ],
        'tuesday': <Object>[],
      },
      'studentsCount': 1,
      'source': 'SHARED',
      'isShared': true,
      'sharedAssignmentId': 'shared-1',
      'primaryProfessor': {'id': 'teacher-1', 'name': 'Profesor Titular'},
    });

    expect(grupo.esCompartida, isTrue);
    expect(grupo.profesorTitular, 'Profesor Titular');
    expect(grupo.students, hasLength(1));
    expect(grupo.students.single.matricula, 'DEMO0001');
    expect(grupo.students.single.name, 'Alumno Demo');
    expect(grupo.schedule?['monday'], '10:00-11:00; 11:00-12:00');
    expect(grupo.horario, '10:00-12:00');
    expect(grupo.horarioParaDia(DateTime.monday), '10:00-12:00');
    expect(grupo.horarioParaDia(DateTime.tuesday), isNull);
  });

  test('combina filas UAT consecutivas del mismo grupo', () {
    final first = UatHorarioModel.fromJson({
      'Id_Grupo': 947699,
      'Txt_Materia': '(MOV-01) Desarrollo móvil',
      'Txt_Lunes': '08:00-09:00',
    });
    final second = UatHorarioModel.fromJson({
      'Id_Grupo': 947699,
      'Txt_Materia': '(MOV-01) Desarrollo móvil',
      'Txt_Lunes': '09:00-10:00',
    });

    final grupo = first.merge(second).toGrupo();

    expect(grupo.subject, 'Desarrollo móvil');
    expect(grupo.horarioParaDia(DateTime.monday), '08:00-10:00');
  });
}
