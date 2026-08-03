import type { AppliedAcademicSnapshot, ProfessorAcademicSnapshot } from './academic-snapshot.js';
import type { AppliedStudentAcademicSnapshot, StudentAcademicSnapshot } from './student-academic-snapshot.js';

export interface AcademicCoordinationProjectionSnapshot {
  externalGroupId: string;
  active: boolean;
  observedAt: Date;
  rosterVersion: string;
  teacher: {
    externalId: string; institutionalCode: string | null; name: string; email: string | null; lastAuthenticatedAt: Date;
  };
  cycle: { externalId: string; name: string };
  group: {
    externalGroupId: string; code: string; groupLetter: string; name: string;
    level: string | null; classroom: string | null; period: string | null; schedule: unknown;
  };
  subject: { externalId: string; code: string | null; name: string };
  coordination: { externalId: string; name: string; shortName: string | null };
}

export interface AcademicRepository {
  applySnapshot(snapshot: ProfessorAcademicSnapshot): Promise<AppliedAcademicSnapshot>;
  applyStudentSnapshot(snapshot: StudentAcademicSnapshot): Promise<AppliedStudentAcademicSnapshot>;
  groupsForTeacher(externalTeacherId: string, cycleExternalId?: string): Promise<unknown[]>;
  groupByExternalId(externalGroupId: string): Promise<unknown | null>;
  studentByMatricula(matricula: string): Promise<unknown | null>;
  coordinationProjectionSnapshot(): Promise<AcademicCoordinationProjectionSnapshot[]>;
  resetDemoData(): Promise<void>;
}
