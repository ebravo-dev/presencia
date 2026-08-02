import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient, type StudentDeviceBinding } from '../generated/prisma/index.js';
import type { AttendanceRepository } from '../domain/attendance.repository.js';
import {
  AttendanceDomainError,
  shouldApplyRosterSnapshot,
  type AttendanceRosterSnapshot,
  type CaptureAttendanceCommand,
  type CaptureAttendanceResult,
} from '../domain/attendance.js';
import {
  decideInitialBinding,
  type BindDeviceCommand,
  type BindDeviceResult,
  type DeviceBindingValue,
  type ReplaceDeviceBindingCommand,
} from '../domain/device-binding.js';

export class PrismaAttendanceRepository implements AttendanceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async applyRoster(snapshot: AttendanceRosterSnapshot): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.attendanceRosterGroup.findUnique({
        where: { externalGroupId: snapshot.externalGroupId },
        select: { rosterVersion: true, rosterObservedAt: true },
      });
      if (!shouldApplyRosterSnapshot(current, snapshot)) return;
      const group = await transaction.attendanceRosterGroup.upsert({
        where: { externalGroupId: snapshot.externalGroupId },
        create: {
          externalGroupId: snapshot.externalGroupId,
          uatGroupId: snapshot.uatGroupId ?? parsePositiveInteger(snapshot.externalGroupId),
          name: snapshot.name,
          groupLetter: snapshot.groupLetter,
          professorExternalId: snapshot.professorExternalId,
          schedule: json(snapshot.schedule),
          rosterVersion: snapshot.rosterVersion,
          rosterObservedAt: snapshot.rosterObservedAt,
          active: true,
        },
        update: {
          uatGroupId: snapshot.uatGroupId ?? parsePositiveInteger(snapshot.externalGroupId),
          name: snapshot.name,
          groupLetter: snapshot.groupLetter,
          professorExternalId: snapshot.professorExternalId,
          schedule: json(snapshot.schedule),
          rosterVersion: snapshot.rosterVersion,
          rosterObservedAt: snapshot.rosterObservedAt,
          active: true,
        },
      });
      if (!snapshot.rosterAuthoritative) return;
      const matriculas = snapshot.students.map(({ matricula }) => matricula.trim().toUpperCase());
      await transaction.attendanceRosterStudent.updateMany({
        where: {
          groupId: group.id,
          active: true,
          ...(matriculas.length > 0 ? { matricula: { notIn: matriculas } } : {}),
        },
        data: { active: false },
      });
      for (const student of snapshot.students) {
        const matricula = student.matricula.trim().toUpperCase();
        await transaction.attendanceRosterStudent.upsert({
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
    }, { isolationLevel: 'Serializable' });
  }

  async deactivateRoster(externalGroupId: string, rosterObservedAt: Date): Promise<void> {
    await this.prisma.attendanceRosterGroup.updateMany({
      where: { externalGroupId, rosterObservedAt: { lte: rosterObservedAt } },
      data: { active: false, rosterObservedAt },
    });
  }

  async markUploadResult(input: {
    attendanceSessionId: string; version: number; status: 'COMPLETED' | 'FAILED'; error?: string | null;
  }): Promise<boolean> {
    const updated = await this.prisma.attendanceSession.updateMany({
      where: { id: input.attendanceSessionId, version: input.version },
      data: {
        uploadStatus: input.status,
        uploadError: input.error ?? null,
        uploadedAt: input.status === 'COMPLETED' ? new Date() : null,
      },
    });
    return updated.count === 1;
  }

  async capture(command: CaptureAttendanceCommand, requestHash: string): Promise<CaptureAttendanceResult> {
    return this.withTransactionRetry(() => this.captureOnce(command, requestHash));
  }

  private async captureOnce(command: CaptureAttendanceCommand, requestHash: string): Promise<CaptureAttendanceResult> {
    return this.prisma.$transaction(async (transaction) => {
      const processed = await transaction.attendanceCommand.findUnique({ where: { idempotencyKey: command.idempotencyKey } });
      if (processed) {
        if (processed.operation !== 'CAPTURE_ATTENDANCE' || processed.requestHash !== requestHash) {
          throw new AttendanceDomainError('IDEMPOTENCY_KEY_REUSED', 'La clave de idempotencia ya se usó con otra solicitud.');
        }
        return { ...(processed.response as unknown as CaptureAttendanceResult), duplicate: true };
      }

      const group = await transaction.attendanceRosterGroup.findUnique({
        where: { externalGroupId: command.externalGroupId },
        include: {
          students: {
            where: {
              active: true,
              OR: [
                { matricula: { in: command.entries.flatMap(({ matricula }) => matricula ? [matricula] : []) } },
                { uatStudentId: { in: command.entries.flatMap(({ uatStudentId }) => uatStudentId ? [uatStudentId] : []) } },
              ],
            },
          },
        },
      });
      if (!group?.active) throw new AttendanceDomainError('ATTENDANCE_GROUP_NOT_FOUND', 'El grupo no existe o está inactivo.');
      if (group.professorExternalId !== command.professorExternalId) {
        throw new AttendanceDomainError('PROFESSOR_GROUP_FORBIDDEN', 'El profesor no es titular del grupo indicado.');
      }
      const rosterByMatricula = new Map(group.students.map((student) => [student.matricula, student]));
      const rosterByUatId = new Map(group.students.flatMap((student) => student.uatStudentId ? [[student.uatStudentId, student] as const] : []));
      const resolvedEntries = command.entries.map((entry) => ({
        roster: entry.matricula ? rosterByMatricula.get(entry.matricula) : rosterByUatId.get(entry.uatStudentId!),
        status: entry.status,
      }));
      if (resolvedEntries.some(({ roster }) => !roster)) {
        throw new AttendanceDomainError('STUDENT_OUTSIDE_ROSTER', 'Todos los alumnos deben pertenecer al roster activo del grupo.');
      }
      const resolvedMatriculas = resolvedEntries.map(({ roster }) => roster!.matricula);
      if (new Set(resolvedMatriculas).size !== resolvedMatriculas.length) {
        throw new AttendanceDomainError('DUPLICATE_MATRICULA', 'La captura contiene alumnos duplicados.');
      }
      const date = new Date(`${command.date}T00:00:00.000Z`);
      const existing = await transaction.attendanceSession.findUnique({ where: { groupId_date: { groupId: group.id, date } } });
      if (existing?.uploadStatus === 'PROCESSING') {
        throw new AttendanceDomainError('ATTENDANCE_UPLOAD_IN_PROGRESS', 'La asistencia se está publicando y no puede modificarse.');
      }
      const session = await transaction.attendanceSession.upsert({
        where: { groupId_date: { groupId: group.id, date } },
        create: {
          groupId: group.id, date, professorExternalId: command.professorExternalId,
          professorEntryAt: command.professorEntryAt ?? null, professorExitAt: command.professorExitAt ?? null,
          uploadStatus: 'PENDING', version: 1,
        },
        update: {
          professorExternalId: command.professorExternalId,
          ...(command.professorEntryAt && !existing?.professorEntryAt ? { professorEntryAt: command.professorEntryAt } : {}),
          ...(command.professorExitAt && !existing?.professorExitAt ? { professorExitAt: command.professorExitAt } : {}),
          uploadStatus: 'PENDING', uploadError: null, uploadedAt: null, version: { increment: 1 },
        },
      });
      const matriculas = resolvedMatriculas;
      await transaction.attendanceEntry.deleteMany({
        where: { sessionId: session.id, ...(matriculas.length > 0 ? { matricula: { notIn: matriculas } } : {}) },
      });
      for (const entry of resolvedEntries) {
        const matricula = entry.roster!.matricula;
        await transaction.attendanceEntry.upsert({
          where: { sessionId_matricula: { sessionId: session.id, matricula } },
          create: { sessionId: session.id, matricula, status: entry.status },
          update: { status: entry.status },
        });
      }
      const eventType = existing ? 'attendance.corrected.v1' : 'attendance.recorded.v1';
      const uploadPayload = {
        attendanceSessionId: session.id,
        externalGroupId: group.externalGroupId,
        uatGroupId: group.uatGroupId,
        date: command.date,
        professorExternalId: command.professorExternalId,
        uatSessionId: command.uatSessionId ?? null,
        entries: resolvedEntries.map((entry) => {
          const roster = entry.roster!;
          return {
            matricula: roster.matricula, status: entry.status,
            uatStudentId: roster.uatStudentId, listNumber: roster.listNumber,
          };
        }),
        version: session.version,
      };
      for (const [type, payload] of [
        [eventType, uploadPayload],
        ['attendance.upload_requested.v1', uploadPayload],
      ] as const) {
        await transaction.attendanceOutboxEvent.create({
          data: {
            eventId: randomUUID(), eventType: type, aggregateId: session.id,
            correlationId: command.correlationId, causationId: command.correlationId, payload: json(payload),
          },
        });
      }
      const response: CaptureAttendanceResult = {
        attendanceSessionId: session.id, externalGroupId: group.externalGroupId, date: command.date,
        entriesCount: command.entries.length, uploadStatus: session.uploadStatus,
        duplicate: false, version: session.version,
      };
      await transaction.attendanceCommand.create({
        data: {
          idempotencyKey: command.idempotencyKey, operation: 'CAPTURE_ATTENDANCE', requestHash,
          response: json(response),
        },
      });
      return response;
    }, { isolationLevel: 'Serializable' });
  }

  async bindInitial(command: BindDeviceCommand): Promise<BindDeviceResult> {
    return this.withTransactionRetry(() => this.bindInitialOnce(command));
  }

  private async bindInitialOnce(command: BindDeviceCommand): Promise<BindDeviceResult> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.studentDeviceBinding.findUnique({ where: { matricula: command.matricula } });
      const decision = decideInitialBinding(existing, command);
      if (decision === 'DUPLICATE' && existing) {
        return { binding: bindingValue(existing), created: false, duplicate: true };
      }
      if (decision === 'REJECT') {
        throw new AttendanceDomainError(
          'DEVICE_BINDING_CHANGE_REQUIRES_COORDINATOR',
          'La matrícula ya está vinculada; sólo coordinación puede cambiar su UUID.',
        );
      }
      if (decision === 'REBIND_AFTER_COORDINATOR_UNBIND') {
        await this.assertDeviceIdentifiersAvailable(transaction, command, existing!.id);
        const binding = await transaction.studentDeviceBinding.update({
          where: { id: existing!.id },
          data: { ...bindingData(command), active: true, bindingVersion: { increment: 1 } },
        });
        await this.auditBinding(transaction, binding, {
          action: 'REBOUND_AFTER_COORDINATOR_UNBIND', actorIdentityId: `student:${command.matricula}`,
          actorRole: 'STUDENT', reason: 'Revinculación posterior a una desvinculación autorizada por coordinación.',
          correlationId: command.correlationId, previousValue: bindingJson(existing!),
        });
        await this.deviceBindingEvent(transaction, binding, 'attendance.device_bound.v1', command.correlationId);
        return { binding: bindingValue(binding), created: false, duplicate: false };
      }
      await this.assertDeviceIdentifiersAvailable(transaction, command);
      const binding = await transaction.studentDeviceBinding.create({ data: bindingData(command) });
      await this.auditBinding(transaction, binding, {
        action: 'BOUND_AFTER_UAT_LOGIN', actorIdentityId: `student:${command.matricula}`,
        actorRole: 'STUDENT', reason: 'Vinculación inicial autorizada después de autenticación UAT.',
        correlationId: command.correlationId, previousValue: null,
      });
      await this.deviceBindingEvent(transaction, binding, 'attendance.device_bound.v1', command.correlationId);
      return { binding: bindingValue(binding), created: true, duplicate: false };
    }, { isolationLevel: 'Serializable' });
  }

  async replaceBinding(command: ReplaceDeviceBindingCommand): Promise<BindDeviceResult> {
    return this.withTransactionRetry(() => this.replaceBindingOnce(command));
  }

  private async replaceBindingOnce(command: ReplaceDeviceBindingCommand): Promise<BindDeviceResult> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.studentDeviceBinding.findUnique({ where: { matricula: command.matricula } });
      await this.assertDeviceIdentifiersAvailable(transaction, command, existing?.id);
      const binding = existing
        ? await transaction.studentDeviceBinding.update({
          where: { id: existing.id }, data: { ...bindingData(command), active: true, bindingVersion: { increment: 1 } },
        })
        : await transaction.studentDeviceBinding.create({ data: bindingData(command) });
      await this.auditBinding(transaction, binding, {
        action: existing ? 'REPLACED_BY_COORDINATOR' : 'BOUND_BY_COORDINATOR',
        actorIdentityId: command.actorIdentityId, actorRole: command.actorRole, reason: command.reason,
        correlationId: command.correlationId, previousValue: existing ? bindingJson(existing) : null,
      });
      await this.deviceBindingEvent(transaction, binding, 'attendance.device_bound.v1', command.correlationId);
      return { binding: bindingValue(binding), created: !existing, duplicate: false };
    }, { isolationLevel: 'Serializable' });
  }

  async unbind(command: {
    matricula: string; actorIdentityId: string; actorRole: 'COORDINATOR' | 'SUPER_USER'; reason: string; correlationId: string;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.studentDeviceBinding.findUnique({ where: { matricula: command.matricula } });
      if (!existing?.active) return false;
      const binding = await transaction.studentDeviceBinding.update({
        where: { id: existing.id }, data: { active: false, bindingVersion: { increment: 1 } },
      });
      await this.auditBinding(transaction, binding, {
        action: 'UNBOUND_BY_COORDINATOR', actorIdentityId: command.actorIdentityId,
        actorRole: command.actorRole, reason: command.reason, correlationId: command.correlationId,
        previousValue: bindingJson(existing),
      });
      await this.deviceBindingEvent(transaction, binding, 'attendance.device_unbound.v1', command.correlationId);
      return true;
    }, { isolationLevel: 'Serializable' });
  }

  async bindingByMatricula(matricula: string): Promise<DeviceBindingValue | null> {
    const binding = await this.prisma.studentDeviceBinding.findUnique({ where: { matricula: matricula.trim().toUpperCase() } });
    return binding ? bindingValue(binding) : null;
  }

  private async assertDeviceIdentifiersAvailable(
    transaction: Prisma.TransactionClient,
    command: BindDeviceCommand,
    ignoredBindingId?: string,
  ): Promise<void> {
    const owner = await transaction.studentDeviceBinding.findFirst({
      where: {
        OR: [
          { attendanceUuid: command.attendanceUuid },
          ...(command.deviceBindingId ? [{ deviceBindingId: command.deviceBindingId }] : []),
        ],
        ...(ignoredBindingId ? { id: { not: ignoredBindingId } } : {}),
      },
    });
    if (owner) throw new AttendanceDomainError('DEVICE_IDENTIFIER_ALREADY_BOUND', 'El identificador ya pertenece a otra matrícula.');
  }

  private async auditBinding(
    transaction: Prisma.TransactionClient,
    binding: StudentDeviceBinding,
    input: {
      action: string; actorIdentityId: string; actorRole: string; reason: string; correlationId: string;
      previousValue: Prisma.InputJsonValue | null;
    },
  ): Promise<void> {
    await transaction.deviceBindingAuditEvent.create({
      data: {
        bindingId: binding.id, matricula: binding.matricula, action: input.action,
        actorIdentityId: input.actorIdentityId, actorRole: input.actorRole, reason: input.reason,
        previousValue: input.previousValue ?? Prisma.JsonNull, newValue: bindingJson(binding), correlationId: input.correlationId,
      },
    });
  }

  private async deviceBindingEvent(
    transaction: Prisma.TransactionClient,
    binding: StudentDeviceBinding,
    eventType: 'attendance.device_bound.v1' | 'attendance.device_unbound.v1',
    correlationId: string,
  ): Promise<void> {
    await transaction.attendanceOutboxEvent.create({
      data: {
        eventId: randomUUID(), eventType, aggregateId: binding.matricula,
        correlationId, causationId: correlationId, payload: bindingJson(binding),
      },
    });
  }

  private async withTransactionRetry<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError
          && (error.code === 'P2002' || error.code === 'P2034');
        if (!retryable || attempt === 3) throw error;
      }
    }
    throw new Error('Unreachable transaction retry state');
  }
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parsePositiveInteger(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function bindingData(command: BindDeviceCommand) {
  return {
    matricula: command.matricula,
    attendanceUuid: command.attendanceUuid,
    deviceBindingId: command.deviceBindingId ?? null,
    platform: command.platform ?? null,
    deviceInfo: command.deviceInfo ?? null,
  };
}

function bindingJson(binding: StudentDeviceBinding): Prisma.InputJsonValue {
  return json({
    matricula: binding.matricula, attendanceUuid: binding.attendanceUuid,
    deviceBindingId: binding.deviceBindingId, platform: binding.platform,
    bindingVersion: binding.bindingVersion, active: binding.active,
  });
}

function bindingValue(binding: StudentDeviceBinding): DeviceBindingValue {
  return {
    id: binding.id, matricula: binding.matricula, attendanceUuid: binding.attendanceUuid,
    deviceBindingId: binding.deviceBindingId, platform: binding.platform, deviceInfo: binding.deviceInfo,
    bindingVersion: binding.bindingVersion, active: binding.active, updatedAt: binding.updatedAt,
  };
}
