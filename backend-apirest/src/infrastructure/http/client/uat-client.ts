import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import type { CookieJar } from 'tough-cookie';
import { env } from '../../../config/env.js';
import { UatLoginError, UatPortalError, UatSessionExpiredError } from '../../../errors/api-error.js';
import type {
  JsonRecord,
  JsonValue,
  UatCampusItem,
  UatCicloEscolarItem,
  UatCredentials,
  UatDesItem,
  UatExamenItem,
  UatAsistenciaAlumnoItem,
  UatAsistenciaGrupoParams,
  UatAsistenciaGrupoResponse,
  UatGuardaAsistenciasPayload,
  UatGuardaAsistenciasResponse,
  UatHorarioItem,
  UatLoginResponse,
  UatNivelEducativoItem,
  UatPortalClientPort,
  UatProfesorGrupoItem,
  UatProfesorGruposParams,
  UatProfesorConsultaParams,
  UatSemanaItem,
  UatSemanasGrupoParams,
} from '../../../domain/types/uat.interfaces.js';

type FormValue = string | number | boolean;
type AxiosCookieJarConfig = AxiosRequestConfig & { jar: CookieJar };

export class UatPortalClient implements UatPortalClientPort {
  private readonly baseUrl: string;
  private readonly jar: CookieJar;
  private readonly http: AxiosInstance;

