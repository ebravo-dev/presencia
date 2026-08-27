export interface SharedClassActor {
  actorIdentityId: string;
  actorRole: 'COORDINATOR' | 'SYSTEM';
  reason: string;
  correlationId: string;
}

export interface SharedClassInput {
  sourceAssignmentId: string;
  assignedTeacherId: string;
  schoolCycleYear: number;
  schoolCycleTerm: number;
  active?: boolean | undefined;
  notes?: string | null | undefined;
}

export interface LegacySharedClassImportRecord {
  legacySourceId: string;
  schoolCycleYear: number;
  schoolCycleTerm: number;
  active: boolean;
  notes: string | null;
  createdAt: Date;
  observedAt: Date;
  sourceAssignment: {
    externalGroupId: string;
    groupCode: string | null;
    schoolCycleExternalId: string;
    schoolCycleName: string | null;
    classroom: string | null;
    educationLevel: string | null;
    period: string | null;
    schedule: unknown;
    teacher: LegacyTeacherProfile;
    subject: { externalId: string; code: string | null; name: string };
    coordination: { externalId: string; name: string; shortName: string | null };
  };
  assignedTeacher: LegacyTeacherProfile;
}

export interface LegacyTeacherProfile {
  externalId: string;
  institutionalCode: string | null;
  name: string;
  email: string | null;
  lastAuthenticatedAt: Date;
}

export interface SharedClassTeacher {
  id: string;
  externalId: string;
  institutionalCode: string | null;
  name: string;
  email: string | null;
}

export interface SharedClassSourceAssignment {
  id: string;
  externalGroupId: string;
  groupCode: string | null;
  schoolCycleExternalId: string;
  schoolCycleName: string | null;
  classroom: string | null;
  educationLevel: string | null;
  period: string | null;
  schedule: unknown;
  firstSeenAt: Date;
  lastSeenAt: Date;
  teacher: { id: string; externalId: string; name: string };
  subject: { id: string; externalId: string; code: string | null; name: string };
  coordination: { id: string; externalId: string; name: string };
}

export interface SharedClassAssignmentDetail {
  id: string;
  sourceAssignmentId: string;
  assignedTeacherId: string;
  schoolCycleYear: number;
  schoolCycleTerm: number;
  active: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  sourceAssignment: SharedClassSourceAssignment;
  assignedTeacher: SharedClassTeacher;
}

export interface AuthorizedSharedClassAssignmentDetail extends SharedClassAssignmentDetail {
  students: Array<{
    matricula: string;
    name: string;
    uatStudentId: number | null;
    listNumber: number | null;
  }>;
}

export interface SharedClassRepository {
  listOptions(): Promise<{ teachers: SharedClassTeacher[]; assignments: SharedClassSourceAssignment[] }>;
  list(): Promise<SharedClassAssignmentDetail[]>;
  listForTeacher(identity: string, cycle?: { year: number; term: number }): Promise<AuthorizedSharedClassAssignmentDetail[]>;
  create(input: SharedClassInput & SharedClassActor): Promise<SharedClassAssignmentDetail>;
  update(id: string, input: Partial<SharedClassInput> & SharedClassActor): Promise<SharedClassAssignmentDetail>;
  delete(id: string, actor: SharedClassActor): Promise<void>;
  importLegacy(
    records: LegacySharedClassImportRecord[],
    actor: SharedClassActor,
  ): Promise<{ imported: number; updated: number; unchanged: number }>;
}

export class SharedClassDomainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'SharedClassDomainError';
  }
}
