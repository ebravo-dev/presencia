import type { AttendanceRosterSnapshot, CaptureAttendanceCommand, CaptureAttendanceResult } from './attendance.js';
import type { BindDeviceCommand, BindDeviceResult, ReplaceDeviceBindingCommand } from './device-binding.js';

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
}
