import type { PrismaClient } from '@prisma/client';
import type { Teacher } from '../../../domain/entities/teacher.js';
import type { ITeacherRepository, TeacherQuery, TeacherSummary } from '../../../domain/repositories/teacher.repository.js';

const assignmentProjection = {
  coordination: { select: { id: true, externalId: true, name: true } },
  subject: { select: { id: true } },
} as const;

export class PrismaTeacherRepository implements ITeacherRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsert(teacher: Teacher): Promise<Teacher & { id: string }> {
    const record = await this.prisma.teacher.upsert({
      where: { externalId: teacher.externalId },
      create: {
        externalId: teacher.externalId,
        institutionalCode: teacher.institutionalCode,
        name: teacher.name,
        email: teacher.email,
        lastAuthenticatedAt: teacher.lastAuthenticatedAt,
        lastHarvestedAt: teacher.lastHarvestedAt,
      },
      update: {
        institutionalCode: teacher.institutionalCode,
        name: teacher.name,
        email: teacher.email,
        lastAuthenticatedAt: teacher.lastAuthenticatedAt,
      },
    });

    return record;
  }

  async markHarvested(externalId: string, harvestedAt: Date): Promise<void> {
    await this.prisma.teacher.update({ where: { externalId }, data: { lastHarvestedAt: harvestedAt } });
  }

  async findAll(query: TeacherQuery): Promise<{ items: TeacherSummary[]; total: number }> {
    const where = {
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search } },
              { institutionalCode: { contains: query.search } },
              { email: { contains: query.search } },
            ],
          }
        : {}),
      ...(query.coordinationId ? { assignments: { some: { coordinationId: query.coordinationId } } } : {}),
    };
    const [records, total] = await this.prisma.$transaction([
      this.prisma.teacher.findMany({
        where,
        include: { assignments: { select: assignmentProjection } },
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.teacher.count({ where }),
    ]);

    return { items: records.map(toSummary), total };
  }

  async findById(id: string): Promise<TeacherSummary | null> {
    const record = await this.prisma.teacher.findUnique({
      where: { id },
      include: { assignments: { select: assignmentProjection } },
    });
    return record ? toSummary(record) : null;
  }

  count(): Promise<number> {
    return this.prisma.teacher.count();
  }
}

function toSummary(record: {
  id: string;
  externalId: string;
  institutionalCode: string | null;
  name: string;
  email: string | null;
  lastAuthenticatedAt: Date;
  lastHarvestedAt: Date | null;
  assignments: Array<{
    coordination: { id: string; externalId: string; name: string };
    subject: { id: string };
  }>;
}): TeacherSummary {
  const coordinations = new Map(record.assignments.map((item) => [item.coordination.id, item.coordination]));
  return {
    id: record.id,
    externalId: record.externalId,
    institutionalCode: record.institutionalCode,
    name: record.name,
    email: record.email,
    lastAuthenticatedAt: record.lastAuthenticatedAt,
    lastHarvestedAt: record.lastHarvestedAt,
    assignmentCount: record.assignments.length,
    subjectCount: new Set(record.assignments.map((item) => item.subject.id)).size,
    coordinations: [...coordinations.values()],
  };
}
