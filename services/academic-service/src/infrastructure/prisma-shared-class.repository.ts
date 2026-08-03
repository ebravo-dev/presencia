import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '../generated/prisma/index.js';
import type {
  SharedClassActor,
  SharedClassAssignmentDetail,
  SharedClassInput,
  LegacySharedClassImportRecord,
  LegacyTeacherProfile,
  SharedClassRepository,
  SharedClassSourceAssignment,
  SharedClassTeacher,
} from '../domain/shared-class.js';
import { SharedClassDomainError } from '../domain/shared-class.js';

const sharedClassInclude = {
  group: { include: { teacher: true, cycle: true, subject: true, coordination: true } },
  assignedTeacher: true,
} as const;

type SharedClassRecord = Prisma.AcademicSharedClassAssignmentGetPayload<{ include: typeof sharedClassInclude }>;

export class PrismaSharedClassRepository implements SharedClassRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listOptions(): Promise<{ teachers: SharedClassTeacher[]; assignments: SharedClassSourceAssignment[] }> {
    const [teachers, assignments] = await this.prisma.$transaction([
      this.prisma.teacherProfile.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.academicGroup.findMany({
        where: { active: true }, include: { teacher: true, cycle: true, subject: true, coordination: true },
        orderBy: [{ cycle: { externalId: 'desc' } }, { name: 'asc' }], take: 1_000,
      }),
    ]);
    return {
      teachers: teachers.map(teacherValue),
      assignments: assignments.map(groupValue),
    };
  }

  async list(): Promise<SharedClassAssignmentDetail[]> {
    const records = await this.prisma.academicSharedClassAssignment.findMany({
      include: sharedClassInclude, orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }], take: 500,
    });
    return records.map(sharedClassValue);
  }

  async listForTeacher(identity: string, cycle?: { year: number; term: number }): Promise<SharedClassAssignmentDetail[]> {
    const normalized = identity.trim();
    const records = await this.prisma.academicSharedClassAssignment.findMany({
      where: {
        active: true,
        ...(cycle ? { schoolCycleYear: cycle.year, schoolCycleTerm: cycle.term } : {}),
        assignedTeacher: {
          OR: [
            { externalId: normalized },
            { institutionalCode: { equals: normalized, mode: 'insensitive' } },
            { email: { equals: normalized, mode: 'insensitive' } },
          ],
        },
        group: { active: true },
      },
      include: sharedClassInclude,
      orderBy: { updatedAt: 'desc' },
    });
    return records.map(sharedClassValue);
  }

  async create(input: SharedClassInput & SharedClassActor): Promise<SharedClassAssignmentDetail> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const [group, teacher] = await Promise.all([
          transaction.academicGroup.findUnique({ where: { id: input.sourceAssignmentId }, include: { teacher: true } }),
          transaction.teacherProfile.findUnique({ where: { id: input.assignedTeacherId } }),
        ]);
        if (!group?.active) throw new SharedClassDomainError('SOURCE_ASSIGNMENT_NOT_FOUND', 'La clase de origen no existe o está inactiva.');
        if (!teacher) throw new SharedClassDomainError('ASSIGNED_TEACHER_NOT_FOUND', 'El profesor receptor no existe.');
        if (group.teacherId === teacher.id) {
          throw new SharedClassDomainError('INVALID_SHARED_CLASS', 'No puedes compartir una clase con su profesor titular.');
        }
        const record = await transaction.academicSharedClassAssignment.create({
          data: {
            groupId: group.id, assignedTeacherId: teacher.id,
            schoolCycleYear: input.schoolCycleYear, schoolCycleTerm: input.schoolCycleTerm,
            active: input.active ?? true, notes: input.notes ?? null, sourceObservedAt: new Date(),
          },
          include: sharedClassInclude,
        });
        await this.audit(transaction, record, 'CREATED', input, null);
        await this.event(transaction, record, input.correlationId);
        return sharedClassValue(record);
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      throw mapSharedClassError(error);
    }
  }

  async update(id: string, input: Partial<SharedClassInput> & SharedClassActor): Promise<SharedClassAssignmentDetail> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const current = await transaction.academicSharedClassAssignment.findUnique({
          where: { id }, include: sharedClassInclude,
        });
        if (!current) throw new SharedClassDomainError('SHARED_CLASS_NOT_FOUND', 'Asignación compartida no encontrada.');
        const groupId = input.sourceAssignmentId ?? current.groupId;
        const assignedTeacherId = input.assignedTeacherId ?? current.assignedTeacherId;
        const [group, teacher] = await Promise.all([
          transaction.academicGroup.findUnique({ where: { id: groupId } }),
          transaction.teacherProfile.findUnique({ where: { id: assignedTeacherId } }),
        ]);
        if (!group?.active) throw new SharedClassDomainError('SOURCE_ASSIGNMENT_NOT_FOUND', 'La clase de origen no existe o está inactiva.');
        if (!teacher) throw new SharedClassDomainError('ASSIGNED_TEACHER_NOT_FOUND', 'El profesor receptor no existe.');
        if (group.teacherId === teacher.id) {
          throw new SharedClassDomainError('INVALID_SHARED_CLASS', 'No puedes compartir una clase con su profesor titular.');
        }
        const record = await transaction.academicSharedClassAssignment.update({
          where: { id },
          data: {
            groupId, assignedTeacherId,
            ...(input.schoolCycleYear === undefined ? {} : { schoolCycleYear: input.schoolCycleYear }),
            ...(input.schoolCycleTerm === undefined ? {} : { schoolCycleTerm: input.schoolCycleTerm }),
            ...(input.active === undefined ? {} : { active: input.active }),
            ...(input.notes === undefined ? {} : { notes: input.notes }),
            sourceObservedAt: new Date(),
          },
          include: sharedClassInclude,
        });
        await this.audit(transaction, record, 'UPDATED', input, sharedClassJson(current));
        await this.event(transaction, record, input.correlationId);
        return sharedClassValue(record);
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      throw mapSharedClassError(error);
    }
  }

  async delete(id: string, actor: SharedClassActor): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.academicSharedClassAssignment.findUnique({
        where: { id }, include: sharedClassInclude,
      });
      if (!current) throw new SharedClassDomainError('SHARED_CLASS_NOT_FOUND', 'Asignación compartida no encontrada.');
      const deactivated = { ...current, active: false, sourceObservedAt: new Date() };
      await this.audit(transaction, current, 'DELETED', actor, sharedClassJson(current), null);
      await this.event(transaction, deactivated, actor.correlationId);
      await transaction.academicSharedClassAssignment.delete({ where: { id } });
    }, { isolationLevel: 'Serializable' });
  }

  async importLegacy(
    records: LegacySharedClassImportRecord[],
    actor: SharedClassActor,
  ): Promise<{ imported: number; updated: number; unchanged: number }> {
    const result = { imported: 0, updated: 0, unchanged: 0 };
    for (const source of records) {
      const outcome = await this.prisma.$transaction(async (transaction) => {
        const alreadyImported = await transaction.academicSharedClassAssignment.findUnique({
          where: { legacySourceId: source.legacySourceId },
          select: { sourceObservedAt: true },
        });
        if (alreadyImported && alreadyImported.sourceObservedAt.getTime() >= source.observedAt.getTime()) {
          return 'unchanged' as const;
        }
        const [primaryTeacher, assignedTeacher] = await Promise.all([
          upsertLegacyTeacher(transaction, source.sourceAssignment.teacher),
          upsertLegacyTeacher(transaction, source.assignedTeacher),
        ]);
        if (primaryTeacher.id === assignedTeacher.id) {
          throw new SharedClassDomainError('INVALID_SHARED_CLASS', 'No puedes compartir una clase con su profesor titular.');
        }
        const coordination = await transaction.academicCoordination.upsert({
          where: { externalId: source.sourceAssignment.coordination.externalId },
          create: {
            externalId: source.sourceAssignment.coordination.externalId,
            name: source.sourceAssignment.coordination.name,
            shortName: source.sourceAssignment.coordination.shortName,
          },
          update: {
            name: source.sourceAssignment.coordination.name,
            shortName: source.sourceAssignment.coordination.shortName,
          },
        });
        const subject = await transaction.academicSubject.upsert({
          where: { externalId: source.sourceAssignment.subject.externalId },
          create: {
            externalId: source.sourceAssignment.subject.externalId,
            code: source.sourceAssignment.subject.code,
            name: source.sourceAssignment.subject.name,
            coordinationId: coordination.id,
          },
          update: {
            code: source.sourceAssignment.subject.code,
            name: source.sourceAssignment.subject.name,
            coordinationId: coordination.id,
          },
        });
        const cycle = await transaction.academicCycle.upsert({
          where: { externalId: source.sourceAssignment.schoolCycleExternalId },
          create: {
            externalId: source.sourceAssignment.schoolCycleExternalId,
            name: source.sourceAssignment.schoolCycleName ?? source.sourceAssignment.schoolCycleExternalId,
            active: true,
          },
          update: {
            name: source.sourceAssignment.schoolCycleName ?? source.sourceAssignment.schoolCycleExternalId,
            active: true,
          },
        });
        const group = await transaction.academicGroup.upsert({
          where: { externalGroupId: source.sourceAssignment.externalGroupId },
          create: {
            externalGroupId: source.sourceAssignment.externalGroupId,
            code: source.sourceAssignment.subject.code ?? source.sourceAssignment.externalGroupId,
            groupLetter: source.sourceAssignment.groupCode ?? '',
            name: source.sourceAssignment.subject.name,
            level: source.sourceAssignment.educationLevel,
            classroom: source.sourceAssignment.classroom,
            period: source.sourceAssignment.period,
            schedule: json(source.sourceAssignment.schedule),
            active: true,
            teacherId: primaryTeacher.id,
            cycleId: cycle.id,
            subjectId: subject.id,
            coordinationId: coordination.id,
          },
          update: {
            code: source.sourceAssignment.subject.code ?? source.sourceAssignment.externalGroupId,
            groupLetter: source.sourceAssignment.groupCode ?? '',
            name: source.sourceAssignment.subject.name,
            level: source.sourceAssignment.educationLevel,
            classroom: source.sourceAssignment.classroom,
            period: source.sourceAssignment.period,
            schedule: json(source.sourceAssignment.schedule),
            active: true,
            teacherId: primaryTeacher.id,
            cycleId: cycle.id,
            subjectId: subject.id,
            coordinationId: coordination.id,
          },
        });
        const existing = await transaction.academicSharedClassAssignment.findFirst({
          where: {
            OR: [
              { legacySourceId: source.legacySourceId },
              {
                groupId: group.id,
                assignedTeacherId: assignedTeacher.id,
                schoolCycleYear: source.schoolCycleYear,
                schoolCycleTerm: source.schoolCycleTerm,
              },
            ],
          },
          include: sharedClassInclude,
        });
        if (existing && existing.sourceObservedAt.getTime() >= source.observedAt.getTime()) return 'unchanged' as const;

        const record = existing
          ? await transaction.academicSharedClassAssignment.update({
              where: { id: existing.id },
              data: {
                groupId: group.id,
                assignedTeacherId: assignedTeacher.id,
                schoolCycleYear: source.schoolCycleYear,
                schoolCycleTerm: source.schoolCycleTerm,
                active: source.active,
                notes: source.notes,
                legacySourceId: source.legacySourceId,
                sourceObservedAt: source.observedAt,
              },
              include: sharedClassInclude,
            })
          : await transaction.academicSharedClassAssignment.create({
              data: {
                groupId: group.id,
                assignedTeacherId: assignedTeacher.id,
                schoolCycleYear: source.schoolCycleYear,
                schoolCycleTerm: source.schoolCycleTerm,
                active: source.active,
                notes: source.notes,
                legacySourceId: source.legacySourceId,
                sourceObservedAt: source.observedAt,
                createdAt: source.createdAt,
              },
              include: sharedClassInclude,
            });
        await this.audit(transaction, record, 'IMPORTED', actor, existing ? sharedClassJson(existing) : null);
        await this.event(transaction, record, actor.correlationId);
        return existing ? 'updated' as const : 'imported' as const;
      }, { isolationLevel: 'Serializable' });
      result[outcome] += 1;
    }
    return result;
  }

  private async audit(
    transaction: Prisma.TransactionClient,
    record: SharedClassRecord,
    action: 'CREATED' | 'UPDATED' | 'DELETED' | 'IMPORTED',
    actor: SharedClassActor,
    previousValue: Prisma.InputJsonValue | null,
    newValue: Prisma.InputJsonValue | null = sharedClassJson(record),
  ) {
    await transaction.academicSharedClassAuditEvent.create({
      data: {
        assignmentId: record.id, action, actorIdentityId: actor.actorIdentityId, actorRole: actor.actorRole,
        reason: actor.reason, correlationId: actor.correlationId,
        previousValue: previousValue ?? Prisma.JsonNull, newValue: newValue ?? Prisma.JsonNull,
      },
    });
  }

  private async event(
    transaction: Prisma.TransactionClient,
    record: Pick<SharedClassRecord, 'id' | 'active' | 'schoolCycleYear' | 'schoolCycleTerm' | 'sourceObservedAt' | 'group' | 'assignedTeacher'>,
    correlationId: string,
  ) {
    await transaction.academicOutboxEvent.create({
      data: {
        eventId: randomUUID(), eventType: 'academic.substitution_changed.v1', aggregateId: record.id,
        correlationId, causationId: correlationId,
        payload: json({
          assignmentId: record.id, externalGroupId: record.group.externalGroupId,
          assignedProfessorExternalId: record.assignedTeacher.externalId,
          assignedProfessorInstitutionalCode: record.assignedTeacher.institutionalCode,
          assignedProfessorEmail: record.assignedTeacher.email,
          active: record.active, schoolCycleYear: record.schoolCycleYear, schoolCycleTerm: record.schoolCycleTerm,
          observedAt: record.sourceObservedAt.toISOString(),
        }),
      },
    });
  }
}

