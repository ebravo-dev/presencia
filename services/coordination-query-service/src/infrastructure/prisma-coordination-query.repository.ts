import { Prisma, type PrismaClient } from '../generated/prisma/index.js';
import { normalizeAcademicSchedule } from '../domain/academic-schedule.js';
import type { CoordinationQueryRepository, TeacherListQuery } from '../domain/query.repository.js';
import type { ProjectionEvent } from '../domain/projection-event.js';

export class PrismaCoordinationQueryRepository implements CoordinationQueryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async project(event: ProjectionEvent, consumer: string): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const processed = await transaction.processedQueryEvent.findUnique({
        where: { eventId_consumer: { eventId: event.eventId, consumer } },
      });
      if (processed) return false;
      const observedAt = new Date(event.occurredAt);
      switch (event.eventType) {
        case 'academic.roster_updated.v1':
          await this.projectRoster(transaction, event.payload, observedAt);
          break;
        case 'academic.group_deactivated.v1':
          await transaction.groupProjection.updateMany({
            where: { externalGroupId: event.payload.externalGroupId, sourceObservedAt: { lte: observedAt } },
            data: { active: false, sourceObservedAt: observedAt, lastSeenAt: observedAt },
          });
          break;
        case 'attendance.recorded.v1':
        case 'attendance.corrected.v1':
          await this.projectAttendance(transaction, event.payload, observedAt);
          break;
        case 'uat.attendance_uploaded.v1':
        case 'uat.attendance_upload_failed.v1':
          await this.projectUploadResult(
            transaction,
            event.payload,
            event.eventType === 'uat.attendance_uploaded.v1' ? 'COMPLETED' : 'FAILED',
            observedAt,
          );
          break;
      }
      await transaction.processedQueryEvent.create({ data: { eventId: event.eventId, consumer } });
      return true;
    }, { isolationLevel: 'Serializable' });
  }

  private async projectRoster(
    transaction: Prisma.TransactionClient,
    payload: Extract<ProjectionEvent, { eventType: 'academic.roster_updated.v1' }>['payload'],
    observedAt: Date,
  ): Promise<void> {
    const currentGroup = await transaction.groupProjection.findUnique({
      where: { externalGroupId: payload.externalGroupId }, select: { sourceObservedAt: true },
    });
    if (currentGroup?.sourceObservedAt && currentGroup.sourceObservedAt > observedAt) return;
    const coordination = await transaction.coordinationProjection.upsert({
      where: { externalId: payload.coordination.externalId },
      create: {
        externalId: payload.coordination.externalId, name: payload.coordination.name,
        shortName: payload.coordination.shortName ?? null,
      },
      update: { name: payload.coordination.name, shortName: payload.coordination.shortName ?? null },
    });
    const existingTeacher = await transaction.teacherProjection.findUnique({ where: { externalId: payload.teacher.externalId } });
    const teacher = existingTeacher
      ? await transaction.teacherProjection.update({
        where: { id: existingTeacher.id },
        data: existingTeacher.lastHarvestedAt <= observedAt ? {
          institutionalCode: payload.teacher.institutionalCode ?? null, name: payload.teacher.name,
          email: payload.teacher.email ?? null, lastAuthenticatedAt: new Date(payload.teacher.lastAuthenticatedAt),
          lastHarvestedAt: observedAt,
        } : {},
      })
      : await transaction.teacherProjection.create({
        data: {
          externalId: payload.teacher.externalId, institutionalCode: payload.teacher.institutionalCode ?? null,
          name: payload.teacher.name, email: payload.teacher.email ?? null,
          lastAuthenticatedAt: new Date(payload.teacher.lastAuthenticatedAt), lastHarvestedAt: observedAt,
        },
      });
    const subject = await transaction.subjectProjection.upsert({
      where: { externalId: payload.subject.externalId },
      create: {
        externalId: payload.subject.externalId, code: payload.subject.code ?? null,
        name: payload.subject.name, coordinationId: coordination.id,
      },
      update: { code: payload.subject.code ?? null, name: payload.subject.name, coordinationId: coordination.id },
    });
    await transaction.groupProjection.upsert({
      where: { externalGroupId: payload.group.externalGroupId },
      create: {
        externalGroupId: payload.group.externalGroupId, code: payload.group.code,
        groupLetter: payload.group.groupLetter, name: payload.group.name, level: payload.group.level ?? null,
        classroom: payload.group.classroom ?? null, period: payload.group.period ?? null,
        schedule: json(payload.group.schedule),
        cycleExternalId: payload.cycle.externalId, cycleName: payload.cycle.name, active: true,
        teacherId: teacher.id, subjectId: subject.id, coordinationId: coordination.id,
        sourceObservedAt: observedAt, firstSeenAt: observedAt, lastSeenAt: observedAt,
      },
      update: {
        code: payload.group.code, groupLetter: payload.group.groupLetter, name: payload.group.name,
        level: payload.group.level ?? null, classroom: payload.group.classroom ?? null,
        period: payload.group.period ?? null,
        schedule: json(payload.group.schedule), cycleExternalId: payload.cycle.externalId,
        cycleName: payload.cycle.name, active: true, teacherId: teacher.id,
        subjectId: subject.id, coordinationId: coordination.id,
        sourceObservedAt: observedAt, lastSeenAt: observedAt,
      },
    });
  }

  private async projectAttendance(
    transaction: Prisma.TransactionClient,
    payload: Extract<ProjectionEvent, { eventType: 'attendance.recorded.v1' }>['payload'],
    observedAt: Date,
  ): Promise<void> {
    const current = await transaction.attendanceProjection.findUnique({
      where: { attendanceSessionId: payload.attendanceSessionId },
    });
    if (current && (current.version > payload.version || (current.version === payload.version && current.sourceObservedAt > observedAt))) return;
    const result = await transaction.attendanceUploadResultProjection.findUnique({
      where: { attendanceSessionId_version: { attendanceSessionId: payload.attendanceSessionId, version: payload.version } },
    });
    await transaction.attendanceProjection.upsert({
      where: { attendanceSessionId: payload.attendanceSessionId },
      create: {
        attendanceSessionId: payload.attendanceSessionId, externalGroupId: payload.externalGroupId,
        professorExternalId: payload.professorExternalId, date: date(payload.date),
        professorEntryAt: payload.professorEntryAt ? new Date(payload.professorEntryAt) : null,
        professorExitAt: payload.professorExitAt ? new Date(payload.professorExitAt) : null,
        actualClassroom: payload.actualClassroom ?? null,
        uploadStatus: payload.uploadStatus ?? result?.status ?? 'DRAFT',
        uploadError: payload.uploadError ?? result?.error ?? null,
        version: payload.version, entriesCount: payload.entriesCount ?? payload.entries?.length ?? 0, sourceObservedAt: observedAt,
      },
      update: {
        externalGroupId: payload.externalGroupId, professorExternalId: payload.professorExternalId,
        date: date(payload.date), professorEntryAt: payload.professorEntryAt ? new Date(payload.professorEntryAt) : null,
        professorExitAt: payload.professorExitAt ? new Date(payload.professorExitAt) : null,
        actualClassroom: payload.actualClassroom ?? null,
        uploadStatus: payload.uploadStatus ?? result?.status ?? 'DRAFT',
        uploadError: payload.uploadError ?? result?.error ?? null,
        version: payload.version, entriesCount: payload.entriesCount ?? payload.entries?.length ?? 0, sourceObservedAt: observedAt,
      },
    });
  }

  private async projectUploadResult(
    transaction: Prisma.TransactionClient,
    payload: Extract<ProjectionEvent, { eventType: 'uat.attendance_uploaded.v1' }>['payload'],
    status: 'COMPLETED' | 'FAILED',
    observedAt: Date,
  ): Promise<void> {
    const key = { attendanceSessionId: payload.attendanceSessionId, version: payload.version };
    const current = await transaction.attendanceUploadResultProjection.findUnique({
      where: { attendanceSessionId_version: key },
    });
    if (!current || current.sourceObservedAt <= observedAt) {
      await transaction.attendanceUploadResultProjection.upsert({
        where: { attendanceSessionId_version: key },
        create: { ...key, status, error: payload.error, sourceObservedAt: observedAt },
        update: { status, error: payload.error, sourceObservedAt: observedAt },
      });
    }
    await transaction.attendanceProjection.updateMany({
      where: { attendanceSessionId: payload.attendanceSessionId, version: payload.version },
      data: { uploadStatus: status, uploadError: payload.error },
    });
  }

  async overview() {
    const [teachers, subjects, coordinations, assignments, items] = await Promise.all([
      this.prisma.teacherProjection.count({ where: { groups: { some: { active: true } } } }),
      this.prisma.subjectProjection.count({ where: { groups: { some: { active: true } } } }),
      this.prisma.coordinationProjection.count({ where: { groups: { some: { active: true } } } }),
      this.prisma.groupProjection.count({ where: { active: true } }),
      this.coordinationItems(),
    ]);
    return { data: { counts: { teachers, subjects, coordinations, assignments }, coordinations: items }, meta: generatedMeta() };
  }

  async resetDemoData(): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.attendanceUploadResultProjection.deleteMany();
      await transaction.attendanceProjection.deleteMany();
      await transaction.groupProjection.deleteMany();
      await transaction.subjectProjection.deleteMany();
      await transaction.coordinationProjection.deleteMany();
      await transaction.teacherProjection.deleteMany();
      await transaction.processedQueryEvent.deleteMany();
    });
  }

  async coordinations() {
    return { data: await this.coordinationItems(), meta: generatedMeta() };
  }

  private async coordinationItems() {
    const items = await this.prisma.coordinationProjection.findMany({
      where: { groups: { some: { active: true } } },
      include: { groups: { where: { active: true }, select: { teacherId: true, subjectId: true } } },
      orderBy: { name: 'asc' },
    });
    return items.map((item) => ({
      id: item.id, externalId: item.externalId, name: item.name, shortName: item.shortName,
      teacherCount: new Set(item.groups.map(({ teacherId }) => teacherId)).size,
      subjectCount: new Set(item.groups.map(({ subjectId }) => subjectId)).size,
      assignmentCount: item.groups.length,
    }));
  }

  async teachers(query: TeacherListQuery) {
    const where: Prisma.TeacherProjectionWhereInput = {
      groups: { some: { active: true, ...(query.coordinationId ? { coordinationId: query.coordinationId } : {}) } },
      ...(query.search ? {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { institutionalCode: { contains: query.search, mode: 'insensitive' } },
        ],
      } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.teacherProjection.count({ where }),
      this.prisma.teacherProjection.findMany({
        where, orderBy: { name: 'asc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        include: { groups: { where: { active: true }, include: { coordination: true, subject: true } } },
      }),
    ]);
    return {
      data: items.map(teacherSummary),
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
    };
  }

  async teacherAssignments(teacherId: string) {
    const teacher = await this.prisma.teacherProjection.findUnique({
      where: { id: teacherId },
      include: { groups: { where: { active: true }, include: { teacher: true, subject: true, coordination: true }, orderBy: { name: 'asc' } } },
    });
    if (!teacher) return null;
    return {
      data: { teacher: teacherSummary(teacher), assignments: teacher.groups.map(assignmentView) },
      meta: generatedMeta(),
    };
  }

  async teacherReportSource(teacherId: string, startDate: string, endDate: string) {
    const teacher = await this.prisma.teacherProjection.findUnique({
      where: { id: teacherId },
      include: { groups: { where: { active: true }, include: { teacher: true, coordination: true, subject: true } } },
    });
    if (!teacher) return null;
    const records = await this.prisma.attendanceProjection.findMany({
      where: {
        professorExternalId: teacher.externalId,
        date: { gte: date(startDate), lte: date(endDate) },
      },
      orderBy: { date: 'asc' },
    });
    return {
      teacher: teacherSummary(teacher),
      groups: teacher.groups.map((group) => ({ ...assignmentView(group), attendanceRecords: records.filter((record) => record.externalGroupId === group.externalGroupId) })),
    };
  }
}

