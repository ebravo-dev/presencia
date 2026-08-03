import type { AttendanceRepository } from '../domain/attendance.repository.js';
import {
  ClassroomBeaconDomainError,
  normalizeBeaconUuid,
  normalizeClassroomDisplay,
  normalizeClassroomKey,
  type BeaconActor,
} from '../domain/classroom-beacon.js';

type ClassroomBeaconRepository = Pick<AttendanceRepository,
  | 'listClassroomBeacons'
  | 'createClassroomBeacon'
  | 'updateClassroomBeacon'
  | 'deleteClassroomBeacon'
  | 'importClassroomBeacons'
  | 'resolveClassroomBeaconsForProfessor'
  | 'resolveAuthorizedClassroomBeacons'>;

export class ClassroomBeaconService {
  constructor(private readonly repository: ClassroomBeaconRepository) {}

  list() {
    return this.repository.listClassroomBeacons();
  }

  create(input: { uuid: string; classroom: string } & BeaconActor) {
    const normalized = normalize(input);
    return this.repository.createClassroomBeacon({ ...input, ...normalized });
  }

  update(input: { id: string; uuid?: string; classroom?: string } & BeaconActor) {
    const classroom = input.classroom === undefined ? undefined : normalizeClassroomDisplay(input.classroom);
    return this.repository.updateClassroomBeacon({
      id: input.id,
      actorIdentityId: input.actorIdentityId,
      actorRole: input.actorRole,
      reason: input.reason,
      correlationId: input.correlationId,
      ...(input.uuid === undefined ? {} : { uuid: normalizeBeaconUuid(input.uuid) }),
      ...(classroom === undefined ? {} : { classroom, classroomKey: requireClassroomKey(classroom) }),
    });
  }

  delete(id: string, actor: BeaconActor) {
    return this.repository.deleteClassroomBeacon(id, actor);
  }

  async import(input: { beacons: ReadonlyArray<{ uuid: string; classroom: string }> } & BeaconActor) {
    const normalized = input.beacons.map(normalize);
    const uuids = normalized.map(({ uuid }) => uuid);
    const classroomKeys = normalized.map(({ classroomKey }) => classroomKey);
    if (new Set(uuids).size !== uuids.length) {
      throw new ClassroomBeaconDomainError('BEACON_IMPORT_DUPLICATE_UUID', 'La importación contiene UUIDs duplicados.');
    }
    if (new Set(classroomKeys).size !== classroomKeys.length) {
      throw new ClassroomBeaconDomainError('BEACON_IMPORT_DUPLICATE_CLASSROOM', 'La importación contiene salones duplicados.');
    }
    return this.repository.importClassroomBeacons({ ...input, beacons: normalized });
  }

  resolveForProfessor(input: { professorExternalId?: string; professorEmail?: string; classrooms: string[] }) {
    const classrooms = normalizeRequestedClassrooms(input.classrooms);
    return this.repository.resolveClassroomBeaconsForProfessor({
      ...(input.professorExternalId ? { professorExternalId: input.professorExternalId.trim() } : {}),
      ...(input.professorEmail ? { professorEmail: input.professorEmail.trim().toLowerCase() } : {}),
      classrooms,
    });
  }

  resolveAuthorized(classrooms: string[]) {
    return this.repository.resolveAuthorizedClassroomBeacons(normalizeRequestedClassrooms(classrooms));
  }
}

function normalize(input: { uuid: string; classroom: string }) {
  const classroom = normalizeClassroomDisplay(input.classroom);
  return { uuid: normalizeBeaconUuid(input.uuid), classroom, classroomKey: requireClassroomKey(classroom) };
}

function requireClassroomKey(classroom: string): string {
  const key = normalizeClassroomKey(classroom);
  if (!key) throw new ClassroomBeaconDomainError('INVALID_CLASSROOM', 'El salón debe contener letras o números.');
  return key;
}

function normalizeRequestedClassrooms(values: string[]) {
  const classroomsByKey = new Map<string, string>();
  for (const value of values) {
    const classroom = normalizeClassroomDisplay(value);
    const key = requireClassroomKey(classroom);
    if (!classroomsByKey.has(key)) classroomsByKey.set(key, classroom);
  }
  return [...classroomsByKey.entries()].map(([classroomKey, classroom]) => ({ classroomKey, classroom }));
}
