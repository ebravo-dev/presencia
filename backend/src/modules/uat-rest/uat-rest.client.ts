import { env } from '../../core/config/env.js';

type HttpMethod = 'GET' | 'POST' | 'DELETE';

export class UatRestClientError extends Error {
    constructor(
        message: string,
        readonly statusCode: number,
        readonly details?: unknown,
    ) {
        super(message);
        this.name = 'UatRestClientError';
    }
}

export interface UatSessionResponse {
    sessionId: string;
    authenticated: boolean;
    login: {
        exito: boolean;
        cambiaPass?: boolean;
        mensaje?: string;
        parametros?: {
            Id_Plantilla_AdmonUAT?: string;
            Cve_Usuario_AdmonUAT?: string;
            Txt_Usuario_AdmonUAT?: string;
        };
    };
}

export interface UatHorarioItem {
    Id_Grupo: number;
    Txt_DES?: string | null;
    Txt_Nombre_Corto?: string | null;
    Ciclo?: string | null;
    Txt_Letra?: string | null;
    Txt_Materia?: string | null;
    Txt_Nombre_Profesor?: string | null;
    Num_Periodo?: string | number | null;
    Txt_Espacio_Fisico?: string | null;
    Txt_Lunes?: string | null;
    Txt_Martes?: string | null;
    Txt_Miercoles?: string | null;
    Txt_Jueves?: string | null;
    Txt_Viernes?: string | null;
    Txt_Sabado?: string | null;
    Txt_Domingo?: string | null;
}

export interface UatProfesorGrupoItem {
    Id_Grupo: number;
    Materia?: string | null;
    Txt_Materia?: string | null;
    Grupo?: string | null;
    Txt_Letra?: string | null;
    Ciclo?: string | null;
    Id_Ciclo_Escolar?: number | null;
    Id_DES?: number | null;
}

export interface UatSemanaItem {
    Id_Grupo?: number;
    Fec_Ini?: string;
    Fec_Fin?: string;
    fec_ini?: string;
    fec_fin?: string;
}

export interface UatAsistenciaAlumnoItem {
    Num_Lista?: number;
    Num_Matricula?: string | number;
    Id_Alumno?: number;
    Txt_Alumno?: string;
}

export interface UatAsistenciaGrupoResponse {
    alumnos?: UatAsistenciaAlumnoItem[];
    Alumnos?: UatAsistenciaAlumnoItem[];
    data?: UatAsistenciaAlumnoItem[];
}

export interface UatAsistenciaAlumnoInput {
    id_alumno: number;
    num_pase_lista: number;
    num_dia: number;
    sn_asistencia: boolean;
}

class UatRestClient {
    private readonly baseUrl = env.BACKEND_API_REST_URL.replace(/\/+$/, '');

    async createSession(input: { username: string; password: string }): Promise<UatSessionResponse> {
        return this.request('/api/uat/sessions', { method: 'POST', body: input });
    }

    async deleteSession(sessionId: string): Promise<void> {
        await this.request(`/api/uat/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
    }

    async getHorarios(sessionId: string, input: { Id_Ciclo_Escolar: number; Id_DES: number }) {
        return this.getData<UatHorarioItem>('/api/uat/profesor/consultas/horarios', sessionId, input);
    }

    async getGruposProfesor(sessionId: string, input: { Id_Des: number; Id_Ciclo: number; Id_Plantilla: number }) {
        return this.getData<UatProfesorGrupoItem>('/api/uat/profesor/control-asistencia/grupos', sessionId, input);
    }

    async getSemanasGrupo(sessionId: string, input: { Id_Grupo: number }) {
        return this.getData<UatSemanaItem>('/api/uat/profesor/control-asistencia/semanas', sessionId, input);
    }

    async getAsistenciaGrupo(
        sessionId: string,
        input: { Id_Grupo: number; fec_ini: string; fec_fin: string },
    ) {
        const response = await this.request<{ data: UatAsistenciaGrupoResponse }>(
            `/api/uat/profesor/control-asistencia/asistencia-grupo${toQuery(input)}`,
            { headers: { 'X-UAT-Session-Id': sessionId } },
        );
        return response.data;
    }

    async guardarAsistencias(
        sessionId: string,
        input: { Id_Grupo: number; Fec_Ini: string; Asistencia: UatAsistenciaAlumnoInput[] },
    ) {
        return this.request('/api/uat/asistencia/guardar', {
            method: 'POST',
            headers: { 'X-UAT-Session-Id': sessionId },
            body: input,
        });
    }

    private async getData<T>(path: string, sessionId: string, query: Record<string, string | number>) {
        const response = await this.request<{ data: T[] }>(`${path}${toQuery(query)}`, {
            headers: { 'X-UAT-Session-Id': sessionId },
        });
        return response.data;
    }

    private async request<T>(
        path: string,
        options: { method?: HttpMethod; headers?: Record<string, string>; body?: unknown } = {},
    ): Promise<T> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: options.method ?? 'GET',
            headers: {
                Accept: 'application/json',
                ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                ...options.headers,
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
        });

        const contentType = response.headers.get('content-type') ?? '';
        const body = contentType.includes('application/json') ? await response.json() : await response.text();
        if (!response.ok) {
            const details = typeof body === 'object' && body !== null ? body as Record<string, unknown> : undefined;
            const message = typeof details?.message === 'string'
                ? details.message
                : `backend-apirest respondió ${response.status}`;
            throw new UatRestClientError(message, response.status, body);
        }

        return body as T;
    }
}

function toQuery(values: Record<string, string | number>) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) params.set(key, String(value));
    return `?${params.toString()}`;
}

export const uatRestClient = new UatRestClient();
