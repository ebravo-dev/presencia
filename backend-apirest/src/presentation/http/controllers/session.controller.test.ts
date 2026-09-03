import { describe, expect, it, vi } from 'vitest';
import { TEACHER_AUTHENTICATED_EVENT } from '../../../domain/events/teacher-authenticated.event.js';
import { SessionController } from './session.controller.js';

describe('SessionController.create', () => {
  it('returns review mode without publishing a teacher projection', async () => {
    const session = {
      id: 'session-review', source: 'APP_REVIEW', username: 'appreview.profesor@uat.edu.mx',
      login: { exito: true, parametros: { Id_Plantilla_AdmonUAT: '999900' } },
    };
    const publish = vi.fn(async () => undefined);
    const controller = new SessionController({
      createSession: vi.fn(async () => session),
      toSessionResponse: vi.fn(async () => ({ sessionId: session.id, authenticated: true })),
    } as never, { publish } as never);
    const code = vi.fn().mockReturnThis();
    const send = vi.fn((payload: unknown) => payload);

    const response = await controller.create({
      id: 'request-review',
      body: { username: 'appreview.profesor@uat.edu.mx', password: 'teacher-review-password' },
      log: { info: vi.fn(), error: vi.fn() },
    } as never, { code, send } as never);

    expect(code).toHaveBeenCalledWith(201);
    expect(response).toMatchObject({
      sessionId: 'session-review', demoMode: true,
      demoCapabilities: { simulateRoomBeacon: true },
    });
    expect(publish).not.toHaveBeenCalled();
  });
});

describe('SessionController.sync', () => {
  it('reutiliza la sesion autenticada y encola una nueva cosecha academica', async () => {
    const publish = vi.fn(async () => undefined);
    const controller = new SessionController({} as never, { publish } as never);
    const code = vi.fn().mockReturnThis();
    const send = vi.fn((payload: unknown) => payload);

    const response = await controller.sync(
      {
        id: 'request-42',
        uatSession: {
          id: 'session-42',
          username: 'Profesor@UAT.edu.mx',
          login: {
            parametros: {
              Id_Plantilla_AdmonUAT: '308127',
              Cve_Usuario_AdmonUAT: 'PROF42',
              Txt_Usuario_AdmonUAT: 'Profesora Ejemplo',
            },
          },
        },
      } as never,
      { code, send } as never,
    );

    expect(code).toHaveBeenCalledWith(202);
    expect(response).toEqual({
      accepted: true,
      sessionId: 'session-42',
      message: 'Sincronizacion academica encolada.',
    });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: TEACHER_AUTHENTICATED_EVENT,
        sessionId: 'session-42',
        correlationId: 'request-42',
        causationId: 'request-42',
        aggregateId: '308127',
        teacher: expect.objectContaining({
          externalId: '308127',
          plantillaId: 308127,
          institutionalCode: 'PROF42',
          email: 'profesor@uat.edu.mx',
        }),
      }),
    );
  });

  it('no proyecta la cuenta de App Review hacia Academic ni los dashboards', async () => {
    const publish = vi.fn(async () => undefined);
    const controller = new SessionController({} as never, { publish } as never);
    const code = vi.fn().mockReturnThis();
    const send = vi.fn((payload: unknown) => payload);

    const response = await controller.sync(
      {
        id: 'request-review',
        uatSession: {
          id: 'session-review', source: 'APP_REVIEW', username: 'appreview.profesor@uat.edu.mx',
          login: { parametros: { Id_Plantilla_AdmonUAT: '999900' } },
        },
      } as never,
      { code, send } as never,
    );

    expect(code).toHaveBeenCalledWith(202);
    expect(response).toMatchObject({ accepted: true, sessionId: 'session-review' });
    expect(publish).not.toHaveBeenCalled();
  });
});

describe('SessionController.settings', () => {
  it('expone la tolerancia persistida que deben usar las apps', async () => {
    const controller = new SessionController(
      {} as never,
      {} as never,
      {
        attendanceSettings: async () => ({
          data: {
            teacherAttendanceToleranceMinutes: 18,
            updatedAt: '2026-08-04T12:00:00.000Z',
          },
        }),
      },
    );
    const send = vi.fn((payload: unknown) => payload);

    const response = await controller.settings(
      { log: { warn: vi.fn() } } as never,
      { send } as never,
    );

    expect(response).toEqual({
      data: {
        teacherAttendanceToleranceMinutes: 18,
        updatedAt: '2026-08-04T12:00:00.000Z',
      },
      meta: { generatedAt: expect.any(String) },
    });
  });
});
