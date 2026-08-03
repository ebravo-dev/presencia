export type AttendanceStatusValue = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export interface RosterStudentSnapshot {
  readonly matricula: string;
  readonly name: string;
  readonly uatStudentId?: number | null | undefined;
  readonly listNumber?: number | null | undefined;
}

export interface AttendanceRosterSnapshot {
  readonly externalGroupId: string;
  readonly uatGroupId?: number | null | undefined;
  readonly name: string;
  readonly groupLetter: string;
  readonly professorExternalId: string;
  readonly professorName?: string | undefined;
  readonly professorEmail?: string | null | undefined;
  readonly classroom?: string | null | undefined;
  readonly period?: string | null | undefined;
  readonly schedule: Record<string, unknown>;
  readonly rosterVersion: string;
  readonly rosterObservedAt: Date;
  readonly rosterAuthoritative: boolean;
  readonly students: readonly RosterStudentSnapshot[];
}

export interface CaptureAttendanceCommand {
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly professorExternalId: string;
  readonly externalGroupId: string;
  readonly date: string;
  readonly skipExternalUpload?: boolean | undefined;
  readonly entries: readonly {
    matricula?: string | undefined;
    uatStudentId?: number | undefined;
    status: AttendanceStatusValue;
  }[];
}

export interface CaptureAttendanceResult {
  readonly attendanceSessionId: string;
  readonly externalGroupId: string;
  readonly date: string;
  readonly entriesCount: number;
  readonly uploadStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  readonly duplicate: boolean;
  readonly version: number;
}

export interface AcademicGroupAccessGrantInput {
  readonly assignmentId: string;
  readonly externalGroupId: string;
  readonly professorExternalId: string;
  readonly professorInstitutionalCode?: string | null | undefined;
  readonly professorEmail?: string | null | undefined;
  readonly schoolCycleYear: number;
  readonly schoolCycleTerm: number;
  readonly active: boolean;
  readonly observedAt: Date;
}

export function shouldApplyGroupAccessGrant(
  current: { observedAt: Date } | null,
  incoming: Pick<AcademicGroupAccessGrantInput, 'observedAt'>,
): boolean {
  return current === null || current.observedAt.getTime() < incoming.observedAt.getTime();
}

export class AttendanceDomainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'AttendanceDomainError';
  }
}

export function shouldApplyRosterSnapshot(
  current: { rosterVersion: string; rosterObservedAt: Date } | null,
  incoming: Pick<AttendanceRosterSnapshot, 'rosterVersion' | 'rosterObservedAt'>,
): boolean {
  if (!current) return true;
  if (current.rosterObservedAt > incoming.rosterObservedAt) return false;
  return current.rosterObservedAt.getTime() !== incoming.rosterObservedAt.getTime()
    || current.rosterVersion !== incoming.rosterVersion;
}
