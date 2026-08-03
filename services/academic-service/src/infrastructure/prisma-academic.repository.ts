import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '../generated/prisma/index.js';
import type { AcademicCoordinationProjectionSnapshot, AcademicRepository } from '../domain/academic.repository.js';
import type { AppliedAcademicSnapshot, ProfessorAcademicSnapshot } from '../domain/academic-snapshot.js';
import type { AppliedStudentAcademicSnapshot, StudentAcademicSnapshot } from '../domain/student-academic-snapshot.js';

export class PrismaAcademicRepository implements AcademicRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async applySnapshot(snapshot: ProfessorAcademicSnapshot): Promise<AppliedAcademicSnapshot> {
    return this.prisma.$transaction(async (transaction) => {
      const processed = await transaction.processedAcademicSnapshot.findUnique({ where: { snapshotId: snapshot.snapshotId } });
      if (processed) return this.snapshotResult(transaction, snapshot, true, 0);

      const teacher = await transaction.teacherProfile.upsert({
        where: { externalId: snapshot.teacher.externalId },
        create: {
          externalId: snapshot.teacher.externalId,
          institutionalCode: snapshot.teacher.institutionalCode ?? null,
          name: snapshot.teacher.name,
          email: snapshot.teacher.email ?? null,
          lastAuthenticatedAt: snapshot.teacher.authenticatedAt,
        },
        update: {
          institutionalCode: snapshot.teacher.institutionalCode ?? null,
          name: snapshot.teacher.name,
          email: snapshot.teacher.email ?? null,
          lastAuthenticatedAt: snapshot.teacher.authenticatedAt,
        },
      });
      const cycle = await transaction.academicCycle.upsert({
        where: { externalId: snapshot.cycle.externalId },
        create: { externalId: snapshot.cycle.externalId, name: snapshot.cycle.name, active: true },
        update: { name: snapshot.cycle.name, active: true },
      });
      const externalGroupIds = snapshot.groups.map(({ externalGroupId }) => externalGroupId);
      const staleGroups = await transaction.academicGroup.findMany({
        where: {
          teacherId: teacher.id,
          cycleId: cycle.id,
          active: true,
          ...(externalGroupIds.length > 0 ? { externalGroupId: { notIn: externalGroupIds } } : {}),
        },
        select: { id: true, externalGroupId: true },
      });
      if (staleGroups.length > 0) {
        await transaction.academicGroup.updateMany({
          where: { id: { in: staleGroups.map(({ id }) => id) } },
          data: { active: false },
        });
        await transaction.academicEnrollment.updateMany({
          where: { groupId: { in: staleGroups.map(({ id }) => id) } },
          data: { active: false },
        });
      }

      for (const groupSnapshot of snapshot.groups) {
        const coordination = await transaction.academicCoordination.upsert({
          where: { externalId: groupSnapshot.coordination.externalId },
          create: {
            externalId: groupSnapshot.coordination.externalId,
            name: groupSnapshot.coordination.name,
            shortName: groupSnapshot.coordination.shortName ?? null,
          },
          update: {
            name: groupSnapshot.coordination.name,
            shortName: groupSnapshot.coordination.shortName ?? null,
          },
        });
        const subject = await transaction.academicSubject.upsert({
          where: { externalId: groupSnapshot.subject.externalId },
          create: {
            externalId: groupSnapshot.subject.externalId,
            code: groupSnapshot.subject.code ?? null,
            name: groupSnapshot.subject.name,
            coordinationId: coordination.id,
          },
          update: {
            code: groupSnapshot.subject.code ?? null,
            name: groupSnapshot.subject.name,
            coordinationId: coordination.id,
          },
        });
        const group = await transaction.academicGroup.upsert({
          where: { externalGroupId: groupSnapshot.externalGroupId },
          create: {
            externalGroupId: groupSnapshot.externalGroupId,
            code: groupSnapshot.code,
            groupLetter: groupSnapshot.groupLetter,
            name: groupSnapshot.name,
            level: groupSnapshot.level ?? null,
            classroom: groupSnapshot.classroom ?? null,
            period: groupSnapshot.period ?? null,
            schedule: sanitizeJson(groupSnapshot.schedule),
            active: true,
            teacherId: teacher.id,
            cycleId: cycle.id,
            subjectId: subject.id,
            coordinationId: coordination.id,
          },
          update: {
            code: groupSnapshot.code,
            groupLetter: groupSnapshot.groupLetter,
            name: groupSnapshot.name,
            level: groupSnapshot.level ?? null,
            classroom: groupSnapshot.classroom ?? null,
            period: groupSnapshot.period ?? null,
            schedule: sanitizeJson(groupSnapshot.schedule),
            active: true,
            teacherId: teacher.id,
            cycleId: cycle.id,
            subjectId: subject.id,
            coordinationId: coordination.id,
          },
        });
        const matriculas = groupSnapshot.students.map(({ matricula }) => matricula.trim().toUpperCase());
        if (groupSnapshot.rosterAuthoritative) {
          await transaction.academicEnrollment.updateMany({
            where: {
              groupId: group.id,
              active: true,
              ...(matriculas.length > 0 ? { matricula: { notIn: matriculas } } : {}),
            },
            data: { active: false },
          });
        }
        for (const student of groupSnapshot.rosterAuthoritative ? groupSnapshot.students : []) {
          const matricula = student.matricula.trim().toUpperCase();
          await transaction.academicEnrollment.upsert({
            where: { groupId_matricula: { groupId: group.id, matricula } },
            create: {
              groupId: group.id, matricula, name: student.name.trim(),
              uatStudentId: student.uatStudentId ?? null, listNumber: student.listNumber ?? null, active: true,
            },
            update: {
              name: student.name.trim(), uatStudentId: student.uatStudentId ?? null,
              listNumber: student.listNumber ?? null, active: true,
            },
          });
        }
        await transaction.academicOutboxEvent.create({
          data: {
            eventId: randomUUID(),
            eventType: 'academic.roster_updated.v1',
            aggregateId: groupSnapshot.externalGroupId,
            correlationId: snapshot.correlationId,
            causationId: snapshot.causationId,
            payload: sanitizeJson({
              externalGroupId: groupSnapshot.externalGroupId,
              cycleExternalId: snapshot.cycle.externalId,
              activeStudents: groupSnapshot.rosterAuthoritative ? matriculas.length : null,
              rosterAuthoritative: groupSnapshot.rosterAuthoritative,
              professorExternalId: snapshot.teacher.externalId,
              groupName: groupSnapshot.name,
              groupLetter: groupSnapshot.groupLetter,
              schedule: groupSnapshot.schedule,
              students: groupSnapshot.rosterAuthoritative ? groupSnapshot.students : null,
              rosterVersion: snapshot.snapshotId,
              teacher: {
                externalId: snapshot.teacher.externalId,
                institutionalCode: snapshot.teacher.institutionalCode ?? null,
                name: snapshot.teacher.name,
                email: snapshot.teacher.email ?? null,
                lastAuthenticatedAt: snapshot.teacher.authenticatedAt.toISOString(),
              },
              cycle: snapshot.cycle,
              group: {
                externalGroupId: groupSnapshot.externalGroupId,
                code: groupSnapshot.code,
                groupLetter: groupSnapshot.groupLetter,
                name: groupSnapshot.name,
                level: groupSnapshot.level ?? null,
                classroom: groupSnapshot.classroom ?? null,
                period: groupSnapshot.period ?? null,
                schedule: groupSnapshot.schedule,
              },
              subject: groupSnapshot.subject,
              coordination: groupSnapshot.coordination,
            }),
          },
        });
      }

      for (const stale of staleGroups) {
        await transaction.academicOutboxEvent.create({
          data: {
            eventId: randomUUID(),
            eventType: 'academic.group_deactivated.v1',
            aggregateId: stale.externalGroupId,
            correlationId: snapshot.correlationId,
            causationId: snapshot.causationId,
            payload: sanitizeJson({ externalGroupId: stale.externalGroupId, cycleExternalId: snapshot.cycle.externalId }),
          },
        });
      }
      await transaction.processedAcademicSnapshot.create({ data: { snapshotId: snapshot.snapshotId } });
      return this.snapshotResult(transaction, snapshot, false, staleGroups.length);
    }, { isolationLevel: 'Serializable' });
  }

  async groupsForTeacher(externalTeacherId: string, cycleExternalId?: string): Promise<unknown[]> {
    return this.prisma.academicGroup.findMany({
      where: {
        teacher: { externalId: externalTeacherId },
        ...(cycleExternalId ? { cycle: { externalId: cycleExternalId } } : {}),
      },
      include: {
        cycle: true,
        subject: true,
        coordination: true,
        enrollments: { where: { active: true }, orderBy: { name: 'asc' } },
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async coordinationProjectionSnapshot(): Promise<AcademicCoordinationProjectionSnapshot[]> {
    const groups = await this.prisma.academicGroup.findMany({
      include: { teacher: true, cycle: true, subject: true, coordination: true },
      orderBy: { externalGroupId: 'asc' },
    });
    return groups.map((group) => ({
      externalGroupId: group.externalGroupId,
      active: group.active,
      observedAt: group.updatedAt,
      rosterVersion: `reconciliation:${group.updatedAt.toISOString()}`,
      teacher: {
        externalId: group.teacher.externalId,
        institutionalCode: group.teacher.institutionalCode,
        name: group.teacher.name,
        email: group.teacher.email,
        lastAuthenticatedAt: group.teacher.lastAuthenticatedAt,
      },
      cycle: { externalId: group.cycle.externalId, name: group.cycle.name },
      group: {
        externalGroupId: group.externalGroupId,
        code: group.code,
        groupLetter: group.groupLetter,
        name: group.name,
        level: group.level,
        classroom: group.classroom,
        period: group.period,
        schedule: group.schedule,
      },
      subject: { externalId: group.subject.externalId, code: group.subject.code, name: group.subject.name },
      coordination: {
        externalId: group.coordination.externalId,
        name: group.coordination.name,
        shortName: group.coordination.shortName,
      },
    }));
  }

  async applyStudentSnapshot(snapshot: StudentAcademicSnapshot): Promise<AppliedStudentAcademicSnapshot> {
    return this.prisma.$transaction(async (transaction) => {
      const processed = await transaction.processedAcademicSnapshot.findUnique({ where: { snapshotId: snapshot.snapshotId } });
      if (processed) return this.studentSnapshotResult(transaction, snapshot, true);

      const matricula = snapshot.student.matricula.trim().toUpperCase();
      const student = await transaction.studentAcademicProfile.upsert({
        where: { matricula },
        create: {
          matricula,
          displayName: snapshot.student.displayName,
          email: snapshot.student.email ?? null,
          planExternalId: snapshot.career.planExternalId,
          careerName: snapshot.career.name,
          coordinationExternalId: snapshot.career.coordinationExternalId ?? null,
          cycleExternalId: snapshot.cycle.externalId,
          cycleName: snapshot.cycle.name,
          lastSynchronizedAt: snapshot.synchronizedAt,
        },
        update: {
          displayName: snapshot.student.displayName,
          email: snapshot.student.email ?? null,
          planExternalId: snapshot.career.planExternalId,
          careerName: snapshot.career.name,
          coordinationExternalId: snapshot.career.coordinationExternalId ?? null,
          cycleExternalId: snapshot.cycle.externalId,
          cycleName: snapshot.cycle.name,
          lastSynchronizedAt: snapshot.synchronizedAt,
        },
      });
      const externalGroupIds = snapshot.schedule.map(({ externalGroupId }) => externalGroupId);
      await transaction.studentScheduleEntry.updateMany({
        where: {
          studentId: student.id,
          planExternalId: snapshot.career.planExternalId,
          cycleExternalId: snapshot.cycle.externalId,
          active: true,
          ...(externalGroupIds.length > 0 ? { externalGroupId: { notIn: externalGroupIds } } : {}),
        },
        data: { active: false },
      });
      for (const entry of snapshot.schedule) {
        await transaction.studentScheduleEntry.upsert({
          where: {
            studentId_planExternalId_cycleExternalId_externalGroupId: {
              studentId: student.id,
              planExternalId: snapshot.career.planExternalId,
              cycleExternalId: snapshot.cycle.externalId,
              externalGroupId: entry.externalGroupId,
            },
          },
          create: {
            studentId: student.id,
            planExternalId: snapshot.career.planExternalId,
            cycleExternalId: snapshot.cycle.externalId,
            externalGroupId: entry.externalGroupId,
            groupLetter: entry.groupLetter,
            subjectName: entry.subjectName,
            professorName: entry.professorName ?? null,
            classroom: entry.classroom ?? null,
            period: entry.period ?? null,
            credits: entry.credits ?? null,
            schedule: sanitizeJson(entry.schedule),
            active: true,
          },
          update: {
            groupLetter: entry.groupLetter,
            subjectName: entry.subjectName,
            professorName: entry.professorName ?? null,
            classroom: entry.classroom ?? null,
            period: entry.period ?? null,
            credits: entry.credits ?? null,
            schedule: sanitizeJson(entry.schedule),
            active: true,
          },
        });
      }
      await transaction.academicOutboxEvent.create({
        data: {
          eventId: randomUUID(), eventType: 'academic.student_schedule_updated.v1', aggregateId: matricula,
          correlationId: snapshot.correlationId, causationId: snapshot.causationId,
          payload: sanitizeJson({
            matricula, planExternalId: snapshot.career.planExternalId,
            cycleExternalId: snapshot.cycle.externalId, activeScheduleEntries: externalGroupIds.length,
          }),
        },
      });
      await transaction.processedAcademicSnapshot.create({ data: { snapshotId: snapshot.snapshotId } });
      return this.studentSnapshotResult(transaction, snapshot, false);
    }, { isolationLevel: 'Serializable' });
  }

  groupByExternalId(externalGroupId: string): Promise<unknown | null> {
    return this.prisma.academicGroup.findUnique({
      where: { externalGroupId },
      include: { cycle: true, subject: true, coordination: true, enrollments: { orderBy: { name: 'asc' } } },
    });
  }

  studentByMatricula(matricula: string): Promise<unknown | null> {
    return this.prisma.studentAcademicProfile.findUnique({
      where: { matricula: matricula.trim().toUpperCase() },
      include: { scheduleEntries: { where: { active: true }, orderBy: { subjectName: 'asc' } } },
    });
  }

  private async snapshotResult(
    transaction: Prisma.TransactionClient,
    snapshot: ProfessorAcademicSnapshot,
    duplicate: boolean,
    deactivatedGroups: number,
  ): Promise<AppliedAcademicSnapshot> {
    const [activeGroups, activeEnrollments] = await Promise.all([
      transaction.academicGroup.count({
        where: { teacher: { externalId: snapshot.teacher.externalId }, cycle: { externalId: snapshot.cycle.externalId }, active: true },
      }),
      transaction.academicEnrollment.count({
        where: {
          active: true,
          group: { teacher: { externalId: snapshot.teacher.externalId }, cycle: { externalId: snapshot.cycle.externalId } },
        },
      }),
    ]);
    return { snapshotId: snapshot.snapshotId, duplicate, activeGroups, activeEnrollments, deactivatedGroups };
  }

  private async studentSnapshotResult(
    transaction: Prisma.TransactionClient,
    snapshot: StudentAcademicSnapshot,
    duplicate: boolean,
  ): Promise<AppliedStudentAcademicSnapshot> {
    const student = await transaction.studentAcademicProfile.findUnique({
      where: { matricula: snapshot.student.matricula.trim().toUpperCase() },
      select: { id: true },
    });
    const activeScheduleEntries = student ? await transaction.studentScheduleEntry.count({
      where: {
        studentId: student.id,
        planExternalId: snapshot.career.planExternalId,
        cycleExternalId: snapshot.cycle.externalId,
        active: true,
      },
    }) : 0;
    return { snapshotId: snapshot.snapshotId, duplicate, activeScheduleEntries };
  }
}

function sanitizeJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
