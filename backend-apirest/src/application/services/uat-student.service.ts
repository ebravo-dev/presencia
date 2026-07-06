import { randomUUID } from 'node:crypto';
import { ApiError, UatSessionNotFoundError } from '../../errors/api-error.js';
import type { IUatSessionRepository } from '../../domain/repositories/session-store.repository.js';
import type {
  JsonRecord,
  StoredUatStudentSession,
  UatCredentials,
  UatDataResponse,
  UatObjectResponse,
  UatSafeLogin,
  UatStudentCareerItem,
  UatStudentCareerSelection,
  UatStudentFinalGradeItem,
  UatStudentPartialGradeItem,
  UatStudentScheduleItem,
  UatStudentSessionResponse,
} from '../../domain/types/uat.interfaces.js';
import type { UatStudentClientFactory } from '../../infrastructure/http/client/uat-student-client.factory.js';

export interface CreateUatStudentSessionInput extends UatCredentials {
  idPlanEstudio?: number;
}

export class UatStudentService {
  constructor(
    private readonly sessionRepository: IUatSessionRepository<StoredUatStudentSession>,
    private readonly clientFactory: UatStudentClientFactory,
  ) {}

  async createSession(input: CreateUatStudentSessionInput): Promise<StoredUatStudentSession> {
    const client = this.clientFactory.create();
    const login = await client.authenticate(input);
    const careers = await client.getCareers();

    if (careers.length === 0) {
      throw new ApiError(502, 'UAT_STUDENT_CAREERS_EMPTY', 'El portal de alumnos no devolvio carreras para la cuenta.');
    }

    const career = selectCareer(careers, input.idPlanEstudio);
    const selectedCareer = await client.selectCareer(career.Id_Plan_Estudio);
    const now = new Date();
    const session: StoredUatStudentSession = {
      id: randomUUID(),
      username: input.username.trim().toLowerCase(),
      client,
      login,
      careers,
      selectedCareer,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: now,
    };

    await this.sessionRepository.create(session.id, session);
    return session;
  }

  async getSessionOrThrow(sessionId?: string): Promise<StoredUatStudentSession> {
    if (!sessionId) {
      throw new ApiError(401, 'UAT_STUDENT_SESSION_REQUIRED', 'Envia el header X-UAT-Student-Session-Id.');
    }

    const session = await this.sessionRepository.get(sessionId);
    if (!session) {
      throw new UatSessionNotFoundError(sessionId);
    }

    return session;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.sessionRepository.delete(sessionId);
  }

  async getActiveSessionCount(): Promise<number> {
    return this.sessionRepository.size();
  }

  async toSessionResponse(session: StoredUatStudentSession): Promise<UatStudentSessionResponse> {
    return {
      sessionId: session.id,
      authenticated: true,
      login: this.toSafeLogin(session.login),
      careers: session.careers,
      selectedCareer: session.selectedCareer,
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      activeSessions: await this.sessionRepository.size(),
      cookieDiagnostics: session.client.getCookieDiagnostics(),
    };
  }

  async getCareersBySession(sessionId: string): Promise<UatDataResponse<UatStudentCareerItem>> {
    const session = await this.getSessionOrThrow(sessionId);
    const careers = await session.client.getCareers();
    session.careers = careers;
    return this.toUatDataResponse('CarrerasAlumno', {}, careers);
  }

  async selectCareerBySession(
    sessionId: string,
    idPlanEstudio: number,
  ): Promise<UatObjectResponse<UatStudentCareerSelection>> {
    const session = await this.getSessionOrThrow(sessionId);
    const selected = await session.client.selectCareer(idPlanEstudio);
    session.selectedCareer = selected;
    return this.toUatObjectResponse('SeleccionarCarreraAlumno', { Id_Plan_Estudio: idPlanEstudio }, selected);
  }

  async getScheduleBySession(sessionId: string): Promise<UatDataResponse<UatStudentScheduleItem>> {
    const session = await this.getSessionOrThrow(sessionId);
    const schedule = await session.client.getSchedule();
    return this.toUatDataResponse('SpuSelHorarioFichaAlumno', {}, schedule);
  }

  async getPartialGradesBySession(sessionId: string): Promise<UatDataResponse<UatStudentPartialGradeItem>> {
    const session = await this.getSessionOrThrow(sessionId);
    const grades = await session.client.getPartialGrades();
    return this.toUatDataResponse('SPUSELCalificacionesParciales', {}, grades);
  }

  async getFinalGradesBySession(sessionId: string): Promise<UatDataResponse<UatStudentFinalGradeItem>> {
    const session = await this.getSessionOrThrow(sessionId);
    const grades = await session.client.getFinalGrades();
    return this.toUatDataResponse('ConsultaEvaluaciones', {}, grades);
  }

  private toSafeLogin(login: StoredUatStudentSession['login']): UatSafeLogin {
    return {
      exito: login.exito,
      cambiaPass: login.cambiaPass,
      mensaje: login.mensaje,
      parametros: login.parametros,
    };
  }

  private toUatDataResponse<TItem extends JsonRecord>(
    endpoint: string,
    query: JsonRecord,
    data: TItem[],
  ): UatDataResponse<TItem> {
    return {
      source: 'UAT',
      endpoint,
      query,
      data,
      fetchedAt: new Date().toISOString(),
    };
  }

  private toUatObjectResponse<TData extends JsonRecord>(
    endpoint: string,
    query: JsonRecord,
    data: TData,
  ): UatObjectResponse<TData> {
    return {
      source: 'UAT',
      endpoint,
      query,
      data,
      fetchedAt: new Date().toISOString(),
    };
  }
}

function selectCareer(careers: UatStudentCareerItem[], idPlanEstudio?: number): UatStudentCareerItem & { Id_Plan_Estudio: number } {
  const career = idPlanEstudio === undefined
    ? careers[0]
    : careers.find((item) => Number(item.Id_Plan_Estudio) === idPlanEstudio);

  if (!career) {
    throw new ApiError(404, 'UAT_STUDENT_CAREER_NOT_FOUND', 'La carrera solicitada no existe para esta cuenta.', {
      idPlanEstudio,
      availablePlans: careers
        .map((item) => Number(item.Id_Plan_Estudio))
        .filter((value) => Number.isInteger(value) && value > 0),
    });
  }

  const parsedPlan = Number(career.Id_Plan_Estudio);
  if (!Number.isInteger(parsedPlan) || parsedPlan <= 0) {
    throw new ApiError(502, 'UAT_STUDENT_CAREER_INVALID', 'El portal no devolvio Id_Plan_Estudio valido.', {
      career,
    });
  }

  return { ...career, Id_Plan_Estudio: parsedPlan };
}
