import 'package:flutter_test/flutter_test.dart';
import 'package:appprofesoresuniversidad/shared/models/grupo.dart';

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
      'students': <Object>[],
      'schedule': {
        'monday': [
          {'raw': '10:00-11:00', 'startTime': '10:00', 'endTime': '11:00'},
        ],
        'tuesday': <Object>[],
      },
      'studentsCount': 0,
      'source': 'SHARED',
      'isShared': true,
      'sharedAssignmentId': 'shared-1',
      'primaryProfessor': {'id': 'teacher-1', 'name': 'Profesor Titular'},
    });

    expect(grupo.esCompartida, isTrue);
    expect(grupo.profesorTitular, 'Profesor Titular');
    expect(grupo.schedule?['monday'], '10:00-11:00');
    expect(grupo.horario, '10:00-11:00');
  });
}
