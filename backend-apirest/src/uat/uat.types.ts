export interface UatCredentials {
  username: string;
  password: string;
}

export interface UatProfesorConsultaParams {
  Id_Ciclo_Escolar: number;
  Id_DES: number;
}

export interface UatLoginResponse {
  exito: boolean;
  cambiaPass?: boolean;
  mensaje?: string;
  parametros?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UatSessionSnapshot {
  id: string;
  login: UatLoginResponse;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
}
