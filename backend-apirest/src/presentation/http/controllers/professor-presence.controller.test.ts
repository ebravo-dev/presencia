import { describe, expect, it } from 'vitest';
import { ProfessorPresenceController } from './professor-presence.controller.js';

describe('ProfessorPresenceController', () => {
  it('derives the professor identity from the authenticated UAT session and never grants trusted authorization', async () => {
    let received: unknown;
    const controller = new ProfessorPresenceController({
      observeProfessorEntry: async (input: unknown) => {
        received = input;
        return { data: { attendanceSessionId: 'session-1' } };
      },
    } as never);

    await controller.entry({
      id: 'request-1',
      body: { externalGroupId: '947699', beaconUuid: '12345678-1234-4234-9234-123456789abc' },
      uatSession: {
        username: 'profesor@uat.edu.mx', login: { parametros: { Id_Plantilla_AdmonUAT: ' 308127 ' } },
      },
    } as never);

    expect(received).toEqual({
      externalGroupId: '947699', beaconUuid: '12345678-1234-4234-9234-123456789abc',
      professorExternalId: '308127', trustedGroupAuthorization: false, correlationId: 'request-1',
    });
  });

  it('uses the authenticated username only when the UAT professor identifiers are absent', async () => {
    let received: unknown;
    const controller = new ProfessorPresenceController({
      observeProfessorExit: async (input: unknown) => { received = input; return { data: {} }; },
    } as never);

    await controller.exit({
      id: 'request-2', body: { externalGroupId: '947699' },
      uatSession: { username: 'profesor@uat.edu.mx', login: { parametros: {} } },
    } as never);

    expect(received).toMatchObject({
      professorExternalId: 'profesor@uat.edu.mx', trustedGroupAuthorization: false, correlationId: 'request-2',
    });
  });

  it('fails closed when Attendance Service is not configured', async () => {
    const controller = new ProfessorPresenceController(undefined);
    await expect(controller.studentDetections({
      id: 'request-3',
      body: {
        externalGroupId: '947699', detections: [{ beaconUuid: '12345678-1234-4234-9234-123456789abc' }],
      },
      uatSession: { username: 'profesor@uat.edu.mx', login: { parametros: {} } },
    } as never)).rejects.toMatchObject({ statusCode: 503, code: 'ATTENDANCE_SERVICE_REQUIRED' });
  });
});
