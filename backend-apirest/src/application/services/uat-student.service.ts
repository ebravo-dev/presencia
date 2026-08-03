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
import type { AttendanceBindingClient } from '../ports/attendance-binding.client.js';
import type { IdentityServiceClient } from '../../infrastructure/http/client/identity-service.client.js';
import type {
  StudentAcademicSnapshotInput,
  StudentAcademicSnapshotPublisher,
} from '../ports/academic-snapshot.publisher.js';
import { mapWeeklySchedule } from '../mappers/uat-teacher-data.mapper.js';
import type { UatHorarioItem } from '../../domain/types/uat.interfaces.js';

export interface StudentAcademicSyncLogger {
  warn(bindings: object, message: string): void;
}

export interface CreateUatStudentSessionInput extends UatCredentials {
  idPlanEstudio?: number;
  attendanceUuid: string;
  deviceBindingId: string;
  platform: 'android' | 'ios';
  deviceInfo?: string;
}

export class UatStudentService {
  constructor(
    private readonly sessionRepository: IUatSessionRepository<StoredUatStudentSession>,
    private readonly clientFactory: UatStudentClientFactory,
    private readonly attendanceBindingClient: AttendanceBindingClient,
    private readonly identityService: IdentityServiceClient,
    private readonly academicSnapshotPublisher: StudentAcademicSnapshotPublisher,
    private readonly logger?: StudentAcademicSyncLogger,
  ) {}

  async createSession(
    input: CreateUatStudentSessionInput,
    context: { correlationId?: string } = {},
  ): Promise<StoredUatStudentSession> {
    const client = this.clientFactory.create();
    const login = await client.authenticate(input);
    const careers = await client.getCareers();

    if (careers.length === 0) {
      throw new ApiError(502, 'UAT_STUDENT_CAREERS_EMPTY', 'El portal de alumnos no devolvio carreras para la cuenta.');
    }

    const career = selectCareer(careers, input.idPlanEstudio);
    const selectedCareer = await client.selectCareer(career.Id_Plan_Estudio);
    const matricula = readStudentMatricula(selectedCareer, career);
    if (!matricula) {
      throw new ApiError(502, 'UAT_STUDENT_MATRICULA_MISSING', 'El portal de alumnos no devolvio matricula para crear la identidad.');
    }
    const identitySession = await this.identityService.createAuthenticatedSession({
      kind: 'STUDENT',
      role: 'STUDENT',
      institutionalIdentifier: matricula,
      ...(input.username.includes('@') ? { email: input.username.trim().toLowerCase() } : {}),
      displayName: input.username.trim(),
      source: 'UAT_STUDENT',
      correlationId: context.correlationId ?? randomUUID(),
      deviceId: input.deviceBindingId,
    });
    let deviceBindingToken: string;
    try {
      deviceBindingToken = await this.bindStudentDevice(input, selectedCareer, career);
    } catch (error) {
      if (identitySession) {
        await this.identityService.revoke(identitySession.accessToken).catch(() => undefined);
      }
      throw error;
    }
    const now = new Date();
    const session: StoredUatStudentSession = {
      id: randomUUID(),
      username: input.username.trim().toLowerCase(),
      client,
      login,
      careers,
      selectedCareer,
      deviceBindingToken,
      identitySession,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: now,
    };

    try {
      await this.sessionRepository.create(session.id, session);
      return session;
    } catch (error) {
      await this.identityService.revoke(identitySession.accessToken).catch(() => undefined);
      throw error;
    }
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
    const session = await this.sessionRepository.get(sessionId);
    if (session?.identitySession) {
      await this.identityService.revoke(session.identitySession.accessToken);
    }
    return this.sessionRepository.delete(sessionId);
  }

  async getActiveSessionCount(): Promise<number> {
    return this.sessionRepository.size();
  }

  async toSessionResponse(session: StoredUatStudentSession): Promise<UatStudentSessionResponse> {
    if (!session.deviceBindingToken || !session.identitySession) {
      throw new ApiError(
        503,
        'UAT_STUDENT_SESSION_INCOMPLETE',
        'La sesión estudiantil no tiene identidad y vínculo de dispositivo completos.',
      );
    }
    return {
      sessionId: session.id,
      authenticated: true,
      login: this.toSafeLogin(session.login),
      careers: session.careers,
      selectedCareer: session.selectedCareer,
      deviceBindingToken: session.deviceBindingToken,
      identitySession: session.identitySession,
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      activeSessions: await this.sessionRepository.size(),
      cookieDiagnostics: session.client.getCookieDiagnostics(),
    };
  }

