import type { PrismaClient } from '@prisma/client';
import type { Subject } from '../../../domain/entities/subject.js';
import type { ISubjectRepository } from '../../../domain/repositories/subject.repository.js';

export class PrismaSubjectRepository implements ISubjectRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsert(subject: Subject): Promise<Subject & { id: string }> {
    const record = await this.prisma.subject.upsert({
      where: { externalId: subject.externalId },
      create: {
        externalId: subject.externalId,
        code: subject.code,
        name: subject.name,
        coordination: { connect: { externalId: subject.coordinationExternalId } },
      },
      update: {
        code: subject.code,
        name: subject.name,
        coordination: { connect: { externalId: subject.coordinationExternalId } },
      },
      include: { coordination: { select: { externalId: true } } },
    });

    return {
      id: record.id,
      externalId: record.externalId,
      code: record.code,
      name: record.name,
      coordinationExternalId: record.coordination.externalId,
    };
  }

  count(): Promise<number> {
    return this.prisma.subject.count();
  }
}
