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

export interface UatStudentCareerItem extends JsonRecord {
  Num_Matricula?: string | number;
  Id_Plan_Estudio?: number;
  Id_DES?: number;
  Txt_Programa_Academico?: string;
  CicloActivo?: string;
  Promedio?: string | number;
  CreditosAprobados?: string | number;
}

export interface UatStudentCareerSelection extends JsonRecord {
  exito?: boolean;
  mensaje?: string;
  parametros?: JsonRecord & {
    Id_Alumno_AlumnosUAT?: string | number;
    Num_Matricula_AlumnosUAT?: string | number;
    Id_Plan_Estudio_AlumnosUAT?: string | number;
    Id_Ciclo_Escolar_Activo_AlumnosUAT?: string | number;
    Id_DES_AlumnosUAT?: string | number;
  };
}

export interface UatStudentScheduleItem extends JsonRecord {
  Id_Grupo?: number;
  Txt_Letra?: string;
  Txt_Materia?: string;
  Num_Creditos?: number;
  Num_Periodo?: string | number | null;
  Txt_Espacio_Fisico?: string | null;
  Txt_Lunes?: string | null;
  Txt_Martes?: string | null;
  Txt_Miercoles?: string | null;
  Txt_Jueves?: string | null;
  Txt_Viernes?: string | null;
  Txt_Sabado?: string | null;
  Txt_Domingo?: string | null;
  Txt_Nombre_Profesor?: string | null;
}

export interface UatStudentPartialGradeItem extends JsonRecord {
  MATERIA?: string;
  GRUPO?: string;
  PROFESOR?: string;
  P1?: string | number | null;
  P2?: string | number | null;
  P3?: string | number | null;
  P4?: string | number | null;
  P5?: string | number | null;
  P6?: string | number | null;
  P7?: string | number | null;
  P8?: string | number | null;
  PROMEDIO?: string | number | null;
}

