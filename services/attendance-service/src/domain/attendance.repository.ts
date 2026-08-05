import type { AcademicGroupAccessGrantInput, AttendanceRosterSnapshot, CaptureAttendanceCommand, CaptureAttendanceResult } from './attendance.js';
import type { BindDeviceCommand, BindDeviceResult, ReplaceDeviceBindingCommand } from './device-binding.js';
import type {
  BeaconActor,
  ClassroomBeaconValue,
  ImportClassroomBeaconsCommand,
  SaveClassroomBeaconCommand,
  UpdateClassroomBeaconCommand,
} from './classroom-beacon.js';
import type {
  ProfessorEntryObservationCommand,
  ProfessorExitObservationCommand,
  ProfessorPresenceObservationResult,
  StudentPresenceObservationCommand,
  StudentPresenceObservationResult,
} from './presence-observation.js';

export interface AttendanceCoordinationProjectionSnapshot {
  attendanceSessionId: string;
  externalGroupId: string;
  professorExternalId: string;
  date: string;
  professorEntryAt: Date | null;
  professorExitAt: Date | null;
  entriesCount: number;
  uploadStatus: 'DRAFT' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  uploadError: string | null;
  version: number;
  observedAt: Date;
}

export interface AttendanceSettings {
  teacherAttendanceToleranceMinutes: number;
  updatedAt: Date | null;
}

export interface AttendanceRepository {
  applyRoster(snapshot: AttendanceRosterSnapshot): Promise<void>;
  deactivateRoster(externalGroupId: string, rosterObservedAt: Date): Promise<void>;
  applyGroupAccessGrant(grant: AcademicGroupAccessGrantInput): Promise<void>;
  markUploadResult(input: {
    attendanceSessionId: string; version: number; status: 'COMPLETED' | 'FAILED'; error?: string | null;
  }): Promise<boolean>;
  capture(command: CaptureAttendanceCommand, requestHash: string): Promise<CaptureAttendanceResult>;
  bindInitial(command: BindDeviceCommand): Promise<BindDeviceResult>;
  replaceBinding(command: ReplaceDeviceBindingCommand): Promise<BindDeviceResult>;
  unbind(command: {
    matricula: string; actorIdentityId: string; actorRole: 'COORDINATOR' | 'SUPER_USER';
    reason: string; correlationId: string;
  }): Promise<boolean>;
  bindingByMatricula(matricula: string): Promise<BindDeviceResult['binding'] | null>;
  resolveDeviceBindings(input: {
    professorExternalId: string;
    matriculas: string[];
  }): Promise<{ data: BindDeviceResult['binding'][]; missing: string[] }>;
  listDeviceBindings(query?: string): Promise<unknown[]>;
  bindingInfrastructureSummary(): Promise<{ count: number; recentBindings: unknown[] }>;
  infrastructureSummary(): Promise<{
    counts: { beacons: number; studentDeviceBindings: number; studentBleAttendances: number };
    recentBindings: unknown[];
    recentBeacons: ClassroomBeaconValue[];
  }>;
  coordinationProjectionSnapshot(): Promise<AttendanceCoordinationProjectionSnapshot[]>;
  attendanceSettings(): Promise<AttendanceSettings>;
  updateAttendanceSettings(input: {
    teacherAttendanceToleranceMinutes: number;
    actorIdentityId: string;
    actorRole: 'COORDINATOR' | 'SUPER_USER';
  }): Promise<AttendanceSettings>;
  resetDemoData(): Promise<void>;
  listClassroomBeacons(): Promise<ClassroomBeaconValue[]>;
  createClassroomBeacon(command: SaveClassroomBeaconCommand): Promise<ClassroomBeaconValue>;
  updateClassroomBeacon(command: UpdateClassroomBeaconCommand): Promise<ClassroomBeaconValue>;
  deleteClassroomBeacon(id: string, actor: BeaconActor): Promise<void>;
  importClassroomBeacons(command: ImportClassroomBeaconsCommand): Promise<{ imported: number; unchanged: number }>;
  resolveClassroomBeaconsForProfessor(input: {
    professorExternalId?: string;
    professorEmail?: string;
    classrooms: Array<{ classroom: string; classroomKey: string }>;
  }): Promise<{ data: ClassroomBeaconValue[]; missing: string[] }>;
  resolveAuthorizedClassroomBeacons(
    classrooms: Array<{ classroom: string; classroomKey: string }>,
  ): Promise<{ data: ClassroomBeaconValue[]; missing: string[] }>;
  observeProfessorEntry(command: ProfessorEntryObservationCommand): Promise<ProfessorPresenceObservationResult>;
  observeProfessorExit(command: ProfessorExitObservationCommand): Promise<ProfessorPresenceObservationResult>;
  observeStudentPresence(command: StudentPresenceObservationCommand): Promise<StudentPresenceObservationResult>;
}
