export type BeaconActorRole = 'COORDINATOR' | 'SUPER_USER' | 'SYSTEM';

export interface ClassroomBeaconValue {
  readonly id: string;
  readonly uuid: string;
  readonly classroom: string;
  readonly classroomKey: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface BeaconActor {
  readonly actorIdentityId: string;
  readonly actorRole: BeaconActorRole;
  readonly reason: string;
  readonly correlationId: string;
}

export interface SaveClassroomBeaconCommand extends BeaconActor {
  readonly uuid: string;
  readonly classroom: string;
  readonly classroomKey: string;
}

export interface UpdateClassroomBeaconCommand extends BeaconActor {
  readonly id: string;
  readonly uuid?: string;
  readonly classroom?: string;
  readonly classroomKey?: string;
}

export interface ImportClassroomBeaconsCommand extends BeaconActor {
  readonly beacons: ReadonlyArray<{
    readonly uuid: string;
    readonly classroom: string;
    readonly classroomKey: string;
  }>;
}

export class ClassroomBeaconDomainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ClassroomBeaconDomainError';
  }
}

export function normalizeClassroomDisplay(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function normalizeClassroomKey(value: string): string {
  return normalizeClassroomDisplay(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

export function normalizeBeaconUuid(value: string): string {
  return value.trim().toLowerCase();
}
