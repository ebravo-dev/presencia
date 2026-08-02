import type { AcademicRepository } from '../domain/academic.repository.js';
import type { ProfessorAcademicSnapshot } from '../domain/academic-snapshot.js';

export class ApplyAcademicSnapshotService {
  constructor(private readonly repository: AcademicRepository) {}

  async apply(snapshot: ProfessorAcademicSnapshot) {
    const groupIds = snapshot.groups.map(({ externalGroupId }) => externalGroupId);
    if (new Set(groupIds).size !== groupIds.length) throw new Error('DUPLICATE_EXTERNAL_GROUP_ID');
    for (const group of snapshot.groups) {
      const matriculas = group.students.map(({ matricula }) => matricula.trim().toUpperCase());
      if (new Set(matriculas).size !== matriculas.length) throw new Error(`DUPLICATE_MATRICULA:${group.externalGroupId}`);
    }
    return this.repository.applySnapshot(snapshot);
  }
}
