export interface StudentScheduleSnapshot {
  readonly externalGroupId: string;
  readonly groupLetter: string;
  readonly subjectName: string;
  readonly professorName?: string | null | undefined;
  readonly classroom?: string | null | undefined;
  readonly period?: string | null | undefined;
  readonly credits?: number | null | undefined;
  readonly schedule: Record<string, unknown>;
}

export interface StudentAcademicSnapshot {
  readonly snapshotId: string;
  readonly correlationId: string;
  readonly causationId: string;
  readonly synchronizedAt: Date;
  readonly student: {
    readonly matricula: string;
    readonly displayName: string;
    readonly email?: string | null | undefined;
  };
  readonly career: {
    readonly planExternalId: string;
    readonly name: string;
    readonly coordinationExternalId?: string | null | undefined;
  };
  readonly cycle: { readonly externalId: string; readonly name: string };
  readonly schedule: readonly StudentScheduleSnapshot[];
}

export interface AppliedStudentAcademicSnapshot {
  readonly snapshotId: string;
  readonly duplicate: boolean;
  readonly activeScheduleEntries: number;
}
