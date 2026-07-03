import { Prisma, type PrismaClient } from '@prisma/client';
import type { Group } from '../../../domain/entities/group.js';
import type { WeeklySchedule } from '../../../domain/entities/group.js';
import type { GroupAssignmentDetail, IGroupAssignmentRepository } from '../../../domain/repositories/group-assignment.repository.js';

const detailInclude = {
  teacher: { select: { id: true, externalId: true, name: true } },
  subject: { select: { id: true, externalId: true, code: true, name: true } },
  coordination: { select: { id: true, externalId: true, name: true } },
} as const;

export class PrismaGroupAssignmentRepository implements IGroupAssignmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsert(group: Group): Promise<void> {
    const relations = {
      teacher: { connect: { externalId: group.teacherExternalId } },
      subject: { connect: { externalId: group.subjectExternalId } },
      coordination: { connect: { externalId: group.coordinationExternalId } },
    };
    await this.prisma.groupAssignment.upsert({
      where: { externalGroupId: group.externalGroupId },
      create: {
        externalGroupId: group.externalGroupId,
        groupCode: group.groupCode,
        schoolCycleExternalId: group.schoolCycleExternalId,
        schoolCycleName: group.schoolCycleName,
        classroom: group.classroom,
        educationLevel: group.educationLevel,
        period: group.period,
        schedule: group.schedule as unknown as Prisma.InputJsonValue,
        rawPayload: group.rawPayload as Prisma.InputJsonValue,
        ...relations,
      },
      update: {
        groupCode: group.groupCode,
        schoolCycleExternalId: group.schoolCycleExternalId,
        schoolCycleName: group.schoolCycleName,
        classroom: group.classroom,
        educationLevel: group.educationLevel,
        period: group.period,
        schedule: group.schedule as unknown as Prisma.InputJsonValue,
        rawPayload: group.rawPayload as Prisma.InputJsonValue,
        ...relations,
      },
    });
  }

  async findByTeacherId(teacherId: string): Promise<GroupAssignmentDetail[]> {
    const records = await this.prisma.groupAssignment.findMany({
      where: { teacherId },
      include: detailInclude,
      orderBy: [{ schoolCycleExternalId: 'desc' }, { subject: { name: 'asc' } }],
    });
    return records.map((record) => ({
      ...record,
      schedule: (record.schedule ?? emptySchedule()) as unknown as WeeklySchedule,
    }));
  }

  count(): Promise<number> {
    return this.prisma.groupAssignment.count();
  }
}

function emptySchedule(): WeeklySchedule {
  return { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] };
}
