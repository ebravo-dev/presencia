import type { AttendanceRosterSnapshot, CaptureAttendanceCommand, CaptureAttendanceResult } from './attendance.js';
import type { BindDeviceCommand, BindDeviceResult, ReplaceDeviceBindingCommand } from './device-binding.js';

export interface AttendanceCoordinationProjectionSnapshot {
  attendanceSessionId: string;
  externalGroupId: string;
  professorExternalId: string;
  date: string;
  professorEntryAt: Date | null;
  professorExitAt: Date | null;
  entriesCount: number;
  uploadStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  uploadError: string | null;
  version: number;
  observedAt: Date;
}

export interface AttendanceRepository {
  applyRoster(snapshot: AttendanceRosterSnapshot): Promise<void>;
  deactivateRoster(externalGroupId: string, rosterObservedAt: Date): Promise<void>;
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
  coordinationProjectionSnapshot(): Promise<AttendanceCoordinationProjectionSnapshot[]>;
}
