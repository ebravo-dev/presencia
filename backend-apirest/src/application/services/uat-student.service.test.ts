import { describe, expect, it, vi } from 'vitest';
import type { IUatSessionRepository } from '../../domain/repositories/session-store.repository.js';
import type {
  StoredUatStudentSession,
  UatCredentials,
  UatLoginResponse,
  UatStudentCareerItem,
  UatStudentCareerSelection,
  UatStudentPortalClientPort,
} from '../../domain/types/uat.interfaces.js';
import type { UatStudentClientFactory } from '../../infrastructure/http/client/uat-student-client.factory.js';
import { UatStudentService, type CreateUatStudentSessionInput } from './uat-student.service.js';

describe('UatStudentService', () => {
  it('crea sesion seleccionando la primera carrera cuando no se envia plan', async () => {
    const client = fakeStudentClient();
    const service = makeService(client);

    const session = await service.createSession(studentLoginInput({ username: 'ALUMNO@UAT.EDU.MX' }));

    expect(session.username).toBe('alumno@uat.edu.mx');
    expect(client.selectedPlans).toEqual([3313]);
    expect(session.selectedCareer.parametros?.Num_Matricula_AlumnosUAT).toBe(9900000001);
  });

  it('crea sesion seleccionando la carrera solicitada', async () => {
    const client = fakeStudentClient();
    const service = makeService(client);

    await service.createSession(studentLoginInput({ idPlanEstudio: 3314 }));

    expect(client.selectedPlans).toEqual([3314]);
  });

  it('vincula el celular con la matricula devuelta por UAT cuando recibe UUID', async () => {
    const client = fakeStudentClient();
    const bindings: unknown[] = [];
    const service = makeService(client, {
      binding: {
        createStudentDeviceBinding: async (input: unknown) => {
          bindings.push(input);
          return { data: { bindingToken: 'signed-binding-token' } };
        },
      } as never,
    });

    const session = await service.createSession({
      username: 'alumno@uat.edu.mx',
      password: 'secret',
      attendanceUuid: '12345678-1234-4234-9234-123456789abc',
      deviceBindingId: '12345678-1234-4234-9234-123456789abd',
      platform: 'android',
    });

    expect(bindings).toEqual([
      {
        matricula: '9900000001',
        attendanceUuid: '12345678-1234-4234-9234-123456789abc',
        deviceBindingId: '12345678-1234-4234-9234-123456789abd',
        platform: 'android',
        deviceInfo: undefined,
      },
    ]);
    expect(session.deviceBindingToken).toBe('signed-binding-token');
  });

  it('falla cerrado si Attendance Service rechaza la vinculacion', async () => {
    const service = makeService(fakeStudentClient(), {
      binding: {
        createStudentDeviceBinding: async () => {
          throw Object.assign(new Error('Attendance unavailable'), {
            statusCode: 503,
            code: 'ATTENDANCE_SERVICE_UNAVAILABLE',
          });
        },
      } as never,
    });
    await expect(service.createSession(studentLoginInput())).rejects.toMatchObject({
      statusCode: 503, code: 'ATTENDANCE_SERVICE_UNAVAILABLE',
    });
  });

  it('rechaza un plan que no pertenece al alumno', async () => {
    const client = fakeStudentClient();
    const service = makeService(client);

    await expect(
      service.createSession(studentLoginInput({ idPlanEstudio: 9999 })),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'UAT_STUDENT_CAREER_NOT_FOUND',
    });
  });

  it('sincroniza perfil y horario seguros sin exponer la sesion UAT', async () => {
    const client = fakeStudentClient();
    client.getSchedule = async () => [{
      Id_Grupo: 947699, Txt_Letra: 'A', Txt_Materia: 'Calculo I', Num_Creditos: 5,
      Txt_Nombre_Profesor: 'Profesor UAT', Txt_Lunes: '07:00 - 08:00',
    }];
    const snapshots: unknown[] = [];
    const service = makeService(client, {
      academic: { publishStudentSnapshot: async (snapshot: unknown) => { snapshots.push(snapshot); } } as never,
    });
    const session = await service.createSession(studentLoginInput());

    await service.getScheduleBySession(session.id, { correlationId: 'request-1' });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      correlationId: 'request-1',
      student: { matricula: '9900000001', email: 'alumno@uat.edu.mx' },
      career: { planExternalId: '3313', coordinationExternalId: '12' },
      cycle: { externalId: '151', name: '2026 - 2 VERANO' },
      schedule: [{ externalGroupId: '947699', subjectName: 'Calculo I', credits: 5 }],
    });
    expect(JSON.stringify(snapshots[0])).not.toMatch(/password|cookie|sessionId/i);
  });

  it('revoca la identidad si Redis no puede conservar la sesion UAT', async () => {
    const revoked: string[] = [];
    const repository = memoryRepository();
    repository.create = async () => { throw new Error('Redis unavailable'); };
    const service = makeService(fakeStudentClient(), {
      repository,
      identity: {
        createAuthenticatedSession: async () => ({
          identityId: 'identity-student-1', sessionId: 'identity-session-1',
          accessToken: 'identity-token-1', expiresAt: '2026-08-03T00:00:00.000Z',
        }),
        revoke: async (token: string) => { revoked.push(token); },
      },
    });

    await expect(service.createSession(studentLoginInput())).rejects.toThrow('Redis unavailable');
    expect(revoked).toEqual(['identity-token-1']);
  });

  it('mantiene la cuenta App Review fuera de Identity, Attendance y Academic', async () => {
    const client = fakeStudentClient();
    const identity = {
      createAuthenticatedSession: vi.fn(async () => { throw new Error('must not be called'); }),
      revoke: vi.fn(async () => undefined),
    };
    const binding = {
      createStudentDeviceBinding: vi.fn(async () => { throw new Error('must not be called'); }),
    };
    const academic = { publishStudentSnapshot: vi.fn(async () => undefined) };
    const service = makeService(client, { identity, binding, academic, source: 'APP_REVIEW' });

    const session = await service.createSession(studentLoginInput({
      username: 'appreview.alumno@alumnos.uat.edu.mx',
    }));
    const response = await service.toSessionResponse(session);
    await service.getScheduleBySession(session.id);

    expect(session.source).toBe('APP_REVIEW');
    expect(response).not.toHaveProperty('identitySession');
    expect(response).not.toHaveProperty('deviceBindingToken');
    expect(identity.createAuthenticatedSession).not.toHaveBeenCalled();
    expect(binding.createStudentDeviceBinding).not.toHaveBeenCalled();
    expect(academic.publishStudentSnapshot).not.toHaveBeenCalled();
  });
});