  async getCareersBySession(sessionId: string): Promise<UatDataResponse<UatStudentCareerItem>> {
    return this.withSession(sessionId, async (session) => {
      const careers = await session.client.getCareers();
      session.careers = careers;
      return this.toUatDataResponse('CarrerasAlumno', {}, careers);
    });
  }

  async selectCareerBySession(
    sessionId: string,
    idPlanEstudio: number,
  ): Promise<UatObjectResponse<UatStudentCareerSelection>> {
    return this.withSession(sessionId, async (session) => {
      const selected = await session.client.selectCareer(idPlanEstudio);
      session.selectedCareer = selected;
      return this.toUatObjectResponse('SeleccionarCarreraAlumno', { Id_Plan_Estudio: idPlanEstudio }, selected);
    });
  }

  async getScheduleBySession(
    sessionId: string,
    context: { correlationId?: string } = {},
  ): Promise<UatDataResponse<UatStudentScheduleItem>> {
    return this.withSession(sessionId, async (session) => {
      const schedule = await session.client.getSchedule();
      await this.syncStudentAcademicSnapshot(session, schedule, context.correlationId ?? randomUUID());
      return this.toUatDataResponse('SpuSelHorarioFichaAlumno', {}, schedule);
    });
  }

  async getPartialGradesBySession(sessionId: string): Promise<UatDataResponse<UatStudentPartialGradeItem>> {
    return this.withSession(sessionId, async (session) => {
      const grades = await session.client.getPartialGrades();
      return this.toUatDataResponse('SPUSELCalificacionesParciales', {}, grades);
    });
  }

  async getFinalGradesBySession(sessionId: string): Promise<UatDataResponse<UatStudentFinalGradeItem>> {
    return this.withSession(sessionId, async (session) => {
      const grades = await session.client.getFinalGrades();
      return this.toUatDataResponse('ConsultaEvaluaciones', {}, grades);
    });
  }

  private async withSession<TResult>(
    sessionId: string,
    action: (session: StoredUatStudentSession) => Promise<TResult>,
  ): Promise<TResult> {
    const session = await this.getSessionOrThrow(sessionId);
    try {
      return await action(session);
    } finally {
      await this.sessionRepository.create(session.id, session);
    }
  }

  private toSafeLogin(login: StoredUatStudentSession['login']): UatSafeLogin {
    return {
      exito: login.exito,
      cambiaPass: login.cambiaPass,
      mensaje: login.mensaje,
      parametros: login.parametros,
    };
  }

  private async bindStudentDevice(
    input: CreateUatStudentSessionInput,
    selectedCareer: UatStudentCareerSelection,
    fallbackCareer: UatStudentCareerItem,
  ): Promise<string> {
    const matricula = readStudentMatricula(selectedCareer, fallbackCareer);
    if (!matricula) {
      throw new ApiError(502, 'UAT_STUDENT_MATRICULA_MISSING', 'El portal de alumnos no devolvio matricula para vincular el celular.', {
        selectedCareer,
        fallbackCareer,
      });
    }

    const response = await this.attendanceBindingClient.createStudentDeviceBinding({
      matricula,
      attendanceUuid: input.attendanceUuid,
      deviceBindingId: input.deviceBindingId,
      platform: input.platform,
      deviceInfo: input.deviceInfo,
    });
    const token = response.data?.bindingToken;
    if (!token) {
      throw new ApiError(502, 'STUDENT_BINDING_TOKEN_MISSING', 'El backend de asistencia no devolvio la autorizacion del celular.');
    }
    return token;
  }

