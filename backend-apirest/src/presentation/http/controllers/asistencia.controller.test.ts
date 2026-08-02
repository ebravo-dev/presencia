import { describe, expect, it } from 'vitest';
import { AsistenciaController } from './asistencia.controller.js';

describe('AsistenciaController', () => {
  it('cuts the existing Flutter route over to the durable Attendance Service capture', async () => {
    let directUatCalled = false;
    let captured: unknown;
    const controller = new AsistenciaController(
      {
        registrarAsistencias: async () => { directUatCalled = true; return {}; },
      } as never,
      undefined,
      {
        capture: async (input: unknown) => {
          captured = input;
          return { data: { attendanceSessionId: 'attendance-1', uploadStatus: 'PENDING' } };
        },
      } as never,
    );

    const result = await controller.guardar({
      id: 'request-1',
      body: {
        Id_Grupo: 947699,
        Fec_Ini: '27/07/2026',
        Asistencia: [
          { id_alumno: 515722, num_pase_lista: 1, num_dia: 7, sn_asistencia: true },
          { id_alumno: 515723, num_pase_lista: 2, num_dia: 7, sn_asistencia: false },
        ],
      },
      uatSession: {
        id: '74b29734-65a8-48b2-9e6e-8cd01f1a0016',
        username: 'profesor@uat.edu.mx',
        login: { parametros: { Id_Plantilla_AdmonUAT: '308127' } },
      },
    } as never);

    expect(directUatCalled).toBe(false);
    expect(captured).toEqual({
      correlationId: 'request-1',
      uatSessionId: '74b29734-65a8-48b2-9e6e-8cd01f1a0016',
      externalGroupId: '947699',
      professorExternalId: '308127',
      date: '2026-08-02',
      professorEntryAt: null,
      professorExitAt: null,
      entries: [
        { uatStudentId: 515722, status: 'PRESENT' },
        { uatStudentId: 515723, status: 'ABSENT' },
      ],
    });
    expect(result).toMatchObject({ data: { attendanceSessionId: 'attendance-1' } });
  });

  it('rejects a payload that mixes more than one attendance day', async () => {
    const controller = new AsistenciaController({} as never, undefined, { capture: async () => ({}) } as never);
    await expect(controller.guardar({
      id: 'request-1',
      body: {
        Id_Grupo: 947699,
        Fec_Ini: '27/07/2026',
        Asistencia: [
          { id_alumno: 515722, num_pase_lista: 1, num_dia: 1, sn_asistencia: true },
          { id_alumno: 515723, num_pase_lista: 2, num_dia: 2, sn_asistencia: false },
        ],
      },
      uatSession: {
        id: '74b29734-65a8-48b2-9e6e-8cd01f1a0016', username: 'profesor@uat.edu.mx', login: { parametros: {} },
      },
    } as never)).rejects.toMatchObject({ code: 'ATTENDANCE_MULTIPLE_DAYS' });
  });
});
