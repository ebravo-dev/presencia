import { describe, expect, it, vi } from 'vitest';
import type { GroupAssignmentDetail, IGroupAssignmentRepository } from '../../domain/repositories/group-assignment.repository.js';
import type {
  ISharedClassAssignmentRepository,
  SharedClassAssignmentDetail,
} from '../../domain/repositories/shared-class-assignment.repository.js';
import type { ITeacherRepository } from '../../domain/repositories/teacher.repository.js';
import { SharedClassService } from './shared-class.service.js';

const owner = { id: 'teacher-owner', externalId: '100', name: 'Titular' };
const assignedTeacher = {
  id: 'teacher-2',
  externalId: '200',
  institutionalCode: 'T2',
  name: 'Profesor 2',
  email: 'profesor2@uat.edu.mx',
};
const sourceAssignment: GroupAssignmentDetail = {
  id: 'assignment-1',
  externalGroupId: '9900001',
  groupCode: 'Z',
  schoolCycleExternalId: '150',
  schoolCycleName: '2026 - 2 VERANO',
  classroom: 'LAB-01',
  educationLevel: 'LICENCIATURA',
  period: '2026 - 2 VERANO',
  schedule: {
    monday: [{ raw: '10:00-11:00', startTime: '10:00', endTime: '11:00' }],
    tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [],
  },
  firstSeenAt: new Date('2026-07-04T10:00:00.000Z'),
  lastSeenAt: new Date('2026-07-04T10:00:00.000Z'),
  teacher: owner,
  subject: { id: 'subject-1', externalId: '12:RC.SEED', code: 'RC.SEED', name: 'Clase compartida' },
  coordination: { id: 'coordination-1', externalId: '12', name: 'FI' },
};

describe('SharedClassService', () => {
  it('crea una asignacion compartida conservando la clase oficial como fuente', async () => {
    const create = vi.fn(async (data) => sharedAssignment(data));
    const service = buildService({ create });

    const response = await service.create({
      sourceAssignmentId: sourceAssignment.id,
      assignedTeacherId: assignedTeacher.id,
      schoolCycleYear: 2026,
      schoolCycleTerm: 1,
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      sourceAssignmentId: sourceAssignment.id,
      assignedTeacherId: assignedTeacher.id,
      schoolCycleYear: 2026,
      schoolCycleTerm: 1,
      active: true,
    }));
    expect(response.data.sourceAssignment.subject.name).toBe('Clase compartida');
  });

  it('entrega a app-profesor el contrato normalizado y marcado como compartido', async () => {
    const service = buildService({
      findActiveByTeacherIdentity: async () => [sharedAssignment({})],
    });

    const response = await service.listForAuthenticatedTeacher(assignedTeacher.email!);

    expect(response.data).toHaveLength(1);
    expect(response.data[0]).toMatchObject({
      id: '9900001',
      name: 'Clase compartida',
      groupLetter: 'Z',
      source: 'SHARED',
      isShared: true,
      sharedAssignmentId: 'shared-1',
      period: '2026 - 1 PRIMAVERA',
    });
  });

  it('rechaza compartir una clase con su propio titular', async () => {
    const service = buildService({}, owner.id);
    await expect(service.create({
      sourceAssignmentId: sourceAssignment.id,
      assignedTeacherId: owner.id,
      schoolCycleYear: 2026,
      schoolCycleTerm: 1,
    })).rejects.toMatchObject({ code: 'INVALID_SHARED_CLASS', statusCode: 409 });
  });
});

function buildService(
  overrides: Partial<ISharedClassAssignmentRepository> = {},
  teacherId = assignedTeacher.id,
) {
  const repository = {
    listOptions: async () => ({ teachers: [], assignments: [] }),
    findAll: async () => [],
    findById: async () => null,
    findActiveByTeacherIdentity: async () => [],
    create: async (data) => sharedAssignment(data),
    update: async (_id, data) => sharedAssignment(data),
    delete: async () => true,
    ...overrides,
  } as ISharedClassAssignmentRepository;
  const teachers = { findById: async () => ({ ...assignedTeacher, id: teacherId }) } as unknown as ITeacherRepository;
  const assignments = { findById: async () => sourceAssignment } as unknown as IGroupAssignmentRepository;
  return new SharedClassService(repository, teachers, assignments);
}

function sharedAssignment(overrides: object): SharedClassAssignmentDetail {
  return {
    id: 'shared-1',
    sourceAssignmentId: sourceAssignment.id,
    assignedTeacherId: assignedTeacher.id,
    schoolCycleYear: 2026,
    schoolCycleTerm: 1,
    active: true,
    notes: null,
    createdAt: new Date('2026-07-04T10:00:00.000Z'),
    updatedAt: new Date('2026-07-04T10:00:00.000Z'),
    sourceAssignment,
    assignedTeacher,
    ...overrides,
  } as SharedClassAssignmentDetail;
}
