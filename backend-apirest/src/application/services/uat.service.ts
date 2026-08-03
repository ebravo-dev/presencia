import { randomUUID } from 'node:crypto';
import { ApiError, UatSessionNotFoundError } from '../../errors/api-error.js';
import type { IUatSessionRepository } from '../../domain/repositories/session-store.repository.js';
import type {
  JsonRecord,
  StoredUatSession,
  UatCampusItem,
  UatCicloEscolarItem,
  UatCredentials,
  UatDataResponse,
  UatDesItem,
  UatExamenItem,
  UatAsistenciaAlumnoInput,
  UatAsistenciaGrupoParams,
  UatAsistenciaGrupoResponse,
  UatGuardaAsistenciasResponse,
  UatHorarioItem,
  UatLoginResponse,
  UatNivelEducativoItem,
  UatObjectResponse,
  UatProfesorGrupoItem,
  UatProfesorGruposParams,
  UatProfesorConsultaParams,
  UatSafeLogin,
  UatSemanaItem,
  UatSemanasGrupoParams,
  UatSessionResponse,
  UatSnapshotResponse,
} from '../../domain/types/uat.interfaces.js';
import type { UatClientFactory } from '../../infrastructure/http/client/uat-client.factory.js';
import type { CredentialCipher } from '../../infrastructure/security/credential-cipher.js';
import type { IdentityServiceClient } from '../../infrastructure/http/client/identity-service.client.js';

export class UatService {
  constructor(
    private readonly sessionRepository: IUatSessionRepository,
    private readonly clientFactory: UatClientFactory,
    private readonly credentialCipher: CredentialCipher,
    private readonly identityService: IdentityServiceClient,
  ) {}

