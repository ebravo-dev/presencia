import type {
  SharedClassActor,
  SharedClassInput,
  LegacySharedClassImportRecord,
  SharedClassRepository,
  SharedClassAssignmentDetail,
} from '../domain/shared-class.js';

export class SharedClassService {
  constructor(private readonly repository: SharedClassRepository) {}

  async listOptions() {
    return { data: await this.repository.listOptions(), meta: generatedMeta() };
  }

  async list() {
    return { data: await this.repository.list(), meta: generatedMeta() };
  }

  async create(input: SharedClassInput & SharedClassActor) {
    return { data: await this.repository.create({ ...input, notes: cleanNotes(input.notes) }) };
  }

  async update(id: string, input: Partial<SharedClassInput> & SharedClassActor) {
    return {
      data: await this.repository.update(id, {
        ...input,
        ...(input.notes === undefined ? {} : { notes: cleanNotes(input.notes) }),
      }),
    };
  }

  delete(id: string, actor: SharedClassActor) {
    return this.repository.delete(id, actor);
  }

  importLegacy(records: LegacySharedClassImportRecord[], correlationId: string) {
    return this.repository.importLegacy(records, {
      actorIdentityId: 'legacy-uat-integration',
      actorRole: 'SYSTEM',
      reason: 'Migración idempotente desde la autoridad anterior de clases compartidas.',
      correlationId,
    });
  }

  async listForTeacher(identity: string, cycle?: { year: number; term: number }) {
    const records = await this.repository.listForTeacher(identity, cycle);
    return {
      source: 'SHARED_CLASSES',
      data: records.map(toProfessorClass),
      fetchedAt: new Date().toISOString(),
    };
  }
}

function toProfessorClass(record: SharedClassAssignmentDetail) {
  const source = record.sourceAssignment;
  const classCode = source.subject.code ?? source.externalGroupId;
  const groupLetter = source.groupCode ?? '';
  return {
    id: source.externalGroupId,
    code: classCode,
    groupLetter,
    period: formatCycle(record.schoolCycleYear, record.schoolCycleTerm),
    group: groupLetter ? `${classCode}-${groupLetter}` : classCode,
    name: source.subject.name,
    level: source.educationLevel,
    classroom: source.classroom ?? '',
    schedule: source.schedule,
    students: [],
    studentsCount: 0,
    source: 'SHARED',
    isShared: true,
    isSubstitute: true,
    sharedAssignmentId: record.id,
    primaryProfessor: { id: source.teacher.id, name: source.teacher.name },
    sharedCycle: { year: record.schoolCycleYear, term: record.schoolCycleTerm },
  };
}

function cleanNotes(value?: string | null): string | null {
  return value?.trim() || null;
}

function formatCycle(year: number, term: number): string {
  const season = term === 1 ? 'PRIMAVERA' : term === 2 ? 'VERANO' : 'OTONO';
  return `${year} - ${term} ${season}`;
}

function generatedMeta() {
  return { generatedAt: new Date().toISOString() };
}
