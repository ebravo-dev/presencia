export interface AcademicSnapshotStudent {
  matricula: string;
  name: string;
  uatStudentId?: number | null;
  listNumber?: number | null;
}

export interface AcademicSnapshotGroup {
  externalGroupId: string;
  code: string;
  groupLetter: string;
  name: string;
  level?: string | null;
  classroom?: string | null;
  period?: string | null;
  schedule: Record<string, unknown>;
  subject: { externalId: string; code?: string | null; name: string };
  coordination: { externalId: string; name: string; shortName?: string | null };
  rosterAuthoritative: boolean;
  students: AcademicSnapshotStudent[];
}

export interface ProfessorAcademicSnapshotInput {
  snapshotId: string;
  correlationId: string;
  causationId: string;
  teacher: {
    externalId: string;
    institutionalCode?: string | null;
    name: string;
    email?: string | null;
    authenticatedAt: string;
  };
  cycle: { externalId: string; name: string };
  groups: AcademicSnapshotGroup[];
}

export interface AcademicSnapshotPublisher {
  publishProfessorSnapshot(snapshot: ProfessorAcademicSnapshotInput): Promise<void>;
}

export interface StudentScheduleSnapshotInput {
  externalGroupId: string;
  groupLetter: string;
  subjectName: string;
  professorName?: string | null;
  classroom?: string | null;
  period?: string | null;
  credits?: number | null;
  schedule: Record<string, unknown>;
}

export interface StudentAcademicSnapshotInput {
  snapshotId: string;
  correlationId: string;
  causationId: string;
  synchronizedAt: string;
  student: { matricula: string; displayName: string; email?: string | null };
  career: { planExternalId: string; name: string; coordinationExternalId?: string | null };
  cycle: { externalId: string; name: string };
  schedule: StudentScheduleSnapshotInput[];
}

export interface StudentAcademicSnapshotPublisher {
  publishStudentSnapshot(snapshot: StudentAcademicSnapshotInput): Promise<void>;
}
