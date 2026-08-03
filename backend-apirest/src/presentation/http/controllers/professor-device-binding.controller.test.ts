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

  it('derives professor identity for classroom beacon resolution', async () => {
    let received: unknown;
    const controller = new ProfessorDeviceBindingController({
      resolveClassroomBeacons: async (input: unknown) => { received = input; return { data: [], missing: [] }; },
    } as never);
    await controller.resolveBeacons({
      body: { classrooms: ['AULA 101'] },
      uatSession: {
        username: 'profesor@uat.edu.mx', login: { parametros: { Cve_Usuario_AdmonUAT: 'PROF-42' } },
      },
    } as never);
    expect(received).toEqual({
      professorExternalId: 'PROF-42', professorEmail: 'profesor@uat.edu.mx', classrooms: ['AULA 101'],
    });
  });

  it('uses Attendance Service for substitute-class authorization when only the username is available', async () => {
    let received: unknown;
    const controller = new ProfessorDeviceBindingController({
      resolveClassroomBeacons: async (input: unknown) => { received = input; return { data: [], missing: [] }; },
    } as never);
    await controller.resolveBeacons({
      body: { classrooms: ['AULA SUSTITUCIÓN'] },
      uatSession: { username: 'Profesor@UAT.edu.mx', login: { parametros: {} } },
    } as never);
    expect(received).toEqual({
      professorExternalId: 'Profesor@UAT.edu.mx', professorEmail: 'Profesor@UAT.edu.mx',
      classrooms: ['AULA SUSTITUCIÓN'],
    });
  });
});
