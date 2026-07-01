export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonRecord;

export interface JsonRecord {
  [key: string]: JsonValue | undefined;
}

export interface UatCredentials {
  username: string;
  password: string;
}

export interface UatProfesorConsultaParams extends JsonRecord {
  Id_Ciclo_Escolar: number;
  Id_DES: number;
}

export interface UatLoginParametros extends JsonRecord {
  Id_Sistema_AdmonUAT?: string;
  Id_Usuario_AdmonUAT?: string;
  Id_Plantilla_AdmonUAT?: string;
  Txt_Usuario_AdmonUAT?: string;
  Cve_Usuario_AdmonUAT?: string;
}

export interface UatLoginResponse extends JsonRecord {
  exito: boolean;
  cambiaPass?: boolean;
  mensaje?: string;
  parametros?: UatLoginParametros;
}

export interface UatSafeLogin {
  exito: boolean;
  cambiaPass?: boolean;
  mensaje?: string;
  parametros?: UatLoginParametros;
}

export interface UatHorarioItem extends JsonRecord {
  Id_Grupo: number;
  Txt_DES: string;
  Txt_Nombre_Corto: string;
  Ciclo: string;
  Txt_Letra: string;
  Txt_Materia: string;
  Txt_Nombre_Profesor: string;
  Num_Periodo: string | number | null;
  Txt_Espacio_Fisico: string | null;
  Txt_Lunes: string | null;
  Txt_Martes: string | null;
  Txt_Miercoles: string | null;
  Txt_Jueves: string | null;
  Txt_Viernes: string | null;
  Txt_Sabado: string | null;
  Txt_Domingo: string | null;
}

export interface UatExamenItem extends JsonRecord {
  Id_Grupo: number;
  Txt_DES: string;
  Txt_Nombre_Corto: string;
  Ciclo: string;
  Txt_Letra: string;
  Txt_Materia: string;
  Txt_Nombre_Profesor: string;
  Num_Periodo?: string | number | null;
  Txt_Espacio_Fisico?: string | null;
  Txt_Tipo_Examen?: string | null;
  Txt_Fecha?: string | null;
  Fec_Examen?: string | null;
  Txt_Hora?: string | null;
  Txt_Aula?: string | null;
}

export interface UatNivelEducativoItem extends JsonRecord {
  Id_Nivel_Educativo: number;
  Txt_Nivel_Educativo: string;
  Txt_Nombre_Corto?: string;
}

export interface UatCampusItem extends JsonRecord {
  Id_CU: number;
  Txt_CU: string;
  Txt_Nombre_Corto?: string;
}

export interface UatDesItem extends JsonRecord {
  Id_DES: number;
  Txt_DES: string;
  Txt_Nombre_Corto?: string;
}

export interface UatCicloEscolarItem extends JsonRecord {
  Id_Ciclo_Escolar: number;
  Ciclo?: string;
  Txt_Ciclo_Escolar?: string;
  Txt_Nombre_Corto?: string;
  Sn_Activo?: boolean | string | number;
}

export interface UatCookieDiagnostics {
  cookieNames: string[];
  hasSessionCookie: boolean;
  hasAuthCookie: boolean;
}

export interface UatPortalClientPort {
  authenticate(credentials: UatCredentials): Promise<UatLoginResponse>;
  getHorarios(params: UatProfesorConsultaParams): Promise<UatHorarioItem[]>;
  getExamenes(params: UatProfesorConsultaParams): Promise<UatExamenItem[]>;
  getNivelesEducativos(): Promise<UatNivelEducativoItem[]>;
  getCampus(idNivelEducativo: number): Promise<UatCampusItem[]>;
  getDes(idNivelEducativo: number, idCu: number): Promise<UatDesItem[]>;
  getCiclosEscolares(): Promise<UatCicloEscolarItem[]>;
  getCookieDiagnostics(): UatCookieDiagnostics;
}

export interface StoredUatSession {
  id: string;
  client: UatPortalClientPort;
  login: UatLoginResponse;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
}

export interface UatSessionResponse {
  sessionId: string;
  authenticated: true;
  login: UatSafeLogin;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  activeSessions: number;
  cookieDiagnostics: UatCookieDiagnostics;
}

export interface UatDataResponse<TItem extends JsonRecord> {
  source: 'UAT';
  endpoint: string;
  query: JsonRecord;
  data: TItem[];
  fetchedAt: string;
}

export interface UatSnapshotResponse {
  source: 'UAT';
  authenticated: true;
  login: UatSafeLogin;
  query: UatProfesorConsultaParams;
  horarios: UatHorarioItem[];
  examenes?: UatExamenItem[];
  fetchedAt: string;
}
