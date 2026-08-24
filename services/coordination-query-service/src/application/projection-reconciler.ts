import { createHash } from 'node:crypto';
import type { CoordinationQueryRepository } from '../domain/query.repository.js';
import type { AcademicProjectionSnapshot, AttendanceProjectionSnapshot } from '../domain/reconciliation-snapshot.js';
import { parseProjectionEvent, type ProjectionEvent } from '../domain/projection-event.js';
import type { ProjectionSources } from '../infrastructure/projection-source.client.js';

const RECONCILIATION_CONSUMER = 'coordination-query.reconciliation.v1';

export interface ReconciliationLogger {
  info(bindings: object, message: string): void;
  error(bindings: object, message: string): void;
}

export class ProjectionReconciler {
  private timer: NodeJS.Timeout | undefined;
  private reconciling = false;
  private lastSucceededAt: Date | undefined;

  constructor(
    private readonly repository: CoordinationQueryRepository,
    private readonly sources: ProjectionSources,
    private readonly intervalMs: number,
    private readonly logger: ReconciliationLogger,
  ) {}

  async start(): Promise<void> {
    await this.reconcile();
    this.timer = setInterval(() => void this.reconcileSafely(), this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  isReady(): boolean { return this.lastSucceededAt !== undefined; }

  async reconcile(): Promise<{ academic: number; attendance: number }> {
    if (this.reconciling) return { academic: 0, attendance: 0 };
    this.reconciling = true;
    try {
      const [academic, attendance] = await Promise.all([this.sources.academic(), this.sources.attendance()]);
      for (const snapshot of academic) {
        await this.repository.project(academicEvent(snapshot), RECONCILIATION_CONSUMER);
      }
      for (const snapshot of attendance) {
        await this.repository.project(attendanceEvent(snapshot), RECONCILIATION_CONSUMER);
      }
      this.lastSucceededAt = new Date();
      this.logger.info({ academic: academic.length, attendance: attendance.length }, 'Coordination projections reconciled.');
      return { academic: academic.length, attendance: attendance.length };
    } finally {
      this.reconciling = false;
    }
  }

  private async reconcileSafely(): Promise<void> {
    try {
      await this.reconcile();
    } catch (error) {
      this.logger.error({ err: error }, 'Coordination projection reconciliation failed; the current read model remains available.');
    }
  }
}

function academicEvent(snapshot: AcademicProjectionSnapshot): ProjectionEvent {
  if (!snapshot.active) {
    return parseProjectionEvent(envelope(snapshot, 'academic.group_deactivated.v1', {
      externalGroupId: snapshot.externalGroupId,
    }));
  }
  return parseProjectionEvent(envelope(snapshot, 'academic.roster_updated.v1', {
    externalGroupId: snapshot.externalGroupId,
    rosterVersion: snapshot.rosterVersion,
    teacher: snapshot.teacher,
    cycle: snapshot.cycle,
    group: snapshot.group,
    subject: snapshot.subject,
    coordination: snapshot.coordination,
  }));
}

function attendanceEvent(snapshot: AttendanceProjectionSnapshot): ProjectionEvent {
  return parseProjectionEvent(envelope(snapshot, 'attendance.corrected.v1', {
    attendanceSessionId: snapshot.attendanceSessionId,
    externalGroupId: snapshot.externalGroupId,
    professorExternalId: snapshot.professorExternalId,
    date: snapshot.date,
    professorEntryAt: snapshot.professorEntryAt,
    professorExitAt: snapshot.professorExitAt,
    actualClassroom: snapshot.actualClassroom ?? null,
    entriesCount: snapshot.entriesCount,
    uploadStatus: snapshot.uploadStatus,
    uploadError: snapshot.uploadError,
    version: snapshot.version,
  }, snapshot.attendanceSessionId));
}

function envelope(
  snapshot: { externalGroupId: string; observedAt: string },
  eventType: ProjectionEvent['eventType'],
  payload: Record<string, unknown>,
  aggregateId = snapshot.externalGroupId,
) {
  return {
    eventId: stableUuid(`${eventType}:${aggregateId}:${snapshot.observedAt}`),
    eventType,
    occurredAt: snapshot.observedAt,
    correlationId: `reconciliation:${aggregateId}`,
    causationId: `reconciliation:${aggregateId}`,
    producer: 'coordination-query-reconciler', aggregateId, schemaVersion: 1, payload,
  };
}

function stableUuid(value: string): string {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
