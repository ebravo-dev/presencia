import { Prisma, type PrismaClient } from '@prisma/client';
import type { Group } from '../../../domain/entities/group.js';
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
        rawPayload: group.rawPayload as Prisma.InputJsonValue,
        ...relations,
      },
      update: {
        groupCode: group.groupCode,
        schoolCycleExternalId: group.schoolCycleExternalId,
        schoolCycleName: group.schoolCycleName,
        rawPayload: group.rawPayload as Prisma.InputJsonValue,
        ...relations,
      },
    });
  }

  async findByTeacherId(teacherId: string): Promise<GroupAssignmentDetail[]> {
    return this.prisma.groupAssignment.findMany({
      where: { teacherId },
      include: detailInclude,
      orderBy: [{ schoolCycleExternalId: 'desc' }, { subject: { name: 'asc' } }],
    });
  }

  count(): Promise<number> {
    return this.prisma.groupAssignment.count();
  }
}
