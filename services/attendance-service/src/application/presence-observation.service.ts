import { createHash } from 'node:crypto';
import type { AttendanceRepository } from '../domain/attendance.repository.js';
import type { StudentDetectionValue } from '../domain/presence-observation.js';
import { normalizeBeaconUuid } from '../domain/classroom-beacon.js';

type PresenceRepository = Pick<AttendanceRepository,
  'observeProfessorEntry' | 'observeProfessorExit' | 'observeStudentPresence'>;

interface BaseInput {
  professorExternalId: string;
  externalGroupId: string;
  trustedGroupAuthorization?: boolean;
  correlationId: string;
}

export class PresenceObservationService {
  constructor(
    private readonly repository: PresenceRepository,
    private readonly timeZone: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  observeProfessorEntry(input: BaseInput & {
    beaconUuid: string; clientDetectedAt?: string | null | undefined; rssi?: number | null | undefined;
    distance?: number | null | undefined; bluetoothAddress?: string | null | undefined;
  }) {
    const normalized = {
      ...normalizeActor(input), beaconUuid: normalizeBeaconUuid(input.beaconUuid),
      clientDetectedAt: parseClientDate(input.clientDetectedAt),
      rssi: input.rssi ?? null, distance: input.distance ?? null,
      bluetoothAddress: input.bluetoothAddress?.trim() || null,
    };
    const observedAt = this.now();
    const attendanceDate = dateInTimeZone(observedAt, this.timeZone);
    return this.repository.observeProfessorEntry({
      ...normalized, observedAt, attendanceDate,
      idempotencyKey: commandKey('PROFESSOR_ENTRY', { ...normalized, attendanceDate }),
    });
  }

  observeProfessorExit(input: BaseInput & { clientDetectedAt?: string | null | undefined }) {
    const normalized = { ...normalizeActor(input), clientDetectedAt: parseClientDate(input.clientDetectedAt) };
    const observedAt = this.now();
    const attendanceDate = dateInTimeZone(observedAt, this.timeZone);
    return this.repository.observeProfessorExit({
      ...normalized, observedAt, attendanceDate,
      idempotencyKey: commandKey('PROFESSOR_EXIT', { ...normalized, attendanceDate }),
    });
  }

  observeStudentPresence(input: BaseInput & { detections: ReadonlyArray<{
    beaconUuid: string; detectedAt?: string | null | undefined; rssi?: number | null | undefined;
    distance?: number | null | undefined; txPower?: number | null | undefined;
    bluetoothAddress?: string | null | undefined; major?: number | null | undefined; minor?: number | null | undefined;
  }> }) {
    const detections = input.detections.map((detection): StudentDetectionValue => ({
      beaconUuid: normalizeBeaconUuid(detection.beaconUuid),
      clientDetectedAt: parseClientDate(detection.detectedAt),
      rssi: detection.rssi ?? null, distance: detection.distance ?? null, txPower: detection.txPower ?? null,
      bluetoothAddress: detection.bluetoothAddress?.trim() || null,
      major: detection.major ?? null, minor: detection.minor ?? null,
    })).sort((left, right) => left.beaconUuid.localeCompare(right.beaconUuid));
    const normalized = { ...normalizeActor(input), detections };
    const observedAt = this.now();
    const attendanceDate = dateInTimeZone(observedAt, this.timeZone);
    return this.repository.observeStudentPresence({
      ...normalized, observedAt, attendanceDate,
      idempotencyKey: commandKey('STUDENT_DETECTIONS', { ...normalized, attendanceDate }),
    });
  }
}

function normalizeActor(input: BaseInput) {
  return {
    professorExternalId: input.professorExternalId.trim(),
    externalGroupId: input.externalGroupId.trim(),
    trustedGroupAuthorization: input.trustedGroupAuthorization === true,
    correlationId: input.correlationId,
  };
}

function parseClientDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function commandKey(operation: string, value: unknown): string {
  const { correlationId: _, ...stable } = value as Record<string, unknown>;
  const hash = createHash('sha256').update(JSON.stringify(stable)).digest('hex');
  return `presence:${operation}:${hash}`;
}

export function dateInTimeZone(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