  constructor(options: { baseUrl?: string; timeoutMs?: number; jar: CookieJar }) {
    this.baseUrl = (options.baseUrl ?? env.UAT_BASE_URL).replace(/\/+$/, '');
    this.jar = options.jar;
    this.http = wrapper(
      axios.create({
        baseURL: this.baseUrl,
        timeout: options.timeoutMs ?? env.UAT_HTTP_TIMEOUT_MS,
        withCredentials: true,
        maxRedirects: 5,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
        },
      }),
    );
  }

  async authenticate(credentials: UatCredentials): Promise<UatLoginResponse> {
    try {
      await this.http.get('/Login', {
        ...this.withJar(),
        responseType: 'text',
        headers: this.htmlHeaders(),
      });
      const initialCookieNames = this.cookieNames();

      const loginForm = this.toForm({
        txtUsuario: credentials.username,
        txtContrasenia: credentials.password,
        Codigo: '',
      });

      const login = await this.requestJson<UatLoginResponse>(
        () =>
          this.http.post('/Login/Accesar_Dominio', loginForm, {
            ...this.withJar(),
            headers: {
              ...this.ajaxHeaders(`${this.baseUrl}/Login`),
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            },
          }),
        'POST /Login/Accesar_Dominio',
      );

      if (!login.exito) {
        throw new UatLoginError(login.mensaje ?? 'Credenciales rechazadas por el portal UAT.', login);
      }

      if (!this.hasCookie('.ASPXAUTH')) {
        throw new UatPortalError('El portal reporto login exitoso, pero no entrego la cookie .ASPXAUTH.', {
          initialCookieNames,
          cookies: this.cookieNames(),
          login,
        });
      }

      await this.http.get('/Login/Validar', {
        ...this.withJar(),
        responseType: 'text',
        headers: this.htmlHeaders(`${this.baseUrl}/Login`),
      });

      return login;
    } catch (error) {
      if (error instanceof UatLoginError || error instanceof UatPortalError || error instanceof UatSessionExpiredError) {
        throw error;
      }

      throw this.toPortalError(error, 'No fue posible autenticar contra el portal UAT.');
    }
  }

  async getHorarios(params: UatProfesorConsultaParams): Promise<UatHorarioItem[]> {
    return this.getJsonList<UatHorarioItem>(
      '/Profesor/Consultas/BuscaHorarios',
      params,
      'GET /Profesor/Consultas/BuscaHorarios',
    );
  }

  async getExamenes(params: UatProfesorConsultaParams): Promise<UatExamenItem[]> {
    return this.getJsonList<UatExamenItem>(
      '/Profesor/Consultas/BuscaExamenes',
      params,
      'GET /Profesor/Consultas/BuscaExamenes',
    );
  }

  async getNivelesEducativos(): Promise<UatNivelEducativoItem[]> {
    return this.postFormList<UatNivelEducativoItem>(
      '/Genericos/BuscarNivelEducativo',
      {
        sn_solo_titulares: 'true',
        profesor: 'true',
        tipo: '1',
      },
      'POST /Genericos/BuscarNivelEducativo',
    );
  }

  async getCampus(idNivelEducativo: number): Promise<UatCampusItem[]> {
    return this.postFormList<UatCampusItem>(
      '/Genericos/BuscarCampus',
      {
        sn_solo_titulares: 'true',
        profesor: 'true',
        tipo: '1',
        id_nivel_educativo: idNivelEducativo,
      },
      'POST /Genericos/BuscarCampus',
    );
  }

  async getDes(idNivelEducativo: number, idCu: number): Promise<UatDesItem[]> {
    return this.postFormList<UatDesItem>(
      '/Genericos/BuscarDES',
      {
        sn_solo_titulares: 'true',
        profesor: 'true',
        tipoConsulta: '0',
        tipo: '1',
        id_nivel_educativo: idNivelEducativo,
        id_cu: idCu,
      },
      'POST /Genericos/BuscarDES',
    );
  }

  async getCiclosEscolares(): Promise<UatCicloEscolarItem[]> {
    return this.postFormList<UatCicloEscolarItem>(
      '/Genericos/BuscarCicloEscolar',
      {
        todos: 'false',
        tipo: '7',
        Id_Ciclo_Escolar: '0',
        Id_Plan_Estudio: '0',
        id_tipo_calendario_escolar: '0',
      },
      'POST /Genericos/BuscarCicloEscolar',
    );
  }

  async getGruposProfesor(params: UatProfesorGruposParams): Promise<UatProfesorGrupoItem[]> {
    const grupos = await this.getJsonList<UatProfesorGrupoItem>(
      '/Profesor/ControlAsistencia/BuscaGruposProfesor',
      params,
      'GET /Profesor/ControlAsistencia/BuscaGruposProfesor',
      `${this.baseUrl}/Profesor/ControlAsistencia/Index`,
    );

    return grupos.map((grupo) => this.normalizeProfesorGrupo(grupo));
  }

  async getSemanasGrupo(params: UatSemanasGrupoParams): Promise<UatSemanaItem[]> {
    const semanas = await this.getJsonList<UatSemanaItem>(
      '/Profesor/ControlAsistencia/BuscaSemanas',
      params,
      'GET /Profesor/ControlAsistencia/BuscaSemanas',
      `${this.baseUrl}/Profesor/ControlAsistencia/Index`,
    );

    return semanas.map((semana) => this.normalizeSemana(semana));
  }

  async getAsistenciaGrupo(params: UatAsistenciaGrupoParams): Promise<UatAsistenciaGrupoResponse> {
    const asistencia = await this.getJsonObject<UatAsistenciaGrupoResponse>(
      '/Profesor/ControlAsistencia/BuscaAsistenciaGrupo',
      params,
      'GET /Profesor/ControlAsistencia/BuscaAsistenciaGrupo',
      `${this.baseUrl}/Profesor/ControlAsistencia/Index`,
    );

    return this.normalizeAsistenciaGrupo(asistencia);
  }

  async guardaAsistencias(payload: UatGuardaAsistenciasPayload): Promise<UatGuardaAsistenciasResponse> {
    return this.requestJson<UatGuardaAsistenciasResponse>(
      () =>
        this.http.post('/Profesor/ControlAsistencia/GuardaAsistencias', this.toForm({
          Id_Grupo: payload.Id_Grupo,
          Fec_Ini: payload.Fec_Ini,
          Asistencia: payload.Asistencia,
        }), {
          ...this.withJar(),
          headers: {
            ...this.ajaxHeaders(`${this.baseUrl}/Profesor/ControlAsistencia/Index`),
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          },
        }),
      'POST /Profesor/ControlAsistencia/GuardaAsistencias',
    );
  }

  getCookieDiagnostics() {
    return {
      cookieNames: this.cookieNames(),
      hasSessionCookie: this.hasCookie('ASP.NET_SessionId'),
      hasAuthCookie: this.hasCookie('.ASPXAUTH'),
    };
  }

  private normalizeProfesorGrupo(grupo: UatProfesorGrupoItem): UatProfesorGrupoItem {
    const idGrupo = this.readNumber(grupo, ['Id_Grupo', 'id_grupo', 'idGrupo']);
    const materia = this.readString(grupo, ['Txt_Materia', 'txt_materia', 'Materia']);
    const letra = this.readString(grupo, ['Txt_Letra', 'txt_letra', 'Grupo']);
    const ciclo = this.readString(grupo, ['Ciclo', 'Txt_Ciclo_Escolar', 'ciclo']);
    const idDes = this.readNumber(grupo, ['Id_DES', 'Id_Des', 'id_des']);
    const idCiclo = this.readNumber(grupo, ['Id_Ciclo_Escolar', 'Id_Ciclo', 'id_ciclo']);

    return {
      ...grupo,
      ...(idGrupo !== undefined ? { Id_Grupo: idGrupo, id_grupo: idGrupo, idGrupo } : {}),
      ...(materia !== undefined ? { Txt_Materia: materia, txt_materia: materia, Materia: materia } : {}),
      ...(letra !== undefined ? { Txt_Letra: letra, txt_letra: letra, Grupo: letra } : {}),
      ...(ciclo !== undefined ? { Ciclo: ciclo, Txt_Ciclo_Escolar: ciclo } : {}),
      ...(idDes !== undefined ? { Id_DES: idDes, Id_Des: idDes, id_des: idDes } : {}),
      ...(idCiclo !== undefined ? { Id_Ciclo_Escolar: idCiclo, Id_Ciclo: idCiclo, id_ciclo: idCiclo } : {}),
    };
  }

  private normalizeSemana(semana: UatSemanaItem): UatSemanaItem {
    const idGrupo = this.readNumber(semana, ['Id_Grupo', 'id_grupo', 'idGrupo']);
    const fecIni = this.readString(semana, ['Fec_Ini', 'fec_ini', 'FecIni', 'Fec_Inicio']);
    const fecFin = this.readString(semana, ['Fec_Fin', 'fec_fin', 'FecFin', 'Fec_Termino']);
    const numSemana = this.readNumber(semana, ['Semana', 'Num_Semana', 'num_semana']);

    return {
      ...semana,
      ...(idGrupo !== undefined ? { Id_Grupo: idGrupo, id_grupo: idGrupo, idGrupo } : {}),
      ...(fecIni !== undefined ? { Fec_Ini: fecIni, fec_ini: fecIni, Fec_Inicio: fecIni } : {}),
      ...(fecFin !== undefined ? { Fec_Fin: fecFin, fec_fin: fecFin, Fec_Termino: fecFin } : {}),
      ...(numSemana !== undefined ? { Semana: numSemana, Num_Semana: numSemana, num_semana: numSemana } : {}),
    };
  }

  private normalizeAsistenciaGrupo(asistencia: UatAsistenciaGrupoResponse): UatAsistenciaGrupoResponse {
    const alumnos = this.readArray(asistencia, ['alumnos', 'Alumnos', 'data', 'Data', 'result', 'Result'])
      .filter((item): item is JsonRecord => this.isJsonRecord(item))
      .map((alumno) => this.normalizeAlumno(alumno));

    if (alumnos.length === 0) {
      return asistencia;
    }

    return {
      ...asistencia,
      alumnos,
      Alumnos: alumnos,
      data: alumnos,
      result: alumnos,
    };
  }

  private normalizeAlumno(alumno: JsonRecord): UatAsistenciaAlumnoItem {
    const idAlumno = this.readNumber(alumno, ['Id_Alumno', 'id_alumno', 'idAlumno']);
    const numLista = this.readNumber(alumno, ['Num_Lista', 'num_lista', 'numeroLista']);
    const matricula = this.readString(alumno, ['Num_Matricula', 'num_matricula', 'Matricula']);
    const nombre = this.readString(alumno, ['Txt_Alumno', 'txt_alumno', 'Nombre', 'Alumno']);

    return {
      ...alumno,
      ...(idAlumno !== undefined ? { Id_Alumno: idAlumno, id_alumno: idAlumno, idAlumno } : {}),
      ...(numLista !== undefined ? { Num_Lista: numLista, num_lista: numLista, numeroLista: numLista } : {}),
      ...(matricula !== undefined ? { Num_Matricula: matricula, num_matricula: matricula, Matricula: matricula } : {}),
      ...(nombre !== undefined ? { Txt_Alumno: nombre, txt_alumno: nombre, Nombre: nombre, Alumno: nombre } : {}),
    } as UatAsistenciaAlumnoItem;
  }

  private async getJsonList<TItem extends JsonRecord>(
    path: string,
    params: JsonRecord,
    context: string,
    referer = `${this.baseUrl}/Profesor/Consultas/Index`,
  ): Promise<TItem[]> {
    const payload = await this.requestJson<JsonValue>(
      () =>
        this.http.get(path, {
          ...this.withJar(),
          params,
          headers: this.ajaxHeaders(referer),
        }),
      context,
    );

    return this.toArray<TItem>(payload, context);
  }

  private async postFormList<TItem extends JsonRecord>(
    path: string,
    body: Record<string, FormValue>,
    context: string,
    referer = `${this.baseUrl}/Profesor/Consultas/Index`,
  ): Promise<TItem[]> {
    const payload = await this.requestJson<JsonValue>(
      () =>
        this.http.post(path, this.toForm(body), {
          ...this.withJar(),
          headers: {
            ...this.ajaxHeaders(referer),
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          },
        }),
      context,
    );

    return this.toArray<TItem>(payload, context);
  }

  private async getJsonObject<TData extends JsonRecord>(
    path: string,
    params: JsonRecord,
    context: string,
    referer: string,
  ): Promise<TData> {
    const payload = await this.requestJson<JsonValue>(
      () =>
        this.http.get(path, {
          ...this.withJar(),
          params,
          headers: this.ajaxHeaders(referer),
        }),
      context,
    );

    if (this.isJsonRecord(payload)) {
      return payload as TData;
    }

    throw new UatPortalError(`${context} no devolvio un objeto JSON reconocible.`, {
      payload,
    });
  }

  private async requestJson<T>(request: () => Promise<AxiosResponse<unknown>>, context: string): Promise<T> {
    try {
      const response = await request();
      return this.parseJsonResponse<T>(response, context);
    } catch (error) {
      if (error instanceof UatSessionExpiredError || error instanceof UatPortalError || error instanceof UatLoginError) {
        throw error;
      }

      throw this.toPortalError(error, `${context} fallo.`);
    }
  }

  private parseJsonResponse<T>(response: AxiosResponse<unknown>, context: string): T {
    const contentType = String(response.headers['content-type'] ?? '');
    const data = response.data;

    if (typeof data === 'object' && data !== null) {
      return data as T;
    }

    if (typeof data === 'string') {
      const trimmed = data.trim();

      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          return JSON.parse(trimmed) as T;
        } catch {
          throw new UatPortalError(`${context} devolvio JSON invalido.`, {
            status: response.status,
            contentType,
            preview: trimmed.slice(0, 300),
          });
        }
      }

      const lower = trimmed.toLowerCase();
      if (lower.includes('<html') || lower.includes('/login') || lower.includes('txtusuario')) {
        throw new UatSessionExpiredError('El portal devolvio HTML/Login en lugar de JSON.', {
          status: response.status,
          contentType,
          context,
          preview: trimmed.slice(0, 300),
        });
      }

      throw new UatPortalError(`${context} no devolvio JSON.`, {
        status: response.status,
        contentType,
        preview: trimmed.slice(0, 300),
      });
    }

    throw new UatPortalError(`${context} devolvio una respuesta vacia o no soportada.`, {
      status: response.status,
      contentType,
    });
  }

  private toArray<TItem extends JsonRecord>(payload: JsonValue, context: string): TItem[] {
    if (Array.isArray(payload)) {
      return payload as TItem[];
    }

    if (!this.isJsonRecord(payload)) {
      throw new UatPortalError(`${context} devolvio una estructura JSON no soportada.`, {
        payload,
      });
    }

    const candidates = [
      'data',
      'Data',
      'datos',
      'Datos',
      'items',
      'Items',
      'result',
      'Result',
      'resultado',
      'Resultado',
    ];

    for (const candidate of candidates) {
      const value = payload[candidate];
      if (Array.isArray(value)) {
        return value as TItem[];
      }
    }

    if (payload.exito === false) {
      const message = typeof payload.mensaje === 'string' ? payload.mensaje : 'El portal no devolvio datos.';
      if (isEmptyListMessage(message)) {
        return [];
      }

      throw new UatPortalError(message, {
        context,
        payload,
      });
    }

    throw new UatPortalError(`${context} no contiene un arreglo de datos reconocible.`, {
      payload,
    });
  }

  private readNumber(record: JsonRecord, keys: string[]): number | undefined {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }

      if (typeof value === 'string') {
        const parsed = Number.parseInt(value.trim(), 10);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    return undefined;
  }

  private readString(record: JsonRecord, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = record[key];
      if (value === undefined || value === null) {
        continue;
      }

      const text = String(value).trim();
      if (text.length > 0) {
        return text;
      }
    }

    return undefined;
  }

  private readArray(record: JsonRecord, keys: string[]): JsonValue[] {
    for (const key of keys) {
      const value = record[key];
      if (Array.isArray(value)) {
        return value;
      }
    }

    return [];
  }

  private isJsonRecord(value: JsonValue): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private toForm(body: Record<string, FormValue>): URLSearchParams {
    const form = new URLSearchParams();

    for (const [key, value] of Object.entries(body)) {
      form.set(key, String(value));
    }

    return form;
  }

  private ajaxHeaders(referer: string): Record<string, string> {
    return {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: referer,
    };
  }

  private htmlHeaders(referer?: string): Record<string, string> {
    return {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...(referer ? { Referer: referer } : {}),
    };
  }

  private withJar(config: AxiosRequestConfig = {}): AxiosCookieJarConfig {
    return {
      ...config,
      jar: this.jar,
      withCredentials: true,
    } as AxiosCookieJarConfig;
  }

  private cookieNames(): string[] {
    return this.jar.getCookiesSync(this.baseUrl).map((cookie) => cookie.key);
  }

  private hasCookie(name: string): boolean {
    return this.cookieNames().includes(name);
  }

  private toPortalError(error: unknown, fallbackMessage: string): UatPortalError {
    if (axios.isAxiosError(error)) {
      return new UatPortalError(error.message || fallbackMessage, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url,
        method: error.config?.method,
      });
    }

    return new UatPortalError(error instanceof Error ? error.message : fallbackMessage);
  }
}

function isEmptyListMessage(message: string): boolean {
  const normalized = message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return normalized.includes('no existe') || normalized.includes('no tiene grupos asignados');
}