  private async syncStudentAcademicSnapshot(
    session: StoredUatStudentSession,
    schedule: UatStudentScheduleItem[],
    correlationId: string,
  ): Promise<void> {
    const career = currentCareer(session.selectedCareer, session.careers);
    const matricula = readStudentMatricula(session.selectedCareer, career);
    if (!matricula) return;
    const snapshot = toStudentAcademicSnapshot(session, career, schedule, matricula, correlationId);
    try {
      await this.academicSnapshotPublisher.publishStudentSnapshot(snapshot);
    } catch (error) {
      this.logger?.warn({
        matricula,
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'El horario UAT se devolvio, pero no pudo persistirse en Academic Service.');
    }
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

function toStudentAcademicSnapshot(
  session: StoredUatStudentSession,
  career: UatStudentCareerItem & { Id_Plan_Estudio: number },
  schedule: UatStudentScheduleItem[],
  matricula: string,
  correlationId: string,
): StudentAcademicSnapshotInput {
  const selected = session.selectedCareer.parametros;
  const cycleExternalId = readValue(selected, ['Id_Ciclo_Escolar_Activo_AlumnosUAT', 'Id_Ciclo_Escolar'])
    ?? readValue(career, ['Id_Ciclo_Escolar', 'CicloActivo'])
    ?? 'unknown';
  const cycleName = readValue(career, ['CicloActivo', 'Ciclo', 'Txt_Ciclo_Escolar']) ?? cycleExternalId;
  const displayName = readValue(session.login.parametros, [
    'Txt_Nombre_Alumno', 'Txt_Alumno', 'Txt_Usuario_AlumnosUAT', 'Txt_Usuario',
  ]) ?? session.username;
  const planExternalId = readValue(selected, ['Id_Plan_Estudio_AlumnosUAT', 'Id_Plan_Estudio'])
    ?? String(career.Id_Plan_Estudio);
  const synchronizedAt = new Date().toISOString();

  return {
    snapshotId: randomUUID(),
    correlationId,
    causationId: correlationId,
    synchronizedAt,
    student: {
      matricula,
      displayName,
      ...(session.username.includes('@') ? { email: session.username } : {}),
    },
    career: {
      planExternalId,
      name: readValue(career, ['Txt_Programa_Academico', 'Programa_Academico']) ?? `Plan ${planExternalId}`,
      coordinationExternalId: readValue(selected, ['Id_DES_AlumnosUAT', 'Id_DES']) ?? readValue(career, ['Id_DES']),
    },
    cycle: { externalId: cycleExternalId, name: cycleName },
    schedule: schedule.flatMap((item) => {
      const externalGroupId = readValue(item, ['Id_Grupo', 'id_grupo']);
      if (!externalGroupId) return [];
      const creditsValue = Number(item.Num_Creditos);
      return [{
        externalGroupId,
        groupLetter: readValue(item, ['Txt_Letra', 'Grupo']) ?? '',
        subjectName: readValue(item, ['Txt_Materia', 'Materia']) ?? `Grupo ${externalGroupId}`,
        professorName: readValue(item, ['Txt_Nombre_Profesor', 'Profesor']),
        classroom: readValue(item, ['Txt_Espacio_Fisico', 'Aula']),
        period: readValue(item, ['Num_Periodo', 'Periodo']),
        credits: Number.isInteger(creditsValue) && creditsValue >= 0 ? creditsValue : null,
        schedule: Object.fromEntries(Object.entries(mapWeeklySchedule(item as UatHorarioItem))),
      }];
    }),
  };
}

function currentCareer(
  selected: UatStudentCareerSelection,
  careers: UatStudentCareerItem[],
): UatStudentCareerItem & { Id_Plan_Estudio: number } {
  const selectedPlan = Number(selected.parametros?.Id_Plan_Estudio_AlumnosUAT ?? selected.parametros?.Id_Plan_Estudio);
  return selectCareer(careers, Number.isInteger(selectedPlan) && selectedPlan > 0 ? selectedPlan : undefined);
}

function readValue(record: JsonRecord | undefined, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return null;
}

function readStudentMatricula(selectedCareer: UatStudentCareerSelection, fallbackCareer: UatStudentCareerItem): string | null {
  const candidates = [
    selectedCareer.parametros?.Num_Matricula_AlumnosUAT,
    selectedCareer.parametros?.Num_Matricula,
    selectedCareer.Num_Matricula,
    fallbackCareer.Num_Matricula,
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const value = String(candidate).trim().toUpperCase();
    if (value.length > 0) return value;
  }

  return null;
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
