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
  UatHorarioItem,
  UatLoginResponse,
  UatNivelEducativoItem,
  UatProfesorConsultaParams,
  UatSafeLogin,
  UatSessionResponse,
  UatSnapshotResponse,
} from '../../domain/types/uat.interfaces.js';
import type { UatClientFactory } from '../../infrastructure/http/client/uat-client.factory.js';

export class UatService {
  constructor(
    private readonly sessionRepository: IUatSessionRepository,
    private readonly clientFactory: UatClientFactory,
  ) {}

  async createSession(credentials: UatCredentials): Promise<StoredUatSession> {
    const client = this.clientFactory.create();
    const login = await client.authenticate(credentials);
    const now = new Date();
    const session: StoredUatSession = {
      id: randomUUID(),
      client,
      login,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: now,
    };

    await this.sessionRepository.create(session.id, session);
    return session;
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
    };
  }

  async getHorariosPorSesion(
    sessionId: string,
    params: UatProfesorConsultaParams,
  ): Promise<UatDataResponse<UatHorarioItem>> {
    const session = await this.getSessionOrThrow(sessionId);
    const horarios = await session.client.getHorarios(params);

    return this.toUatDataResponse('BuscaHorarios', params, horarios);
  }

  async getExamenesPorSesion(
    sessionId: string,
    params: UatProfesorConsultaParams,
  ): Promise<UatDataResponse<UatExamenItem>> {
    const session = await this.getSessionOrThrow(sessionId);
    const examenes = await session.client.getExamenes(params);

    return this.toUatDataResponse('BuscaExamenes', params, examenes);
  }

  async getNivelesEducativosPorSesion(sessionId: string): Promise<UatDataResponse<UatNivelEducativoItem>> {
    const session = await this.getSessionOrThrow(sessionId);
    const niveles = await session.client.getNivelesEducativos();

    return this.toUatDataResponse('BuscarNivelEducativo', {}, niveles);
  }

  async getCampusPorSesion(sessionId: string, idNivelEducativo: number): Promise<UatDataResponse<UatCampusItem>> {
    const session = await this.getSessionOrThrow(sessionId);
    const campus = await session.client.getCampus(idNivelEducativo);

    return this.toUatDataResponse('BuscarCampus', { id_nivel_educativo: idNivelEducativo }, campus);
  }

  async getDesPorSesion(
    sessionId: string,
    idNivelEducativo: number,
    idCu: number,
  ): Promise<UatDataResponse<UatDesItem>> {
    const session = await this.getSessionOrThrow(sessionId);
    const des = await session.client.getDes(idNivelEducativo, idCu);

    return this.toUatDataResponse('BuscarDES', { id_nivel_educativo: idNivelEducativo, id_cu: idCu }, des);
  }

  async getCiclosEscolaresPorSesion(sessionId: string): Promise<UatDataResponse<UatCicloEscolarItem>> {
    const session = await this.getSessionOrThrow(sessionId);
    const ciclos = await session.client.getCiclosEscolares();

    return this.toUatDataResponse('BuscarCicloEscolar', {}, ciclos);
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
}