function upsertLegacyTeacher(transaction: Prisma.TransactionClient, teacher: LegacyTeacherProfile) {
  return transaction.teacherProfile.findUnique({ where: { externalId: teacher.externalId } }).then((existing) =>
    existing
      ? transaction.teacherProfile.update({
          where: { id: existing.id },
          data: {
            institutionalCode: existing.institutionalCode ?? teacher.institutionalCode,
            email: existing.email ?? teacher.email,
            lastAuthenticatedAt: existing.lastAuthenticatedAt > teacher.lastAuthenticatedAt
              ? existing.lastAuthenticatedAt
              : teacher.lastAuthenticatedAt,
          },
        })
      : transaction.teacherProfile.create({
          data: {
            externalId: teacher.externalId,
            institutionalCode: teacher.institutionalCode,
            name: teacher.name,
            email: teacher.email,
            lastAuthenticatedAt: teacher.lastAuthenticatedAt,
          },
        }),
  );
}

function sharedClassValue(record: SharedClassRecord): SharedClassAssignmentDetail {
  return {
    id: record.id, sourceAssignmentId: record.groupId, assignedTeacherId: record.assignedTeacherId,
    schoolCycleYear: record.schoolCycleYear, schoolCycleTerm: record.schoolCycleTerm,
    active: record.active, notes: record.notes, createdAt: record.createdAt, updatedAt: record.updatedAt,
    sourceAssignment: groupValue(record.group), assignedTeacher: teacherValue(record.assignedTeacher),
  };
}

