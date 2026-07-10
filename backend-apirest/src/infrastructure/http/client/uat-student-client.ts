import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import type { CookieJar } from 'tough-cookie';
import { env } from '../../../config/env.js';
import { UatLoginError, UatPortalError, UatSessionExpiredError } from '../../../errors/api-error.js';
import type {
  JsonRecord,
  JsonValue,
  UatCredentials,
  UatLoginResponse,
  UatStudentCareerItem,
  UatStudentCareerSelection,
  UatStudentFinalGradeItem,
  UatStudentPartialGradeItem,
  UatStudentPortalClientPort,
  UatStudentScheduleItem,
} from '../../../domain/types/uat.interfaces.js';

type FormValue = string | number | boolean;
type AxiosCookieJarConfig = AxiosRequestConfig & { jar: CookieJar };

export class UatStudentPortalClient implements UatStudentPortalClientPort {
  private readonly baseUrl: string;
  private readonly jar: CookieJar;
  private readonly http: AxiosInstance;

  constructor(options: { baseUrl?: string; timeoutMs?: number; jar: CookieJar }) {
    this.baseUrl = (options.baseUrl ?? env.UAT_ALUMNOS_BASE_URL).replace(/\/+$/, '');
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
      const loginPage = await this.http.get('/', {
        ...this.withJar(),
        responseType: 'text',
        headers: this.htmlHeaders(),
      });
      const requestVerificationToken = this.extractRequestVerificationToken(String(loginPage.data ?? ''));
      const initialCookieNames = this.cookieNames();

      const loginForm = this.toForm({
        __RequestVerificationToken: requestVerificationToken,
        txtUsuario: credentials.username,
        txtContrasenia: credentials.password,
      });

      const login = await this.requestJson<UatLoginResponse>(
        () =>
          this.http.post('/Login/Accesar_Dominio', loginForm, {
            ...this.withJar(),
            headers: {
              ...this.ajaxHeaders(`${this.baseUrl}/`),
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            },
          }),
        'POST /Login/Accesar_Dominio alumnos',
      );

      if (!login.exito) {
        throw new UatLoginError(login.mensaje ?? 'Credenciales de alumno rechazadas por el portal UAT.', login);
      }

      if (!this.hasCookie('.ASPXAUTH')) {
        throw new UatPortalError('El portal de alumnos reporto login exitoso, pero no entrego la cookie .ASPXAUTH.', {
          initialCookieNames,
          cookies: this.cookieNames(),
          login,
        });
      }

      await this.http.get('/Login/Validar', {
        ...this.withJar(),
        responseType: 'text',
        headers: this.htmlHeaders(`${this.baseUrl}/`),
      });

      return login;
    } catch (error) {
      if (error instanceof UatLoginError || error instanceof UatPortalError || error instanceof UatSessionExpiredError) {
        throw error;
      }

      throw this.toPortalError(error, 'No fue posible autenticar contra el portal UAT de alumnos.');
    }
  }

  async getCareers(): Promise<UatStudentCareerItem[]> {
    return this.getJsonList<UatStudentCareerItem>(
      '/Home/CarrerasAlumno',
      'GET /Home/CarrerasAlumno',
      `${this.baseUrl}/Home`,
    );
  }

  async selectCareer(idPlanEstudio: number): Promise<UatStudentCareerSelection> {
    const payload = await this.requestJson<JsonValue>(
      () =>
        this.http.post('/Home/SeleccionarCarreraAlumno', this.toForm({ Id_Plan_Estudio: idPlanEstudio }), {
          ...this.withJar(),
          headers: {
            ...this.ajaxHeaders(`${this.baseUrl}/Home`),
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          },
        }),
      'POST /Home/SeleccionarCarreraAlumno',
    );

    if (!this.isJsonRecord(payload)) {
      throw new UatPortalError('SeleccionarCarreraAlumno no devolvio un objeto JSON reconocible.', { payload });
    }

    return payload as UatStudentCareerSelection;
  }

  async getSchedule(): Promise<UatStudentScheduleItem[]> {
    return this.getJsonList<UatStudentScheduleItem>(
      '/Alumno/Horario/SpuSelHorarioFichaAlumno',
      'GET /Alumno/Horario/SpuSelHorarioFichaAlumno',
      `${this.baseUrl}/Alumno/Horario`,
      { emptyOnFalse: true },
    );
  }

  async getPartialGrades(): Promise<UatStudentPartialGradeItem[]> {
    return this.getJsonList<UatStudentPartialGradeItem>(
      '/Alumno/CalificacionesParciales/SPUSELCalificacionesParciales',
      'GET /Alumno/CalificacionesParciales/SPUSELCalificacionesParciales',
      `${this.baseUrl}/Alumno/CalificacionesParciales`,
      { emptyOnFalse: true },
    );
  }

  async getFinalGrades(): Promise<UatStudentFinalGradeItem[]> {
    return this.getJsonList<UatStudentFinalGradeItem>(
      '/Alumno/CalificacionesFinales/ConsultaEvaluaciones',
      'GET /Alumno/CalificacionesFinales/ConsultaEvaluaciones',
      `${this.baseUrl}/Alumno/CalificacionesFinales`,
      { emptyOnFalse: true },
    );
  }

  getCookieDiagnostics() {
    return {
      cookieNames: this.cookieNames(),
      hasSessionCookie: this.hasCookie('ASP.NET_SessionId'),
      hasAuthCookie: this.hasCookie('.ASPXAUTH'),
    };
  }

  private async getJsonList<TItem extends JsonRecord>(
    path: string,
    context: string,
    referer: string,
    options: { emptyOnFalse?: boolean } = {},
  ): Promise<TItem[]> {
    const payload = await this.requestJson<JsonValue>(
      () =>
        this.http.get(path, {
          ...this.withJar(),
          headers: this.ajaxHeaders(referer),
        }),
      context,
    );

    return this.toArray<TItem>(payload, context, options);
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
        throw new UatSessionExpiredError('El portal de alumnos devolvio HTML/Login en lugar de JSON.', {
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

  private toArray<TItem extends JsonRecord>(
    payload: JsonValue,
    context: string,
    options: { emptyOnFalse?: boolean },
  ): TItem[] {
    if (Array.isArray(payload)) {
      return payload as TItem[];
    }

    if (!this.isJsonRecord(payload)) {
      throw new UatPortalError(`${context} devolvio una estructura JSON no soportada.`, { payload });
    }

    const candidates = ['data', 'Data', 'datos', 'Datos', 'items', 'Items', 'result', 'Result', 'resultado', 'Resultado'];
    for (const candidate of candidates) {
      const value = payload[candidate];
      if (Array.isArray(value)) {
        return value as TItem[];
      }
    }

    if (payload.exito === false && options.emptyOnFalse) {
      return [];
    }

    if (payload.exito === false) {
      const message = typeof payload.mensaje === 'string' && payload.mensaje.trim()
        ? payload.mensaje
        : 'El portal de alumnos no devolvio datos.';
      throw new UatPortalError(message, { context, payload });
    }

    throw new UatPortalError(`${context} no contiene un arreglo de datos reconocible.`, { payload });
  }

  private extractRequestVerificationToken(html: string): string {
    const tokenMatch = html.match(/name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)["']/i)
      ?? html.match(/value=["']([^"']+)["'][^>]*name=["']__RequestVerificationToken["']/i);

    const token = tokenMatch?.[1]?.trim();
    if (!token) {
      throw new UatPortalError('No se encontro __RequestVerificationToken en el portal de alumnos.');
    }

    return token;
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