function studentLoginInput(
  overrides: Partial<CreateUatStudentSessionInput> = {},
): CreateUatStudentSessionInput {
  return {
    username: 'alumno@uat.edu.mx',
    password: 'secret',
    attendanceUuid: '12345678-1234-4234-9234-123456789abc',
    deviceBindingId: '12345678-1234-4234-9234-123456789abd',
    platform: 'android',
    ...overrides,
  };
}

function makeService(
  client: UatStudentPortalClientPort,
  overrides: {
    repository?: IUatSessionRepository<StoredUatStudentSession>;
    binding?: unknown;
    identity?: unknown;
    academic?: unknown;
    source?: 'UAT' | 'APP_REVIEW';
  } = {},
) {
  const binding = overrides.binding ?? {
    createStudentDeviceBinding: async () => ({ data: { bindingToken: 'signed-binding-token' } }),
  };
  const identity = overrides.identity ?? {
    createAuthenticatedSession: async () => ({
      identityId: 'identity-student-1',
      sessionId: 'identity-session-1',
      accessToken: 'identity-token-1',
      expiresAt: '2026-08-03T00:00:00.000Z',
    }),
    revoke: async () => undefined,
  };
  const academic = overrides.academic ?? { publishStudentSnapshot: async () => undefined };
  return new UatStudentService(
    overrides.repository ?? memoryRepository(),
    fakeFactory(client, overrides.source),
    binding as never,
    identity as never,
    academic as never,
  );
}

function memoryRepository(): IUatSessionRepository<StoredUatStudentSession> {
  const sessions = new Map<string, StoredUatStudentSession>();
  return {
    async create(sessionId, session) {
      sessions.set(sessionId, session);
    },
    async get(sessionId) {
      return sessions.get(sessionId) ?? null;
    },
    async delete(sessionId) {
      return sessions.delete(sessionId);
    },
    async size() {
      return sessions.size;
    },
  };
}

function fakeFactory(
  client: UatStudentPortalClientPort,
  source: 'UAT' | 'APP_REVIEW' = 'UAT',
): UatStudentClientFactory {
  return {
    create: () => client,
    createFor: () => ({ client, source }),
  } as unknown as UatStudentClientFactory;
}

function fakeStudentClient(): UatStudentPortalClientPort & { selectedPlans: number[] } {
  const selectedPlans: number[] = [];
  const careers: UatStudentCareerItem[] = [
    {
      Num_Matricula: 9900000001,
      Id_Plan_Estudio: 3313,
      Id_DES: 12,
      Txt_Programa_Academico: 'INGENIERO EN SISTEMAS COMPUTACIONALES',
      CicloActivo: '2026 - 2 VERANO',
    },
    {
      Num_Matricula: 9900000001,
      Id_Plan_Estudio: 3314,
      Id_DES: 12,
      Txt_Programa_Academico: 'INGENIERO EN TECNOLOGIAS',
      CicloActivo: '2026 - 2 VERANO',
    },
  ];

  return {
    selectedPlans,
    async authenticate(_credentials: UatCredentials): Promise<UatLoginResponse> {
      return { exito: true, cambiaPass: false, mensaje: 'Acceso correcto', parametros: {} };
    },
    async getCareers() {
      return careers;
    },
    async selectCareer(idPlanEstudio: number): Promise<UatStudentCareerSelection> {
      selectedPlans.push(idPlanEstudio);
      return {
        exito: true,
        parametros: {
          Id_Alumno_AlumnosUAT: 515722,
          Num_Matricula_AlumnosUAT: 9900000001,
          Id_Plan_Estudio_AlumnosUAT: idPlanEstudio,
          Id_Ciclo_Escolar_Activo_AlumnosUAT: 151,
          Id_DES_AlumnosUAT: 12,
        },
      };
    },
    async getSchedule() {
      return [];
    },
    async getPartialGrades() {
      return [];
    },
    async getFinalGrades() {
      return [];
    },
    getCookieDiagnostics() {
      return { cookieNames: ['ASP.NET_SessionId', '.ASPXAUTH'], hasSessionCookie: true, hasAuthCookie: true };
    },
  };
}
