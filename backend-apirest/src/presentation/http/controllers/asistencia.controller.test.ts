import { describe, expect, it, vi } from 'vitest';
import { AsistenciaController } from './asistencia.controller.js';

describe('AsistenciaController', () => {
  it('cuts the existing Flutter route over to the durable Attendance Service capture', async () => {
    let captured: unknown;
    let enqueued: unknown;
    let wakes = 0;
    const controller = new AsistenciaController(
      {} as never,
      {
        capture: async (input: unknown) => {
          captured = input;
          return { data: {
            attendanceSessionId: 'attendance-1', externalGroupId: '947699', date: '2026-08-02',
            entriesCount: 2, uploadStatus: 'PENDING', duplicate: false, version: 3,
          } };
        },
      } as never,
      { submit: async (input: unknown) => { enqueued = input; return { id: 'batch-1' }; } } as never,
      { wake: () => { wakes += 1; } },
    );

    const result = await controller.guardar({
      id: 'request-1',
      body: {
        ClientRecordId: '947699_2026-08-02',
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
        credentialCipher: 'encrypted-before-accepting-capture',
        login: { parametros: { Id_Plantilla_AdmonUAT: '308127' } },
      },
    } as never);

    expect(captured).toEqual({
      correlationId: 'request-1',
      externalGroupId: '947699',
      professorExternalId: '308127',
      date: '2026-08-02',
      entries: [
        { uatStudentId: 515722, status: 'PRESENT' },
        { uatStudentId: 515723, status: 'ABSENT' },
      ],
    });
    expect(enqueued).toEqual({
      ownerUsername: 'profesor@uat.edu.mx',
      credentialCipher: 'encrypted-before-accepting-capture',
      records: [{
        clientRecordId: '947699_2026-08-02', attendanceSessionId: 'attendance-1', attendanceVersion: 3,
        idGrupo: 947699, fechaInicio: '27/07/2026',
        attendances: [
          { id_alumno: 515722, num_pase_lista: 1, num_dia: 7, sn_asistencia: true },
          { id_alumno: 515723, num_pase_lista: 2, num_dia: 7, sn_asistencia: false },
        ],
      }],
    });
    expect(wakes).toBe(1);
    expect(result).toMatchObject({ data: { attendanceSessionId: 'attendance-1' } });
  });

  it('rejects a payload that mixes more than one attendance day', async () => {
    const controller = new AsistenciaController(
      {} as never, { capture: async () => ({}) } as never, {} as never, { wake() {} },
    );
    await expect(controller.guardar({
      id: 'request-1',
      body: {
        ClientRecordId: '947699_2026-07-27',
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

  it('does not create a UAT job when Attendance Service marks a demo capture as SKIPPED', async () => {
    const submit = vi.fn(async () => ({ id: 'unexpected' }));
    const wake = vi.fn();
    const controller = new AsistenciaController(
      {} as never,
      { capture: async () => ({ data: {
        attendanceSessionId: 'attendance-demo', externalGroupId: '947699', date: '2026-08-02',
        entriesCount: 1, uploadStatus: 'SKIPPED', duplicate: false, version: 1,
      } }) } as never,
      { submit } as never,
      { wake },
    );

    await controller.guardar({
      id: 'request-demo',
      body: {
        ClientRecordId: '947699_2026-08-02', Id_Grupo: 947699, Fec_Ini: '27/07/2026',
        Asistencia: [{ id_alumno: 515722, num_pase_lista: 1, num_dia: 7, sn_asistencia: true }],
      },
      uatSession: {
        username: 'profesor@uat.edu.mx', credentialCipher: 'encrypted', login: { parametros: {} },
      },
    } as never);

    expect(submit).not.toHaveBeenCalled();
    expect(wake).not.toHaveBeenCalled();
  });

  it('keeps App Review attendance out of Attendance Service and the durable upload queue', async () => {
    const guardarAsistenciasPorSesion = vi.fn(async () => ({ exito: true }));
    const capture = vi.fn(async () => ({}));
    const submit = vi.fn(async () => ({}));
    const wake = vi.fn();
    const controller = new AsistenciaController(
      { guardarAsistenciasPorSesion } as never,
      { capture } as never,
      { submit } as never,
      { wake },
    );

    const response = await controller.guardar({
      id: 'request-review',
      body: {
        ClientRecordId: '999901_2026-09-02', Id_Grupo: 999901, Fec_Ini: '31/08/2026',
        Asistencia: [{ id_alumno: 999902, num_pase_lista: 1, num_dia: 3, sn_asistencia: true }],
      },
      uatSession: {
        id: 'session-review', source: 'APP_REVIEW', username: 'appreview.profesor@uat.edu.mx',
        credentialCipher: 'encrypted', login: { parametros: { Id_Plantilla_AdmonUAT: '999900' } },
      },
    } as never);

    expect(guardarAsistenciasPorSesion).toHaveBeenCalledWith('session-review', {
      Id_Grupo: 999901,
      Fec_Ini: '31/08/2026',
      Asistencia: JSON.stringify([{ id_alumno: 999902, num_pase_lista: 1, num_dia: 3, sn_asistencia: true }]),
    });
    expect(response).toMatchObject({ data: { uploadStatus: 'SKIPPED' }, reviewOnly: true });
    expect(capture).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(wake).not.toHaveBeenCalled();
  });

  it('rejects the removed monolith-only debug payload instead of uploading it to UAT', async () => {
    const capture = vi.fn(async () => ({}));
    const controller = new AsistenciaController({} as never, { capture } as never, {} as never, { wake() {} });

    await expect(controller.guardar({
      id: 'request-debug',
      body: {
        ClientRecordId: '947699_2026-07-27',
        Id_Grupo: 947699,
        Fec_Ini: '27/07/2026',
        Asistencia: [{ id_alumno: 515722, num_pase_lista: 1, num_dia: 1, sn_asistencia: true }],
        DebugReportOnly: true,
      },
      uatSession: {
        id: '74b29734-65a8-48b2-9e6e-8cd01f1a0016', username: 'profesor@uat.edu.mx', login: { parametros: {} },
      },
    } as never)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(capture).not.toHaveBeenCalled();
  });

  it('rejects client-authored professor timestamps so presence only comes from the verified channel', async () => {
    const capture = vi.fn(async () => ({}));
    const controller = new AsistenciaController({} as never, { capture } as never, {} as never, { wake() {} });

    await expect(controller.guardar({
      id: 'request-forged-presence',
      body: {
        ClientRecordId: '947699_2026-08-02',
        Id_Grupo: 947699,
        Fec_Ini: '27/07/2026',
        Asistencia: [{ id_alumno: 515722, num_pase_lista: 1, num_dia: 7, sn_asistencia: true }],
        ProfessorEntryAt: '2026-08-02T08:00:00.000Z',
        ProfessorExitAt: '2026-08-02T09:00:00.000Z',
      },
      uatSession: {
        id: '74b29734-65a8-48b2-9e6e-8cd01f1a0016', username: 'profesor@uat.edu.mx', login: { parametros: {} },
      },
    } as never)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(capture).not.toHaveBeenCalled();
  });
});
