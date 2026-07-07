import 'package:flutter_test/flutter_test.dart';
import 'package:appprofesoresuniversidad/services/attendance_batch_service.dart';
import 'package:appprofesoresuniversidad/shared/models/alumno.dart';
import 'package:appprofesoresuniversidad/shared/models/asistencia_registro.dart';
import 'package:appprofesoresuniversidad/shared/models/grupo.dart';

void main() {
  test('prepara todas las listas en un único contrato de lote', () {
    final service = AttendanceBatchService();
    final group = Grupo(
      id: '947699',
      code: '947699',
      groupLetter: 'A',
      period: '2026-2',
      group: 'A',
      classroom: 'A1',
      name: 'Cálculo',
      students: const [
        Alumno(id: '371591', matricula: '2001', number: 7, name: 'Ada'),
      ],
    );
    final record = AsistenciaRegistro(
      id: 'local-1',
      grupoId: group.id,
      profesorId: 'teacher-1',
      fecha: DateTime(2026, 7, 6),
      asistenciasAlumnos: const {'2001': true},
      fechaCreacion: DateTime(2026, 7, 6),
    );

    final prepared = service.prepare([record], [group]);

    expect(prepared.skipped, 0);
    expect(prepared.payload, hasLength(1));
    expect(prepared.payload.single['clientRecordId'], 'local-1');
    expect(prepared.payload.single['Id_Grupo'], 947699);
    expect(prepared.payload.single['Fec_Ini'], '06/07/2026');
    expect(prepared.payload.single['Asistencia'], [
      {
        'id_alumno': 371591,
        'num_pase_lista': 1,
        'num_dia': 1,
        'sn_asistencia': true,
      },
    ]);
  });
}
