import type { PrismaClient } from '@prisma/client';
import type { WeeklySchedule } from '../../../domain/entities/group.js';
import type { GroupAssignmentDetail } from '../../../domain/repositories/group-assignment.repository.js';
import type {
  ISharedClassAssignmentRepository,
  SharedClassAssignmentData,
  SharedClassAssignmentDetail,
  SharedClassOptions,
} from '../../../domain/repositories/shared-class-assignment.repository.js';

const teacherSelect = {
  id: true,
  externalId: true,
  institutionalCode: true,
  name: true,
  email: true,
} as const;

const sourceAssignmentInclude = {
  teacher: { select: { id: true, externalId: true, name: true } },
  subject: { select: { id: true, externalId: true, code: true, name: true } },
  coordination: { select: { id: true, externalId: true, name: true } },
} as const;

const detailInclude = {
  sourceAssignment: { include: sourceAssignmentInclude },
  assignedTeacher: { select: teacherSelect },
} as const;

export class PrismaSharedClassAssignmentRepository implements ISharedClassAssignmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listOptions(): Promise<SharedClassOptions> {
    const [teachers, assignments] = await this.prisma.$transaction([
      this.prisma.teacher.findMany({ select: teacherSelect, orderBy: { name: 'asc' } }),
      this.prisma.groupAssignment.findMany({
        include: sourceAssignmentInclude,
        orderBy: [{ schoolCycleExternalId: 'desc' }, { subject: { name: 'asc' } }],
        take: 1000,
      }),
    ]);
    return { teachers, assignments: assignments.map(toGroupAssignmentDetail) };
  }

  async findAll(): Promise<SharedClassAssignmentDetail[]> {
    const records = await this.prisma.sharedClassAssignment.findMany({
      include: detailInclude,
      orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }],
      take: 500,
    });
    return records.map(toDetail);
  }

  async findById(id: string): Promise<SharedClassAssignmentDetail | null> {
    const record = await this.prisma.sharedClassAssignment.findUnique({ where: { id }, include: detailInclude });
    return record ? toDetail(record) : null;
  }

  async findActiveByTeacherIdentity(identity: string, cycle?: { year: number; term: number }): Promise<SharedClassAssignmentDetail[]> {
    const normalized = identity.trim().toLowerCase();
    const records = await this.prisma.sharedClassAssignment.findMany({
      where: {
        active: true,
        ...(cycle ? { schoolCycleYear: cycle.year, schoolCycleTerm: cycle.term } : {}),
        assignedTeacher: {
          OR: [
            { email: { equals: normalized, mode: 'insensitive' } },
            { institutionalCode: { equals: identity.trim(), mode: 'insensitive' } },
            { externalId: identity.trim() },
          ],
        },
      },
      include: detailInclude,
      orderBy: { updatedAt: 'desc' },
    });
    return records.map(toDetail);
  }

  async create(data: SharedClassAssignmentData): Promise<SharedClassAssignmentDetail> {
    const record = await this.prisma.sharedClassAssignment.create({
      data: {
        sourceAssignmentId: data.sourceAssignmentId,
        assignedTeacherId: data.assignedTeacherId,
        schoolCycleYear: data.schoolCycleYear,
        schoolCycleTerm: data.schoolCycleTerm,
        active: data.active ?? true,
        notes: data.notes,
      },
      include: detailInclude,
    });
    return toDetail(record);
  }

  async update(id: string, data: Partial<SharedClassAssignmentData>): Promise<SharedClassAssignmentDetail> {
    const record = await this.prisma.sharedClassAssignment.update({
      where: { id },
      data,
      include: detailInclude,
    });
    return toDetail(record);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.prisma.sharedClassAssignment.deleteMany({ where: { id } });
    return result.count > 0;
  }
}

function toDetail(record: {
  id: string;
  sourceAssignmentId: string;
  assignedTeacherId: string;
  schoolCycleYear: number;
  schoolCycleTerm: number;
  active: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  sourceAssignment: Parameters<typeof toGroupAssignmentDetail>[0];
  assignedTeacher: SharedClassAssignmentDetail['assignedTeacher'];
}): SharedClassAssignmentDetail {
  return { ...record, sourceAssignment: toGroupAssignmentDetail(record.sourceAssignment) };
}

function toGroupAssignmentDetail(record: {
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
  teacher: GroupAssignmentDetail['teacher'];
  subject: GroupAssignmentDetail['subject'];
  coordination: GroupAssignmentDetail['coordination'];
}): GroupAssignmentDetail {
  return {
    ...record,
    schedule: (record.schedule ?? emptySchedule()) as WeeklySchedule,
  };
}

function emptySchedule(): WeeklySchedule {
  return { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] };
}