export interface UatStudentFinalGradeItem extends JsonRecord {
  num?: number;
  cve_materia?: string;
  txt_materia?: string;
  creditos?: string | number | null;
  txt_letra?: string;
  acta?: string | number | null;
  fecordinarioa?: string | null;
  ordinariotextoa?: string | number | null;
  fecordinariob?: string | null;
  ordinariotextob?: string | number | null;
  fecexordinarioa?: string | null;
  exordinariotextoa?: string | number | null;
  fecexordinariob?: string | null;
  exordinariotextob?: string | number | null;
  txt_profesor?: string | null;
  id_grupo?: number;
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

export interface UatProfesorGruposParams extends JsonRecord {
  Id_Des: number;
  Id_Ciclo: number;
  Id_Plantilla: number;
}

export interface UatProfesorGrupoItem extends JsonRecord {
  Id_Grupo: number;
  Materia?: string;
  Txt_Materia?: string;
  Grupo?: string;
  Txt_Letra?: string;
  Ciclo?: string;
  Id_Ciclo_Escolar?: number;
  Id_DES?: number;
}

export interface UatSemanasGrupoParams extends JsonRecord {
  Id_Grupo: number;
}

export interface UatSemanaItem extends JsonRecord {
  Id_Grupo?: number;
  Fec_Ini?: string;
  Fec_Fin?: string;
  fec_ini?: string;
  fec_fin?: string;
  Txt_Periodo?: string;
  Semana?: string | number;
}

export interface UatAsistenciaGrupoParams extends JsonRecord {
  Id_Grupo: number;
  fec_ini: string;
  fec_fin: string;
}

export interface UatAsistenciaAlumnoItem extends JsonRecord {
  Num_Lista?: number;
  Num_Matricula?: string | number;
  Id_Alumno: number;
  Txt_Alumno: string;
  Num_Pl_Lunes?: number;
  Txt_Pl_Lunes?: string | null;
  Num_Pl_Martes?: number;
  Txt_Pl_Martes?: string | null;
  Num_Pl_Miercoles?: number;
  Txt_Pl_Miercoles?: string | null;
  Num_Pl_Jueves?: number;
  Txt_Pl_Jueves?: string | null;
  Num_Pl_Viernes?: number;
  Txt_Pl_Viernes?: string | null;
  Num_Pl_Sabado?: number;
  Txt_Pl_Sabado?: string | null;
  Num_Pl_Domingo?: number;
  Txt_Pl_Domingo?: string | null;
  Sn_Hor_Lunes?: boolean | string | number;
  Sn_Hor_Martes?: boolean | string | number;
  Sn_Hor_Miercoles?: boolean | string | number;
  Sn_Hor_Jueves?: boolean | string | number;
  Sn_Hor_Viernes?: boolean | string | number;
  Sn_Hor_Sabado?: boolean | string | number;
  Sn_Hor_Domingo?: boolean | string | number;
}

export interface UatAsistenciaGrupoResponse extends JsonRecord {
  exito?: boolean;
  mensaje?: string;
  alumnos?: UatAsistenciaAlumnoItem[];
  Alumnos?: UatAsistenciaAlumnoItem[];
  data?: UatAsistenciaAlumnoItem[];
}

export interface UatAsistenciaAlumnoInput extends JsonRecord {
  id_alumno: number;
  num_pase_lista: number;
  num_dia: number;
  sn_asistencia: boolean;
}

export interface UatGuardaAsistenciasPayload extends JsonRecord {
  Id_Grupo: number;
  Fec_Ini: string;
  Asistencia: string;
}

export interface UatGuardaAsistenciasResponse extends JsonRecord {
  exito: boolean;
  mensaje: string;
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
  getGruposProfesor(params: UatProfesorGruposParams): Promise<UatProfesorGrupoItem[]>;
  getSemanasGrupo(params: UatSemanasGrupoParams): Promise<UatSemanaItem[]>;
  getAsistenciaGrupo(params: UatAsistenciaGrupoParams): Promise<UatAsistenciaGrupoResponse>;
  guardaAsistencias(payload: UatGuardaAsistenciasPayload): Promise<UatGuardaAsistenciasResponse>;
  getCookieDiagnostics(): UatCookieDiagnostics;
}

export interface UatStudentPortalClientPort {
  authenticate(credentials: UatCredentials): Promise<UatLoginResponse>;
  getCareers(): Promise<UatStudentCareerItem[]>;
  selectCareer(idPlanEstudio: number): Promise<UatStudentCareerSelection>;
  getSchedule(): Promise<UatStudentScheduleItem[]>;
  getPartialGrades(): Promise<UatStudentPartialGradeItem[]>;
  getFinalGrades(): Promise<UatStudentFinalGradeItem[]>;
  getCookieDiagnostics(): UatCookieDiagnostics;
}

export interface StoredUatSessionBase {
  id: string;
  username: string;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
}

export interface StoredUatSession extends StoredUatSessionBase {
  id: string;
  username: string;
  credentialCipher: string;
  client: UatPortalClientPort;
  login: UatLoginResponse;
}

export interface StoredUatStudentSession extends StoredUatSessionBase {
  client: UatStudentPortalClientPort;
  login: UatLoginResponse;
  careers: UatStudentCareerItem[];
  selectedCareer: UatStudentCareerSelection;
  deviceBindingToken?: string;
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

export interface UatObjectResponse<TData extends JsonRecord> {
  source: 'UAT';
  endpoint: string;
  query: JsonRecord;
  data: TData;
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

export interface UatStudentSessionResponse {
  sessionId: string;
  authenticated: true;
  login: UatSafeLogin;
  careers: UatStudentCareerItem[];
  selectedCareer: UatStudentCareerSelection;
  deviceBindingToken?: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  activeSessions: number;
  cookieDiagnostics: UatCookieDiagnostics;
}
