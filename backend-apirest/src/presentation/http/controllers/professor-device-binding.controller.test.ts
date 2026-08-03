import { describe, expect, it } from 'vitest';
import { ProfessorDeviceBindingController } from './professor-device-binding.controller.js';

describe('ProfessorDeviceBindingController', () => {
  it('derives professor identity from the authenticated UAT session', async () => {
    let received: unknown;
    const controller = new ProfessorDeviceBindingController({
      resolveStudentDeviceBindings: async (input: unknown) => {
        received = input;
        return { data: [], missing: ['2251330007'] };
      },
    } as never);
    await expect(controller.resolve({
      body: { matriculas: ['2251330007'] },
      uatSession: {
        username: 'profesor@uat.edu.mx',
        login: { parametros: { Id_Plantilla_AdmonUAT: '308127' } },
      },
    } as never)).resolves.toEqual({ data: [], missing: ['2251330007'] });
    expect(received).toEqual({ professorExternalId: '308127', matriculas: ['2251330007'] });
  });

  it('fails closed when Attendance Service is not configured', async () => {
    const controller = new ProfessorDeviceBindingController(undefined);
    await expect(controller.resolve({
      body: { matriculas: ['2251330007'] },
      uatSession: { username: 'profesor@uat.edu.mx', login: { parametros: {} } },
    } as never)).rejects.toMatchObject({ statusCode: 503, code: 'ATTENDANCE_SERVICE_REQUIRED' });
  });
});
