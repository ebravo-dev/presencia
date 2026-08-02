export interface AcademicStudentSnapshot { readonly matricula: string; readonly name: string }
export interface AcademicGroupSnapshot {
  readonly externalGroupId: string;
  readonly code: string;
  readonly groupLetter: string;
  readonly name: string;
  readonly level?: string | null | undefined;
  readonly classroom?: string | null | undefined;
  readonly schedule: Record<string, unknown>;
  readonly subject: { readonly externalId: string; readonly code?: string | null | undefined; readonly name: string };
  readonly coordination: { readonly externalId: string; readonly name: string; readonly shortName?: string | null | undefined };
  readonly rosterAuthoritative: boolean;
  readonly students: readonly AcademicStudentSnapshot[];
}
export interface ProfessorAcademicSnapshot {
  readonly snapshotId: string;
  readonly correlationId: string;
  readonly causationId: string;
  readonly teacher: {
    readonly externalId: string;
    readonly institutionalCode?: string | null | undefined;
    readonly name: string;
    readonly email?: string | null | undefined;
    readonly authenticatedAt: Date;
  };
  readonly cycle: { readonly externalId: string; readonly name: string };
  readonly groups: readonly AcademicGroupSnapshot[];
}

export interface AppliedAcademicSnapshot {
  readonly snapshotId: string;
  readonly duplicate: boolean;
  readonly activeGroups: number;
  readonly activeEnrollments: number;
  readonly deactivatedGroups: number;
}
