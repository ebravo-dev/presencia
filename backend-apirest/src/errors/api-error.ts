export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class UatLoginError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(401, 'UAT_LOGIN_FAILED', message, details);
    this.name = 'UatLoginError';
  }
}

export class UatSessionExpiredError extends ApiError {
  constructor(message = 'La sesion del portal UAT expiro o no esta autenticada.', details?: unknown) {
    super(401, 'UAT_SESSION_EXPIRED', message, details);
    this.name = 'UatSessionExpiredError';
  }
}

export class UatSessionNotFoundError extends ApiError {
  constructor(sessionId?: string) {
    super(401, 'UAT_SESSION_NOT_FOUND', 'Sesion UAT no encontrada o expirada.', { sessionId });
    this.name = 'UatSessionNotFoundError';
  }
}

export class UatPortalError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(502, 'UAT_PORTAL_ERROR', message, details);
    this.name = 'UatPortalError';
  }
}
