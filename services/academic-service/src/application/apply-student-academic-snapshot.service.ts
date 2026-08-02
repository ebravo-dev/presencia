import type { AcademicRepository } from '../domain/academic.repository.js';
import type { StudentAcademicSnapshot } from '../domain/student-academic-snapshot.js';

export class ApplyStudentAcademicSnapshotService {
  constructor(private readonly repository: AcademicRepository) {}

  async apply(snapshot: StudentAcademicSnapshot) {
    const groupIds = snapshot.schedule.map(({ externalGroupId }) => externalGroupId);
    if (new Set(groupIds).size !== groupIds.length) throw new Error('DUPLICATE_STUDENT_SCHEDULE_GROUP_ID');
    return this.repository.applyStudentSnapshot(snapshot);
  }
}
