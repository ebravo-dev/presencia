import { randomUUID } from 'node:crypto';
import { Prisma, type ClassroomBeacon, type PrismaClient, type StudentDeviceBinding } from '../generated/prisma/index.js';
import type { AttendanceCoordinationProjectionSnapshot, AttendanceRepository } from '../domain/attendance.repository.js';
import {
  AttendanceDomainError,
  shouldApplyGroupAccessGrant,
  shouldApplyRosterSnapshot,
  type AcademicGroupAccessGrantInput,
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
import {
  ClassroomBeaconDomainError,
  normalizeClassroomKey,
  type BeaconActor,
  type ClassroomBeaconValue,
  type ImportClassroomBeaconsCommand,
  type SaveClassroomBeaconCommand,
  type UpdateClassroomBeaconCommand,
} from '../domain/classroom-beacon.js';
import type {
  ProfessorEntryObservationCommand,
  ProfessorExitObservationCommand,
  ProfessorPresenceObservationResult,
  PresenceActor,
  StudentPresenceObservationCommand,
  StudentPresenceObservationResult,
} from '../domain/presence-observation.js';

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
          professorName: snapshot.professorName ?? snapshot.professorExternalId,
          professorEmail: snapshot.professorEmail?.trim().toLowerCase() ?? null,
          classroom: snapshot.classroom ?? null,
          period: snapshot.period ?? null,
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
          professorName: snapshot.professorName ?? snapshot.professorExternalId,
          professorEmail: snapshot.professorEmail?.trim().toLowerCase() ?? null,
          classroom: snapshot.classroom ?? null,
          period: snapshot.period ?? null,
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

  async applyGroupAccessGrant(grant: AcademicGroupAccessGrantInput): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.academicGroupAccessGrant.findUnique({
        where: { assignmentId: grant.assignmentId },
        select: { observedAt: true },
      });
      if (!shouldApplyGroupAccessGrant(current, grant)) return;
      await transaction.academicGroupAccessGrant.upsert({
        where: { assignmentId: grant.assignmentId },
        create: {
          assignmentId: grant.assignmentId,
          externalGroupId: grant.externalGroupId,
          professorExternalId: grant.professorExternalId,
          professorInstitutionalCode: grant.professorInstitutionalCode?.trim() || null,
          professorEmail: grant.professorEmail?.trim().toLowerCase() || null,
          schoolCycleYear: grant.schoolCycleYear,
          schoolCycleTerm: grant.schoolCycleTerm,
          active: grant.active,
          observedAt: grant.observedAt,
        },
        update: {
          externalGroupId: grant.externalGroupId,
          professorExternalId: grant.professorExternalId,
          professorInstitutionalCode: grant.professorInstitutionalCode?.trim() || null,
          professorEmail: grant.professorEmail?.trim().toLowerCase() || null,
          schoolCycleYear: grant.schoolCycleYear,
          schoolCycleTerm: grant.schoolCycleTerm,
          active: grant.active,
          observedAt: grant.observedAt,
        },
      });
    }, { isolationLevel: 'Serializable' });
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

  async coordinationProjectionSnapshot(): Promise<AttendanceCoordinationProjectionSnapshot[]> {
    const sessions = await this.prisma.attendanceSession.findMany({
      include: { group: { select: { externalGroupId: true } }, _count: { select: { entries: true } } },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });
    return sessions.map((session) => ({
      attendanceSessionId: session.id,
      externalGroupId: session.group.externalGroupId,
      professorExternalId: session.professorExternalId,
      date: session.date.toISOString().slice(0, 10),
      professorEntryAt: session.professorEntryAt,
      professorExitAt: session.professorExitAt,
      entriesCount: session._count.entries,
      uploadStatus: session.uploadStatus,
      uploadError: session.uploadError,
      version: session.version,
      observedAt: session.updatedAt,
    }));
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
      const delegated = group.professorExternalId !== command.professorExternalId;
      if (delegated && !(await this.hasActiveGroupAccess(transaction, group.externalGroupId, command.professorExternalId))) {
        throw new AttendanceDomainError('PROFESSOR_GROUP_FORBIDDEN', 'El profesor no es titular del grupo indicado.');
      }
      const uploadStatus = delegated || command.skipExternalUpload ? 'SKIPPED' as const : 'PENDING' as const;
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
          finalizedAt: new Date(), uploadStatus, version: 1,
        },
        update: {
          professorExternalId: command.professorExternalId,
          finalizedAt: new Date(), uploadStatus, uploadError: null, uploadedAt: null, version: { increment: 1 },
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
        professorEntryAt: session.professorEntryAt?.toISOString() ?? null,
        professorExitAt: session.professorExitAt?.toISOString() ?? null,
        entries: resolvedEntries.map((entry) => {
          const roster = entry.roster!;
          return {
            matricula: roster.matricula, status: entry.status,
            uatStudentId: roster.uatStudentId, listNumber: roster.listNumber,
          };
        }),
        version: session.version,
      };
      await transaction.attendanceOutboxEvent.create({
        data: {
          eventId: randomUUID(), eventType, aggregateId: session.id,
          correlationId: command.correlationId, causationId: command.correlationId, payload: json(uploadPayload),
        },
      });
      const response: CaptureAttendanceResult = {
        attendanceSessionId: session.id, externalGroupId: group.externalGroupId, date: command.date,
        entriesCount: command.entries.length, uploadStatus,
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

  async listClassroomBeacons(): Promise<ClassroomBeaconValue[]> {
    return this.prisma.classroomBeacon.findMany({ orderBy: { classroom: 'asc' } });
  }

  async createClassroomBeacon(command: SaveClassroomBeaconCommand): Promise<ClassroomBeaconValue> {
    return this.withTransactionRetry(() => this.prisma.$transaction(async (transaction) => {
      await this.assertBeaconIdentifiersAvailable(transaction, command.uuid, command.classroomKey);
      const beacon = await transaction.classroomBeacon.create({
        data: { uuid: command.uuid, classroom: command.classroom, classroomKey: command.classroomKey },
      });
      await this.auditBeacon(transaction, beacon, 'CREATED', command, null);
      return beacon;
    }, { isolationLevel: 'Serializable' })).catch((error: unknown) => { throw mapBeaconConstraintError(error); });
  }

  async updateClassroomBeacon(command: UpdateClassroomBeaconCommand): Promise<ClassroomBeaconValue> {
    return this.withTransactionRetry(() => this.prisma.$transaction(async (transaction) => {
      const current = await transaction.classroomBeacon.findUnique({ where: { id: command.id } });
      if (!current) throw new ClassroomBeaconDomainError('BEACON_NOT_FOUND', 'Beacon no encontrado.');
      const uuid = command.uuid ?? current.uuid;
      const classroom = command.classroom ?? current.classroom;
      const classroomKey = command.classroomKey ?? current.classroomKey;
      await this.assertBeaconIdentifiersAvailable(transaction, uuid, classroomKey, current.id);
      const beacon = await transaction.classroomBeacon.update({
        where: { id: current.id }, data: { uuid, classroom, classroomKey },
      });
      await this.auditBeacon(transaction, beacon, 'UPDATED', command, beaconJson(current));
      return beacon;
    }, { isolationLevel: 'Serializable' })).catch((error: unknown) => { throw mapBeaconConstraintError(error); });
  }

  async deleteClassroomBeacon(id: string, actor: BeaconActor): Promise<void> {
    await this.withTransactionRetry(() => this.prisma.$transaction(async (transaction) => {
      const current = await transaction.classroomBeacon.findUnique({ where: { id } });
      if (!current) throw new ClassroomBeaconDomainError('BEACON_NOT_FOUND', 'Beacon no encontrado.');
      await this.auditBeacon(transaction, current, 'DELETED', actor, beaconJson(current), null);
      await transaction.classroomBeacon.delete({ where: { id } });
    }, { isolationLevel: 'Serializable' }));
  }

  async importClassroomBeacons(command: ImportClassroomBeaconsCommand): Promise<{ imported: number; unchanged: number }> {
    return this.withTransactionRetry(() => this.prisma.$transaction(async (transaction) => {
      let imported = 0;
      let unchanged = 0;
      for (const input of command.beacons) {
        const [byUuid, byClassroom] = await Promise.all([
          transaction.classroomBeacon.findUnique({ where: { uuid: input.uuid } }),
          transaction.classroomBeacon.findUnique({ where: { classroomKey: input.classroomKey } }),
        ]);
        if (byClassroom && byClassroom.uuid !== input.uuid) {
          throw new ClassroomBeaconDomainError(
            'CLASSROOM_BEACON_EXISTS',
            `El salón ${input.classroom} ya está asociado con otro beacon.`,
          );
        }
        if (byUuid && byUuid.classroomKey !== input.classroomKey) {
          throw new ClassroomBeaconDomainError(
            'BEACON_UUID_EXISTS',
            `El UUID ${input.uuid} ya está asociado con otro salón.`,
          );
        }
        if (byUuid) {
          unchanged += 1;
          continue;
        }
        const beacon = await transaction.classroomBeacon.create({ data: input });
        await this.auditBeacon(transaction, beacon, 'IMPORTED_FROM_LEGACY', command, null);
        imported += 1;
      }
      return { imported, unchanged };
    }, { isolationLevel: 'Serializable' })).catch((error: unknown) => { throw mapBeaconConstraintError(error); });
  }

  async resolveClassroomBeaconsForProfessor(input: {
    professorExternalId?: string;
    professorEmail?: string;
    classrooms: Array<{ classroom: string; classroomKey: string }>;
  }): Promise<{ data: ClassroomBeaconValue[]; missing: string[] }> {
    const grantIdentities = [input.professorExternalId, input.professorEmail]
      .flatMap((value) => value?.trim() ? [value.trim()] : []);
    const grants = grantIdentities.length === 0 ? [] : await this.prisma.academicGroupAccessGrant.findMany({
      where: {
        active: true,
        OR: grantIdentities.flatMap((identity) => [
          { professorExternalId: identity },
          { professorInstitutionalCode: { equals: identity, mode: 'insensitive' as const } },
          { professorEmail: { equals: identity, mode: 'insensitive' as const } },
        ]),
      },
      select: { externalGroupId: true },
    });
    const grantedGroupIds = [...new Set(grants.map(({ externalGroupId }) => externalGroupId))];
    const groups = await this.prisma.attendanceRosterGroup.findMany({
      where: {
        active: true,
        classroom: { not: null },
        OR: [
          ...(input.professorExternalId ? [{ professorExternalId: input.professorExternalId }] : []),
          ...(input.professorEmail ? [{ professorEmail: input.professorEmail }] : []),
          ...(grantedGroupIds.length > 0 ? [{ externalGroupId: { in: grantedGroupIds } }] : []),
        ],
      },
      select: { classroom: true },
    });
    const authorizedKeys = new Set(groups.flatMap(({ classroom }) => classroom ? [normalizeClassroomKey(classroom)] : []));
    const requested = input.classrooms.filter(({ classroomKey }) => authorizedKeys.has(classroomKey));
    return this.resolveAuthorizedClassroomBeacons(requested);
  }

  async resolveAuthorizedClassroomBeacons(
    requested: Array<{ classroom: string; classroomKey: string }>,
  ): Promise<{ data: ClassroomBeaconValue[]; missing: string[] }> {
    const beacons = requested.length === 0 ? [] : await this.prisma.classroomBeacon.findMany({
      where: { classroomKey: { in: requested.map(({ classroomKey }) => classroomKey) } },
      orderBy: { classroom: 'asc' },
    });
    const found = new Set(beacons.map(({ classroomKey }) => classroomKey));
    return { data: beacons, missing: requested.filter(({ classroomKey }) => !found.has(classroomKey)).map(({ classroom }) => classroom) };
  }

  async observeProfessorEntry(command: ProfessorEntryObservationCommand): Promise<ProfessorPresenceObservationResult> {
    return this.withTransactionRetry(() => this.prisma.$transaction(async (transaction) => {
      const duplicate = await this.processedPresenceCommand<ProfessorPresenceObservationResult>(transaction, command, 'PROFESSOR_ENTRY');
      if (duplicate) return duplicate;
      const group = await this.authorizedPresenceGroup(transaction, command);
      const classroomKey = group.classroom ? normalizeClassroomKey(group.classroom) : '';
      const classroomBeacon = classroomKey
        ? await transaction.classroomBeacon.findUnique({ where: { classroomKey } })
        : null;
      if (!classroomBeacon) {
        throw new AttendanceDomainError('CLASSROOM_BEACON_NOT_CONFIGURED', `No hay beacon asignado al salón ${group.classroom ?? ''}.`);
      }
      if (classroomBeacon.uuid !== command.beaconUuid) {
        throw new AttendanceDomainError('ROOM_BEACON_MISMATCH', 'El beacon detectado no corresponde al salón del grupo.');
      }
      const date = attendanceDate(command.attendanceDate);
      const existing = await transaction.attendanceSession.findUnique({
        where: { groupId_date: { groupId: group.id, date } }, include: { _count: { select: { entries: true } } },
      });
      if (existing?.professorEntryAt) {
        const result = professorPresenceResult(existing, group.externalGroupId, true);
        await this.recordPresenceCommand(transaction, command, 'PROFESSOR_ENTRY', result);
        return result;
      }
      const session = await transaction.attendanceSession.upsert({
        where: { groupId_date: { groupId: group.id, date } },
        create: {
          groupId: group.id, date, professorExternalId: presenceProfessorExternalId(group, command),
          professorEntryAt: command.observedAt, roomBeaconUuid: command.beaconUuid,
          roomBeaconRssi: command.rssi ?? null, roomBeaconDistance: command.distance ?? null,
          roomBeaconAddress: command.bluetoothAddress ?? null,
        },
        update: {
          professorEntryAt: command.observedAt, roomBeaconUuid: command.beaconUuid,
          roomBeaconRssi: command.rssi ?? null, roomBeaconDistance: command.distance ?? null,
          roomBeaconAddress: command.bluetoothAddress ?? null,
          ...(!existing?.finalizedAt ? { version: { increment: 1 } } : {}),
        },
        include: { _count: { select: { entries: true } } },
      });
      await this.attendanceProjectionEvent(transaction, session, group.externalGroupId, existing ? 'attendance.corrected.v1' : 'attendance.recorded.v1', command.correlationId);
      const result = professorPresenceResult(session, group.externalGroupId, false);
      await this.recordPresenceCommand(transaction, command, 'PROFESSOR_ENTRY', result);
      return result;
    }, { isolationLevel: 'Serializable' }));
  }

  async observeProfessorExit(command: ProfessorExitObservationCommand): Promise<ProfessorPresenceObservationResult> {
    return this.withTransactionRetry(() => this.prisma.$transaction(async (transaction) => {
      const duplicate = await this.processedPresenceCommand<ProfessorPresenceObservationResult>(transaction, command, 'PROFESSOR_EXIT');
      if (duplicate) return duplicate;
      const group = await this.authorizedPresenceGroup(transaction, command);
      const date = attendanceDate(command.attendanceDate);
      const existing = await transaction.attendanceSession.findUnique({
        where: { groupId_date: { groupId: group.id, date } }, include: { _count: { select: { entries: true } } },
      });
      if (existing?.professorExitAt) {
        const result = professorPresenceResult(existing, group.externalGroupId, true);
        await this.recordPresenceCommand(transaction, command, 'PROFESSOR_EXIT', result);
        return result;
      }
      const session = await transaction.attendanceSession.upsert({
        where: { groupId_date: { groupId: group.id, date } },
        create: {
          groupId: group.id, date, professorExternalId: presenceProfessorExternalId(group, command),
          professorExitAt: command.observedAt,
        },
        update: {
          professorExitAt: command.observedAt,
          ...(!existing?.finalizedAt ? { version: { increment: 1 } } : {}),
        },
        include: { _count: { select: { entries: true } } },
      });
      await this.attendanceProjectionEvent(transaction, session, group.externalGroupId, existing ? 'attendance.corrected.v1' : 'attendance.recorded.v1', command.correlationId);
      const result = professorPresenceResult(session, group.externalGroupId, false);
      await this.recordPresenceCommand(transaction, command, 'PROFESSOR_EXIT', result);
      return result;
    }, { isolationLevel: 'Serializable' }));
  }

  async observeStudentPresence(command: StudentPresenceObservationCommand): Promise<StudentPresenceObservationResult> {
    return this.withTransactionRetry(() => this.prisma.$transaction(async (transaction) => {
      const duplicate = await this.processedPresenceCommand<StudentPresenceObservationResult>(transaction, command, 'STUDENT_DETECTIONS');
      if (duplicate) return duplicate;
      const group = await this.authorizedPresenceGroup(transaction, command);
      const students = await transaction.attendanceRosterStudent.findMany({
        where: { groupId: group.id, active: true }, select: { id: true, matricula: true },
      });
      const bindings = await transaction.studentDeviceBinding.findMany({
        where: { active: true, matricula: { in: students.map(({ matricula }) => matricula) } },
        select: { matricula: true, attendanceUuid: true },
      });
      const studentByMatricula = new Map(students.map((student) => [student.matricula, student]));
      const matriculaByUuid = new Map(bindings.map(({ matricula, attendanceUuid }) => [attendanceUuid.toLowerCase(), matricula]));
      const matchedByMatricula = new Map<string, { studentId: string; detection: StudentPresenceObservationCommand['detections'][number] }>();
      for (const detection of command.detections) {
        const matricula = matriculaByUuid.get(detection.beaconUuid);
        const student = matricula ? studentByMatricula.get(matricula) : undefined;
        if (student) matchedByMatricula.set(matricula!, { studentId: student.id, detection });
      }
      if (matchedByMatricula.size === 0) {
        const result: StudentPresenceObservationResult = {
          attendanceSessionId: null, externalGroupId: group.externalGroupId, date: command.attendanceDate,
          matchedCount: 0, matched: [], duplicate: false, version: null,
        };
        await this.recordPresenceCommand(transaction, command, 'STUDENT_DETECTIONS', result);
        return result;
      }
      const date = attendanceDate(command.attendanceDate);
      const existing = await transaction.attendanceSession.findUnique({
        where: { groupId_date: { groupId: group.id, date } },
      });
      const session = await transaction.attendanceSession.upsert({
        where: { groupId_date: { groupId: group.id, date } },
        create: { groupId: group.id, date, professorExternalId: presenceProfessorExternalId(group, command) },
        update: { ...(!existing?.finalizedAt ? { version: { increment: 1 } } : {}) },
      });
      const matched: StudentPresenceObservationResult['matched'][number][] = [];
      for (const [matricula, { studentId, detection }] of matchedByMatricula) {
        if (!existing?.finalizedAt) {
          await transaction.attendanceEntry.upsert({
            where: { sessionId_matricula: { sessionId: session.id, matricula } },
            create: { sessionId: session.id, matricula, status: 'PRESENT' },
            update: { status: 'PRESENT' },
          });
        }
        await transaction.studentPresenceDetection.upsert({
          where: { sessionId_matricula: { sessionId: session.id, matricula } },
          create: {
            sessionId: session.id, matricula, beaconUuid: detection.beaconUuid,
            firstDetectedAt: command.observedAt, lastDetectedAt: command.observedAt,
            clientDetectedAt: detection.clientDetectedAt ?? null, rssi: detection.rssi ?? null,
            distance: detection.distance ?? null, txPower: detection.txPower ?? null,
            bluetoothAddress: detection.bluetoothAddress ?? null, major: detection.major ?? null, minor: detection.minor ?? null,
          },
          update: {
            beaconUuid: detection.beaconUuid, lastDetectedAt: command.observedAt,
            clientDetectedAt: detection.clientDetectedAt ?? null, rssi: detection.rssi ?? null,
            distance: detection.distance ?? null, txPower: detection.txPower ?? null,
            bluetoothAddress: detection.bluetoothAddress ?? null, major: detection.major ?? null, minor: detection.minor ?? null,
          },
        });
        matched.push({ studentId, matricula, beaconUuid: detection.beaconUuid, detectedAt: command.observedAt.toISOString() });
      }
      if (!existing?.finalizedAt) {
        const withCount = await transaction.attendanceSession.findUniqueOrThrow({
          where: { id: session.id }, include: { _count: { select: { entries: true } } },
        });
        await this.attendanceProjectionEvent(transaction, withCount, group.externalGroupId, existing ? 'attendance.corrected.v1' : 'attendance.recorded.v1', command.correlationId);
      }
      const result: StudentPresenceObservationResult = {
        attendanceSessionId: session.id, externalGroupId: group.externalGroupId, date: command.attendanceDate,
        matchedCount: matched.length, matched, duplicate: false, version: session.version,
      };
      await this.recordPresenceCommand(transaction, command, 'STUDENT_DETECTIONS', result);
      return result;
    }, { isolationLevel: 'Serializable' }));
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

  async resolveDeviceBindings(input: {
    professorExternalId: string;
    matriculas: string[];
  }): Promise<{ data: DeviceBindingValue[]; missing: string[] }> {
    const requested = [...new Set(input.matriculas.map((value) => value.trim().toUpperCase()).filter(Boolean))];
    if (requested.length === 0) return { data: [], missing: [] };
    const grants = await this.prisma.academicGroupAccessGrant.findMany({
      where: {
        active: true,
        OR: [
          { professorExternalId: input.professorExternalId },
          { professorInstitutionalCode: { equals: input.professorExternalId, mode: 'insensitive' } },
          { professorEmail: { equals: input.professorExternalId, mode: 'insensitive' } },
        ],
      },
      select: { externalGroupId: true },
    });
    const grantedGroupIds = [...new Set(grants.map(({ externalGroupId }) => externalGroupId))];
    const authorizedStudents = await this.prisma.attendanceRosterStudent.findMany({
      where: {
        active: true,
        matricula: { in: requested },
        group: {
          active: true,
          OR: [
            { professorExternalId: input.professorExternalId },
            ...(grantedGroupIds.length > 0 ? [{ externalGroupId: { in: grantedGroupIds } }] : []),
          ],
        },
      },
      select: { matricula: true },
    });
    const authorized = [...new Set(authorizedStudents.map(({ matricula }) => matricula))];
    const bindings = authorized.length === 0
      ? []
      : await this.prisma.studentDeviceBinding.findMany({
        where: { active: true, matricula: { in: authorized } },
        orderBy: { matricula: 'asc' },
      });
    const found = new Set(bindings.map(({ matricula }) => matricula));
    return {
      data: bindings.map(bindingValue),
      missing: authorized.filter((matricula) => !found.has(matricula)),
    };
  }

  async listDeviceBindings(query?: string, limit = 500): Promise<unknown[]> {
    const normalizedQuery = query?.trim().toUpperCase();
    const bindings = await this.prisma.studentDeviceBinding.findMany({
      where: {
        active: true,
        ...(normalizedQuery ? { matricula: { contains: normalizedQuery } } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    const students = bindings.length === 0 ? [] : await this.prisma.attendanceRosterStudent.findMany({
      where: { active: true, matricula: { in: bindings.map(({ matricula }) => matricula) }, group: { active: true } },
      include: { group: true },
      orderBy: { name: 'asc' },
    });
    const studentsByMatricula = new Map<string, typeof students>();
    for (const student of students) {
      const existing = studentsByMatricula.get(student.matricula) ?? [];
      existing.push(student);
      studentsByMatricula.set(student.matricula, existing);
    }
    return bindings.map((binding) => ({
      ...bindingValue(binding),
      createdAt: binding.createdAt,
      students: (studentsByMatricula.get(binding.matricula) ?? []).map((student) => ({
        id: student.id, matricula: student.matricula, name: student.name,
        group: {
          id: student.group.id, externalGroupId: student.group.externalGroupId,
          name: student.group.name, groupLetter: student.group.groupLetter,
          classroom: student.group.classroom,
          professor: {
            id: student.group.professorExternalId,
            externalId: student.group.professorExternalId,
            name: student.group.professorName || student.group.professorExternalId,
          },
        },
      })),
    }));
  }

  async bindingInfrastructureSummary(): Promise<{ count: number; recentBindings: unknown[] }> {
    const [count, recentBindings] = await Promise.all([
      this.prisma.studentDeviceBinding.count({ where: { active: true } }),
      this.listDeviceBindings(undefined, 6),
    ]);
    return { count, recentBindings };
  }

  async infrastructureSummary(): Promise<{
    counts: { beacons: number; studentDeviceBindings: number; studentBleAttendances: number };
    recentBindings: unknown[];
    recentBeacons: ClassroomBeaconValue[];
  }> {
    const [beacons, studentDeviceBindings, studentBleAttendances, recentBindings, recentBeacons] = await Promise.all([
      this.prisma.classroomBeacon.count(),
      this.prisma.studentDeviceBinding.count({ where: { active: true } }),
      this.prisma.studentPresenceDetection.count(),
      this.listDeviceBindings(undefined, 6),
      this.prisma.classroomBeacon.findMany({ orderBy: { updatedAt: 'desc' }, take: 6 }),
    ]);
    return {
      counts: { beacons, studentDeviceBindings, studentBleAttendances },
      recentBindings,
      recentBeacons,
    };
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

  private async authorizedPresenceGroup(transaction: Prisma.TransactionClient, command: PresenceActor) {
    const group = await transaction.attendanceRosterGroup.findUnique({
      where: { externalGroupId: command.externalGroupId },
      select: {
        id: true, externalGroupId: true, professorExternalId: true, classroom: true, active: true,
      },
    });
    if (!group?.active) {
      throw new AttendanceDomainError('ATTENDANCE_GROUP_NOT_FOUND', 'El grupo no existe o está inactivo.');
    }
    if (
      !command.trustedGroupAuthorization
      && group.professorExternalId !== command.professorExternalId
      && !(await this.hasActiveGroupAccess(transaction, group.externalGroupId, command.professorExternalId))
    ) {
      throw new AttendanceDomainError('PROFESSOR_GROUP_FORBIDDEN', 'El profesor no está autorizado para el grupo indicado.');
    }
    return group;
  }

  private async hasActiveGroupAccess(
    transaction: Prisma.TransactionClient,
    externalGroupId: string,
    professorIdentity: string,
  ): Promise<boolean> {
    const identity = professorIdentity.trim();
    if (!identity) return false;
    const grant = await transaction.academicGroupAccessGrant.findFirst({
      where: {
        externalGroupId,
        active: true,
        OR: [
          { professorExternalId: identity },
          { professorInstitutionalCode: { equals: identity, mode: 'insensitive' } },
          { professorEmail: { equals: identity, mode: 'insensitive' } },
        ],
      },
      select: { assignmentId: true },
    });
    return grant !== null;
  }

  private async processedPresenceCommand<TResult extends { duplicate: boolean }>(
    transaction: Prisma.TransactionClient,
    command: PresenceActor,
    operation: 'PROFESSOR_ENTRY' | 'PROFESSOR_EXIT' | 'STUDENT_DETECTIONS',
  ): Promise<TResult | null> {
    const processed = await transaction.attendanceCommand.findUnique({ where: { idempotencyKey: command.idempotencyKey } });
    if (!processed) return null;
    if (processed.operation !== operation || processed.requestHash !== command.idempotencyKey) {
      throw new AttendanceDomainError('IDEMPOTENCY_KEY_REUSED', 'La clave de idempotencia ya se usó con otra solicitud.');
    }
    return { ...(processed.response as unknown as TResult), duplicate: true };
  }

  private async recordPresenceCommand(
    transaction: Prisma.TransactionClient,
    command: PresenceActor,
    operation: 'PROFESSOR_ENTRY' | 'PROFESSOR_EXIT' | 'STUDENT_DETECTIONS',
    response: ProfessorPresenceObservationResult | StudentPresenceObservationResult,
  ): Promise<void> {
    await transaction.attendanceCommand.create({
      data: {
        idempotencyKey: command.idempotencyKey, operation, requestHash: command.idempotencyKey,
        response: json(response),
      },
    });
  }

  private async attendanceProjectionEvent(
    transaction: Prisma.TransactionClient,
    session: {
      id: string; date: Date; professorExternalId: string; professorEntryAt: Date | null; professorExitAt: Date | null;
      uploadStatus: 'DRAFT' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'SKIPPED'; uploadError: string | null; version: number;
      _count: { entries: number };
    },
    externalGroupId: string,
    eventType: 'attendance.recorded.v1' | 'attendance.corrected.v1',
    correlationId: string,
  ): Promise<void> {
    await transaction.attendanceOutboxEvent.create({
      data: {
        eventId: randomUUID(), eventType, aggregateId: session.id,
        correlationId, causationId: correlationId,
        payload: json({
          attendanceSessionId: session.id, externalGroupId,
          professorExternalId: session.professorExternalId,
          date: session.date.toISOString().slice(0, 10),
          professorEntryAt: session.professorEntryAt?.toISOString() ?? null,
          professorExitAt: session.professorExitAt?.toISOString() ?? null,
          entriesCount: session._count.entries, uploadStatus: session.uploadStatus,
          uploadError: session.uploadError, version: session.version,
        }),
      },
    });
  }

  private async assertBeaconIdentifiersAvailable(
    transaction: Prisma.TransactionClient,
    uuid: string,
    classroomKey: string,
    excludeId?: string,
  ): Promise<void> {
    const conflict = await transaction.classroomBeacon.findFirst({
      where: {
        OR: [{ uuid }, { classroomKey }],
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
    if (!conflict) return;
    if (conflict.uuid === uuid) {
      throw new ClassroomBeaconDomainError('BEACON_UUID_EXISTS', 'Ya existe un beacon con ese UUID.');
    }
    throw new ClassroomBeaconDomainError('CLASSROOM_BEACON_EXISTS', 'Ya existe un beacon asignado a ese salón.');
  }

  private async auditBeacon(
    transaction: Prisma.TransactionClient,
    beacon: ClassroomBeacon,
    action: string,
    actor: BeaconActor,
    previousValue: Prisma.InputJsonValue | null,
    newValue: Prisma.InputJsonValue | null = beaconJson(beacon),
  ): Promise<void> {
    await transaction.classroomBeaconAuditEvent.create({
      data: {
        beaconId: beacon.id, action, actorIdentityId: actor.actorIdentityId, actorRole: actor.actorRole,
        reason: actor.reason, correlationId: actor.correlationId,
        previousValue: previousValue ?? Prisma.JsonNull, newValue: newValue ?? Prisma.JsonNull,
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

function beaconJson(beacon: ClassroomBeacon): Prisma.InputJsonValue {
  return json({ id: beacon.id, uuid: beacon.uuid, classroom: beacon.classroom, classroomKey: beacon.classroomKey });
}

function mapBeaconConstraintError(error: unknown): unknown {
  if (error instanceof ClassroomBeaconDomainError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : String(error.meta?.target ?? '');
    if (target.includes('uuid')) {
      return new ClassroomBeaconDomainError('BEACON_UUID_EXISTS', 'Ya existe un beacon con ese UUID.');
    }
    return new ClassroomBeaconDomainError('CLASSROOM_BEACON_EXISTS', 'Ya existe un beacon asignado a ese salón.');
  }
  return error;
}

function attendanceDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function professorPresenceResult(
  session: {
    id: string; date: Date; professorEntryAt: Date | null; professorExitAt: Date | null; version: number;
  },
  externalGroupId: string,
  duplicate: boolean,
): ProfessorPresenceObservationResult {
  return {
    attendanceSessionId: session.id, externalGroupId, date: session.date.toISOString().slice(0, 10),
    professorEntryAt: session.professorEntryAt?.toISOString() ?? null,
    professorExitAt: session.professorExitAt?.toISOString() ?? null,
    duplicate, version: session.version,
  };
}

function presenceProfessorExternalId(
  group: { professorExternalId: string },
  command: PresenceActor,
): string {
  return command.trustedGroupAuthorization ? group.professorExternalId : command.professorExternalId;
}