type TeacherWithGroups = Prisma.TeacherProjectionGetPayload<{
  include: { groups: { include: { coordination: true; subject: true } } };
}>;
type GroupWithRelations = Prisma.GroupProjectionGetPayload<{
  include: { teacher: true; subject: true; coordination: true };
}>;

function teacherSummary(teacher: TeacherWithGroups) {
  const groups = teacher.groups ?? [];
  return {
    id: teacher.id, externalId: teacher.externalId, institutionalCode: teacher.institutionalCode,
    name: teacher.name, email: teacher.email, lastAuthenticatedAt: teacher.lastAuthenticatedAt.toISOString(),
    lastHarvestedAt: teacher.lastHarvestedAt.toISOString(), assignmentCount: groups.length,
    subjectCount: new Set(groups.map((group) => group.subjectId)).size,
    coordinations: [...new Map(groups.map((group) => [group.coordination.id, {
      id: group.coordination.id, externalId: group.coordination.externalId, name: group.coordination.name,
    }])).values()],
  };
}

function assignmentView(group: GroupWithRelations) {
  return {
    id: group.id, externalGroupId: group.externalGroupId, groupCode: group.groupLetter || group.code || null,
    schoolCycleExternalId: group.cycleExternalId, schoolCycleName: group.cycleName,
    classroom: group.classroom, educationLevel: group.level, period: group.period,
    schedule: normalizeAcademicSchedule(group.schedule),
    firstSeenAt: group.firstSeenAt.toISOString(), lastSeenAt: group.lastSeenAt.toISOString(),
    teacher: { id: group.teacher.id, externalId: group.teacher.externalId, name: group.teacher.name },
    subject: { id: group.subject.id, externalId: group.subject.externalId, code: group.subject.code, name: group.subject.name },
    coordination: { id: group.coordination.id, externalId: group.coordination.externalId, name: group.coordination.name },
  };
}

function generatedMeta() { return { generatedAt: new Date().toISOString() }; }
function date(value: string) { return new Date(`${value}T00:00:00.000Z`); }
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
