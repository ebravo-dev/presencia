import { describe, expect, it } from 'vitest';
import type { AttendanceUploadRequestedEvent } from '../../domain/events/attendance-upload-requested.event.js';
import { ProcessAttendanceUploadRequestedUseCase } from './process-attendance-upload-requested.use-case.js';

describe('ProcessAttendanceUploadRequestedUseCase', () => {
  it('creates a durable UAT job using the encrypted credential owned by UAT Integration', async () => {
    const submissions: unknown[] = [];
    let wakes = 0;
    const useCase = new ProcessAttendanceUploadRequestedUseCase(
      {
        getSessionOrThrow: async () => ({ username: 'profesor@uat.edu.mx', credentialCipher: 'encrypted-owned-by-uat' }),
        getSemanasGrupoPorSesion: async () => ({ data: [{ Fec_Ini: '27/07/2026', Fec_Fin: '02/08/2026' }] }),
      } as never,
      {
        submit: async (input: unknown) => { submissions.push(input); return { id: 'batch-1' }; },
      } as never,
      { wake: () => { wakes += 1; } },
    );

    await expect(useCase.execute(event())).resolves.toEqual({ batchId: 'batch-1', clientRecordId: 'attendance-1:v1' });
    expect(submissions).toEqual([{
      ownerUsername: 'profesor@uat.edu.mx',
      credentialCipher: 'encrypted-owned-by-uat',
      records: [{
        clientRecordId: 'attendance-1:v1', idGrupo: 947699, fechaInicio: '27/07/2026',
        attendances: [{ id_alumno: 515722, num_pase_lista: 1, num_dia: 7, sn_asistencia: true }],
      }],
    }]);
    expect(wakes).toBe(1);
  });
});

function event(): AttendanceUploadRequestedEvent {
  return {
    eventId: '7bdf4fdc-09da-4e37-986f-ee8666456ee8', eventType: 'attendance.upload_requested.v1',
    occurredAt: '2026-08-02T12:00:00.000Z', correlationId: 'request-1', causationId: 'request-1',
    producer: 'attendance-service', aggregateId: 'attendance-1', schemaVersion: 1,
    payload: {
      attendanceSessionId: 'attendance-1', externalGroupId: '947699', uatGroupId: 947699,
      date: '2026-08-02', professorExternalId: 'teacher-1',
      uatSessionId: '6af650f3-6772-4d72-b23b-837390c24701',
      entries: [{ matricula: '2251330007', status: 'PRESENT', uatStudentId: 515722, listNumber: 1 }], version: 1,
    },
  };
}
