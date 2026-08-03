import { randomUUID } from 'node:crypto';

export const TEACHER_AUTHENTICATED_EVENT = 'uat.teacher_authenticated.v1' as const;

export interface AuthenticatedTeacherIdentity {
  externalId: string;
  plantillaId: number | null;
  institutionalCode: string | null;
  name: string;
  email: string | null;
}

export interface TeacherAuthenticatedEvent {
  eventId: string;
  eventType: typeof TEACHER_AUTHENTICATED_EVENT;
  occurredAt: Date;
  producer: 'uat-integration';
  correlationId: string;
  causationId: string;
  aggregateId: string;
  schemaVersion: 1;
  sessionId: string;
  teacher: AuthenticatedTeacherIdentity;
}

export function createTeacherAuthenticatedEvent(input: {
  sessionId: string;
  username: string;
  correlationId?: string;
  causationId?: string;
  loginParameters?: {
    Id_Plantilla_AdmonUAT?: string;
    Cve_Usuario_AdmonUAT?: string;
    Txt_Usuario_AdmonUAT?: string;
  };
}): TeacherAuthenticatedEvent {
  const parameters = input.loginParameters;
  const plantilla = toPositiveInteger(parameters?.Id_Plantilla_AdmonUAT);
  const institutionalCode = clean(parameters?.Cve_Usuario_AdmonUAT);
  const email = input.username.includes('@') ? input.username.trim().toLowerCase() : null;

  const eventId = randomUUID();
  const correlationId = input.correlationId ?? eventId;
  const aggregateId = String(plantilla ?? institutionalCode ?? input.username.trim().toLowerCase());
  return {
    eventId,
    eventType: TEACHER_AUTHENTICATED_EVENT,
    occurredAt: new Date(),
    producer: 'uat-integration',
    correlationId,
    causationId: input.causationId ?? correlationId,
    aggregateId,
    schemaVersion: 1,
    sessionId: input.sessionId,
    teacher: {
      externalId: aggregateId,
      plantillaId: plantilla,
      institutionalCode,
      name: clean(parameters?.Txt_Usuario_AdmonUAT) ?? institutionalCode ?? input.username.trim(),
      email,
    },
  };
}

function clean(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function toPositiveInteger(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
