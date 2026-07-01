import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { env } from '../config/env.js';
import { UatLoginError, UatPortalError, UatSessionExpiredError } from '../errors/api-error.js';
import type { UatCredentials, UatLoginResponse, UatProfesorConsultaParams } from './uat.types.js';

type FormValue = string | number | boolean;
type AxiosCookieJarConfig = AxiosRequestConfig & { jar: CookieJar };

export class UatPortalClient {
  private readonly baseUrl: string;
  private readonly jar: CookieJar;
  private readonly http: AxiosInstance;

  constructor(options?: { baseUrl?: string; timeoutMs?: number; jar?: CookieJar }) {
    this.baseUrl = (options?.baseUrl ?? env.UAT_BASE_URL).replace(/\/+$/, '');
    this.jar = options?.jar ?? new CookieJar();
    this.http = wrapper(
      axios.create({
        baseURL: this.baseUrl,
        timeout: options?.timeoutMs ?? env.UAT_HTTP_TIMEOUT_MS,
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

      if (!this.hasCookie('ASP.NET_SessionId')) {
        throw new UatPortalError('GET /Login no entrego la cookie ASP.NET_SessionId.', {
          cookies: this.cookieNames(),
        });
      }

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

  async getHorarios(params: UatProfesorConsultaParams): Promise<unknown> {
    return this.getJson('/Profesor/Consultas/BuscaHorarios', params, 'GET /Profesor/Consultas/BuscaHorarios');
  }

  async getExamenes(params: UatProfesorConsultaParams): Promise<unknown> {
    return this.getJson('/Profesor/Consultas/BuscaExamenes', params, 'GET /Profesor/Consultas/BuscaExamenes');
  }

  async getNivelesEducativos(): Promise<unknown> {
    return this.postFormJson(
      '/Genericos/BuscarNivelEducativo',
      {
        sn_solo_titulares: 'true',
        profesor: 'true',
        tipo: '1',
      },
      'POST /Genericos/BuscarNivelEducativo',
    );
  }

  async getCampus(idNivelEducativo: number): Promise<unknown> {
    return this.postFormJson(
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

  async getDes(idNivelEducativo: number, idCu: number): Promise<unknown> {
    return this.postFormJson(
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

  async getCiclosEscolares(): Promise<unknown> {
    return this.postFormJson(
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

  getCookieDiagnostics(): { cookieNames: string[]; hasSessionCookie: boolean; hasAuthCookie: boolean } {
    return {
      cookieNames: this.cookieNames(),
      hasSessionCookie: this.hasCookie('ASP.NET_SessionId'),
      hasAuthCookie: this.hasCookie('.ASPXAUTH'),
    };
  }

  private async getJson(path: string, params: UatProfesorConsultaParams, context: string): Promise<unknown> {
    return this.requestJson(
      () =>
        this.http.get(path, {
          ...this.withJar(),
          params,
          headers: this.ajaxHeaders(`${this.baseUrl}/Profesor/Consultas/Index`),
        }),
      context,
    );
  }

  private async postFormJson(path: string, body: Record<string, FormValue>, context: string): Promise<unknown> {
    return this.requestJson(
      () =>
        this.http.post(path, this.toForm(body), {
          ...this.withJar(),
          headers: {
            ...this.ajaxHeaders(`${this.baseUrl}/Profesor/Consultas/Index`),
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          },
        }),
      context,
    );
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