function groupValue(group: SharedClassRecord['group']): SharedClassSourceAssignment {
  return {
    id: group.id, externalGroupId: group.externalGroupId, groupCode: group.groupLetter || null,
    schoolCycleExternalId: group.cycle.externalId, schoolCycleName: group.cycle.name,
    classroom: group.classroom, educationLevel: group.level, period: group.period, schedule: group.schedule,
    firstSeenAt: group.createdAt, lastSeenAt: group.updatedAt,
    teacher: { id: group.teacher.id, externalId: group.teacher.externalId, name: group.teacher.name },
    subject: { id: group.subject.id, externalId: group.subject.externalId, code: group.subject.code, name: group.subject.name },
    coordination: { id: group.coordination.id, externalId: group.coordination.externalId, name: group.coordination.name },
  };
}

function teacherValue(teacher: SharedClassRecord['assignedTeacher']): SharedClassTeacher {
  return {
    id: teacher.id, externalId: teacher.externalId, institutionalCode: teacher.institutionalCode,
    name: teacher.name, email: teacher.email,
  };
}

function sharedClassJson(record: SharedClassRecord): Prisma.InputJsonValue {
  return json({
    id: record.id, externalGroupId: record.group.externalGroupId,
    assignedProfessorExternalId: record.assignedTeacher.externalId,
    schoolCycleYear: record.schoolCycleYear, schoolCycleTerm: record.schoolCycleTerm,
    active: record.active, notes: record.notes,
  });
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function mapSharedClassError(error: unknown): unknown {
  if (error instanceof SharedClassDomainError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new SharedClassDomainError('SHARED_CLASS_EXISTS', 'Esa clase ya está compartida con el profesor.');
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
    return new SharedClassDomainError('SHARED_CLASS_REFERENCE_NOT_FOUND', 'La clase o el profesor ya no existe.');
  }
  return error;
}
