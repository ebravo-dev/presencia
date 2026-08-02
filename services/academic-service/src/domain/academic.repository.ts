import type { AppliedAcademicSnapshot, ProfessorAcademicSnapshot } from './academic-snapshot.js';
import type { AppliedStudentAcademicSnapshot, StudentAcademicSnapshot } from './student-academic-snapshot.js';

export interface AcademicRepository {
  applySnapshot(snapshot: ProfessorAcademicSnapshot): Promise<AppliedAcademicSnapshot>;
  applyStudentSnapshot(snapshot: StudentAcademicSnapshot): Promise<AppliedStudentAcademicSnapshot>;
  groupsForTeacher(externalTeacherId: string, cycleExternalId?: string): Promise<unknown[]>;
  groupByExternalId(externalGroupId: string): Promise<unknown | null>;
  studentByMatricula(matricula: string): Promise<unknown | null>;
}
