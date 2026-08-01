import { describe, expect, it } from 'vitest';
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
import { UatStudentService } from './uat-student.service.js';

describe('UatStudentService', () => {
  it('crea sesion seleccionando la primera carrera cuando no se envia plan', async () => {
    const client = fakeStudentClient();
    const service = new UatStudentService(memoryRepository(), fakeFactory(client));

    const session = await service.createSession({ username: 'ALUMNO@UAT.EDU.MX', password: 'secret' });

    expect(session.username).toBe('alumno@uat.edu.mx');
    expect(client.selectedPlans).toEqual([3313]);
    expect(session.selectedCareer.parametros?.Num_Matricula_AlumnosUAT).toBe(2251330007);
  });

  it('crea sesion seleccionando la carrera solicitada', async () => {
    const client = fakeStudentClient();
    const service = new UatStudentService(memoryRepository(), fakeFactory(client));

    await service.createSession({ username: 'alumno@uat.edu.mx', password: 'secret', idPlanEstudio: 3314 });

    expect(client.selectedPlans).toEqual([3314]);
  });

  it('vincula el celular con la matricula devuelta por UAT cuando recibe UUID', async () => {
    const client = fakeStudentClient();
    const bindings: unknown[] = [];
    const service = new UatStudentService(
      memoryRepository(),
      fakeFactory(client),
      {
        createStudentDeviceBinding: async (input: unknown) => {
          bindings.push(input);
          return { data: { bindingToken: 'signed-binding-token' } };
        },
      } as never,
    );

    const session = await service.createSession({
      username: 'alumno@uat.edu.mx',
      password: 'secret',
      attendanceUuid: '12345678-1234-4234-9234-123456789abc',
      deviceBindingId: '12345678-1234-4234-9234-123456789abd',
      platform: 'android',
    });

    expect(bindings).toEqual([
      {
        matricula: '2251330007',
        attendanceUuid: '12345678-1234-4234-9234-123456789abc',
        deviceBindingId: '12345678-1234-4234-9234-123456789abd',
        platform: 'android',
        deviceInfo: undefined,
      },
    ]);
    expect(session.deviceBindingToken).toBe('signed-binding-token');
  });

  it('rechaza un plan que no pertenece al alumno', async () => {
    const client = fakeStudentClient();
    const service = new UatStudentService(memoryRepository(), fakeFactory(client));

    await expect(
      service.createSession({ username: 'alumno@uat.edu.mx', password: 'secret', idPlanEstudio: 9999 }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'UAT_STUDENT_CAREER_NOT_FOUND',
    });
  });
});

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

function fakeFactory(client: UatStudentPortalClientPort): UatStudentClientFactory {
  return {
    create: () => client,
  } as UatStudentClientFactory;
}

function fakeStudentClient(): UatStudentPortalClientPort & { selectedPlans: number[] } {
  const selectedPlans: number[] = [];
  const careers: UatStudentCareerItem[] = [
    {
      Num_Matricula: 2251330007,
      Id_Plan_Estudio: 3313,
      Id_DES: 12,
      Txt_Programa_Academico: 'INGENIERO EN SISTEMAS COMPUTACIONALES',
      CicloActivo: '2026 - 2 VERANO',
    },
    {
      Num_Matricula: 2251330007,
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
          Num_Matricula_AlumnosUAT: 2251330007,
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
