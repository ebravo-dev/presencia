import type { PrismaClient } from '@prisma/client';
import type { Coordination } from '../../../domain/entities/coordination.js';
import type { CoordinationSummary, ICoordinationRepository } from '../../../domain/repositories/coordination.repository.js';

export class PrismaCoordinationRepository implements ICoordinationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsert(coordination: Coordination): Promise<Coordination & { id: string }> {
    return this.prisma.coordination.upsert({
      where: { externalId: coordination.externalId },
      create: coordination,
      update: { name: coordination.name, shortName: coordination.shortName },
    });
  }

  async findAll(): Promise<CoordinationSummary[]> {
    const records = await this.prisma.coordination.findMany({
      include: {
        assignments: { select: { teacherId: true } },
        _count: { select: { subjects: true, assignments: true } },
      },
      orderBy: { name: 'asc' },
    });

    return records.map((record) => ({
      id: record.id,
      externalId: record.externalId,
      name: record.name,
      shortName: record.shortName,
      teacherCount: new Set(record.assignments.map((item) => item.teacherId)).size,
      subjectCount: record._count.subjects,
      assignmentCount: record._count.assignments,
    }));
  }

  count(): Promise<number> {
    return this.prisma.coordination.count();
  }
}
