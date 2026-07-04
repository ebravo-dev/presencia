import { ApiError } from '../../errors/api-error.js';
import type { IGroupAssignmentRepository } from '../../domain/repositories/group-assignment.repository.js';
import type {
  ISharedClassAssignmentRepository,
  SharedClassAssignmentData,
  SharedClassAssignmentDetail,
} from '../../domain/repositories/shared-class-assignment.repository.js';
import type { ITeacherRepository } from '../../domain/repositories/teacher.repository.js';

export interface SharedClassInput {
  sourceAssignmentId: string;
  assignedTeacherId: string;
  schoolCycleYear: number;
  schoolCycleTerm: number;
  active?: boolean;
  notes?: string | null;
}

export class SharedClassService {
  constructor(
    private readonly repository: ISharedClassAssignmentRepository,
    private readonly teachers: ITeacherRepository,
    private readonly assignments: IGroupAssignmentRepository,
  ) {}

  async listOptions() {
    const options = await this.repository.listOptions();
    return { data: options, meta: { generatedAt: new Date().toISOString() } };
  }

  async list() {
    return { data: await this.repository.findAll(), meta: { generatedAt: new Date().toISOString() } };
  }

  async create(input: SharedClassInput) {
    await this.validateReferences(input.sourceAssignmentId, input.assignedTeacherId);
    try {
      return { data: await this.repository.create(toData(input)) };
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async update(id: string, input: Partial<SharedClassInput>) {
    const current = await this.repository.findById(id);
    if (!current) throw new ApiError(404, 'SHARED_CLASS_NOT_FOUND', 'Asignacion compartida no encontrada.');

    const sourceAssignmentId = input.sourceAssignmentId ?? current.sourceAssignmentId;
    const assignedTeacherId = input.assignedTeacherId ?? current.assignedTeacherId;
    await this.validateReferences(sourceAssignmentId, assignedTeacherId);
    try {
      return { data: await this.repository.update(id, toPartialData(input)) };
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async delete(id: string) {
    if (!(await this.repository.delete(id))) {
      throw new ApiError(404, 'SHARED_CLASS_NOT_FOUND', 'Asignacion compartida no encontrada.');
    }
  }

  async listForAuthenticatedTeacher(identity: string, cycle?: { year: number; term: number }) {
    const records = await this.repository.findActiveByTeacherIdentity(identity, cycle);
    return {
      source: 'SHARED_CLASSES',
      data: records.map(toProfessorClass),
      fetchedAt: new Date().toISOString(),
    };
  }

  private async validateReferences(sourceAssignmentId: string, assignedTeacherId: string) {
    const [assignment, teacher] = await Promise.all([
      this.assignments.findById(sourceAssignmentId),
      this.teachers.findById(assignedTeacherId),
    ]);
    if (!assignment) throw new ApiError(404, 'SOURCE_ASSIGNMENT_NOT_FOUND', 'La clase de origen no existe.');
    if (!teacher) throw new ApiError(404, 'ASSIGNED_TEACHER_NOT_FOUND', 'El profesor receptor no existe.');
    if (assignment.teacher.id === assignedTeacherId) {
      throw new ApiError(409, 'INVALID_SHARED_CLASS', 'No puedes compartir una clase con su profesor titular.');
    }
  }
}

function toData(input: SharedClassInput): SharedClassAssignmentData {
  return {
    sourceAssignmentId: input.sourceAssignmentId,
    assignedTeacherId: input.assignedTeacherId,
    schoolCycleYear: input.schoolCycleYear,
    schoolCycleTerm: input.schoolCycleTerm,
    active: input.active ?? true,
    notes: cleanNotes(input.notes),
  };
}

function toPartialData(input: Partial<SharedClassInput>): Partial<SharedClassAssignmentData> {
  return {
    ...(input.sourceAssignmentId !== undefined ? { sourceAssignmentId: input.sourceAssignmentId } : {}),
    ...(input.assignedTeacherId !== undefined ? { assignedTeacherId: input.assignedTeacherId } : {}),
    ...(input.schoolCycleYear !== undefined ? { schoolCycleYear: input.schoolCycleYear } : {}),
    ...(input.schoolCycleTerm !== undefined ? { schoolCycleTerm: input.schoolCycleTerm } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
    ...(input.notes !== undefined ? { notes: cleanNotes(input.notes) } : {}),
  };
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
    primaryProfessor: {
      id: source.teacher.id,
      name: source.teacher.name,
    },
    sharedCycle: {
      year: record.schoolCycleYear,
      term: record.schoolCycleTerm,
    },
  };
}

function cleanNotes(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function formatCycle(year: number, term: number): string {
  const season = term === 1 ? 'PRIMAVERA' : term === 2 ? 'VERANO' : 'OTONO';
  return `${year} - ${term} ${season}`;
}

function mapPersistenceError(error: unknown): ApiError {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : null;
  if (code === 'P2002') return new ApiError(409, 'SHARED_CLASS_EXISTS', 'Esa clase ya esta compartida con el profesor.');
  if (code === 'P2003') return new ApiError(404, 'SHARED_CLASS_REFERENCE_NOT_FOUND', 'La clase o el profesor ya no existe.');
  return error instanceof ApiError ? error : new ApiError(500, 'SHARED_CLASS_PERSISTENCE_ERROR', 'No fue posible guardar la asignacion compartida.');
}