  async createSession(credentials: UatCredentials, context: { correlationId?: string } = {}): Promise<StoredUatSession> {
    const client = this.clientFactory.create();
    const login = await client.authenticate(credentials);
    const plantillaId = login.parametros?.Id_Plantilla_AdmonUAT?.trim();
    const institutionalCode = login.parametros?.Cve_Usuario_AdmonUAT?.trim();
    const identitySession = await this.identityService.createAuthenticatedSession({
      kind: 'PROFESSOR',
      role: 'PROFESSOR',
      institutionalIdentifier: plantillaId || institutionalCode || credentials.username.trim().toLowerCase(),
      ...(credentials.username.includes('@') ? { email: credentials.username.trim().toLowerCase() } : {}),
      displayName: login.parametros?.Txt_Usuario_AdmonUAT?.trim() || institutionalCode || credentials.username.trim(),
      source: 'UAT_TEACHER',
      correlationId: context.correlationId ?? randomUUID(),
    });
    const now = new Date();
    const session: StoredUatSession = {
      id: randomUUID(),
      username: credentials.username.trim().toLowerCase(),
      credentialCipher: this.credentialCipher.encrypt(credentials.password),
      client,
      login,
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

  async getSessionOrThrow(sessionId?: string): Promise<StoredUatSession> {
    if (!sessionId) {
      throw new ApiError(401, 'UAT_SESSION_REQUIRED', 'Envia el header X-UAT-Session-Id.');
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

  async toSessionResponse(session: StoredUatSession): Promise<UatSessionResponse> {
    return {
      sessionId: session.id,
      authenticated: true,
      login: this.toSafeLogin(session.login),
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      activeSessions: await this.sessionRepository.size(),
      cookieDiagnostics: session.client.getCookieDiagnostics(),
      ...(session.identitySession ? { identitySession: session.identitySession } : {}),
    };
  }

  async getHorariosPorSesion(
    sessionId: string,
    params: UatProfesorConsultaParams,
  ): Promise<UatDataResponse<UatHorarioItem>> {
    return this.withSession(sessionId, async (session) => {
      const horarios = await session.client.getHorarios(params);
      return this.toUatDataResponse('BuscaHorarios', params, horarios);
    });
  }

  async getExamenesPorSesion(
    sessionId: string,
    params: UatProfesorConsultaParams,
  ): Promise<UatDataResponse<UatExamenItem>> {
    return this.withSession(sessionId, async (session) => {
      const examenes = await session.client.getExamenes(params);
      return this.toUatDataResponse('BuscaExamenes', params, examenes);
    });
  }

  async getNivelesEducativosPorSesion(sessionId: string): Promise<UatDataResponse<UatNivelEducativoItem>> {
    return this.withSession(sessionId, async (session) => {
      const niveles = await session.client.getNivelesEducativos();
      return this.toUatDataResponse('BuscarNivelEducativo', {}, niveles);
    });
  }

  async getCampusPorSesion(sessionId: string, idNivelEducativo: number): Promise<UatDataResponse<UatCampusItem>> {
    return this.withSession(sessionId, async (session) => {
      const campus = await session.client.getCampus(idNivelEducativo);
      return this.toUatDataResponse('BuscarCampus', { id_nivel_educativo: idNivelEducativo }, campus);
    });
  }

  async getDesPorSesion(
    sessionId: string,
    idNivelEducativo: number,
    idCu: number,
  ): Promise<UatDataResponse<UatDesItem>> {
    return this.withSession(sessionId, async (session) => {
      const des = await session.client.getDes(idNivelEducativo, idCu);
      return this.toUatDataResponse('BuscarDES', { id_nivel_educativo: idNivelEducativo, id_cu: idCu }, des);
    });
  }

  async getCiclosEscolaresPorSesion(sessionId: string): Promise<UatDataResponse<UatCicloEscolarItem>> {
    return this.withSession(sessionId, async (session) => {
      const ciclos = await session.client.getCiclosEscolares();
      return this.toUatDataResponse('BuscarCicloEscolar', {}, ciclos);
    });
  }

  async getGruposProfesorPorSesion(
    sessionId: string,
    params: UatProfesorGruposParams,
  ): Promise<UatDataResponse<UatProfesorGrupoItem>> {
    return this.withSession(sessionId, async (session) => {
      const grupos = await session.client.getGruposProfesor(params);
      return this.toUatDataResponse('BuscaGruposProfesor', params, grupos);
    });
  }

  async getSemanasGrupoPorSesion(
    sessionId: string,
    params: UatSemanasGrupoParams,
  ): Promise<UatDataResponse<UatSemanaItem>> {
    return this.withSession(sessionId, async (session) => {
      const semanas = await session.client.getSemanasGrupo(params);
      return this.toUatDataResponse('BuscaSemanas', params, semanas);
    });
  }

  async getAsistenciaGrupoPorSesion(
    sessionId: string,
    params: UatAsistenciaGrupoParams,
  ): Promise<UatObjectResponse<UatAsistenciaGrupoResponse>> {
    return this.withSession(sessionId, async (session) => {
      const asistencia = await session.client.getAsistenciaGrupo(params);
      return this.toUatObjectResponse('BuscaAsistenciaGrupo', params, asistencia);
    });
  }

  async registrarAsistencias(
    sessionId: string,
    idGrupo: number,
    fechaInicio: string,
    asistencias: UatAsistenciaAlumnoInput[],
  ): Promise<UatGuardaAsistenciasResponse> {
    return this.withSession(sessionId, (session) => session.client.guardaAsistencias({
      Id_Grupo: idGrupo,
      Fec_Ini: fechaInicio,
      Asistencia: JSON.stringify(asistencias),
    }));
  }

  private async withSession<TResult>(
    sessionId: string,
    action: (session: StoredUatSession) => Promise<TResult>,
  ): Promise<TResult> {
    const session = await this.getSessionOrThrow(sessionId);
    try {
      return await action(session);
    } finally {
      // UAT may rotate ASP.NET cookies on any request. Persist the updated jar
      // so a subsequent request can be served by another replica.
      await this.sessionRepository.create(session.id, session);
    }
  }

  async getStatelessSnapshot(
    credentials: UatCredentials,
    params: UatProfesorConsultaParams,
    options: { includeExamenes?: boolean } = {},
  ): Promise<UatSnapshotResponse> {
    const includeExamenes = options.includeExamenes ?? true;
    const client = this.clientFactory.create();
    const login = await client.authenticate(credentials);

    const [horarios, examenes] = await Promise.all([
      client.getHorarios(params),
      includeExamenes ? client.getExamenes(params) : Promise.resolve(undefined),
    ]);

    return {
      source: 'UAT',
      authenticated: true,
      login: this.toSafeLogin(login),
      query: params,
      horarios,
      ...(includeExamenes ? { examenes } : {}),
      fetchedAt: new Date().toISOString(),
    };
  }

  private toSafeLogin(login: UatLoginResponse): UatSafeLogin {
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
