import { randomUUID } from 'node:crypto';

export const TEACHER_AUTHENTICATED_EVENT = 'teacher.authenticated' as const;

export interface AuthenticatedTeacherIdentity {
  externalId: string;
  plantillaId: number | null;
  institutionalCode: string | null;
  name: string;
  email: string | null;
}

export interface TeacherAuthenticatedEvent {
  eventId: string;
  eventName: typeof TEACHER_AUTHENTICATED_EVENT;
  occurredAt: Date;
  sessionId: string;
  teacher: AuthenticatedTeacherIdentity;
}

export function createTeacherAuthenticatedEvent(input: {
  sessionId: string;
  username: string;
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

  return {
    eventId: randomUUID(),
    eventName: TEACHER_AUTHENTICATED_EVENT,
    occurredAt: new Date(),
    sessionId: input.sessionId,
    teacher: {
      externalId: String(plantilla ?? institutionalCode ?? input.username.trim().toLowerCase()),
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
