import type { AttendanceRepository } from '../domain/attendance.repository.js';
import { AttendanceDomainError } from '../domain/attendance.js';
import type { BindDeviceCommand, ReplaceDeviceBindingCommand } from '../domain/device-binding.js';

export class DeviceBindingService {
  constructor(private readonly repository: AttendanceRepository) {}

  bindAfterUatAuthentication(command: BindDeviceCommand) {
    return this.repository.bindInitial(normalize(command));
  }

  replaceByCoordinator(command: ReplaceDeviceBindingCommand) {
    if (!['COORDINATOR', 'SUPER_USER'].includes(command.actorRole)) {
      throw new AttendanceDomainError('COORDINATOR_ROLE_REQUIRED', 'Sólo coordinación puede cambiar el UUID asociado.');
    }
    if (command.reason.trim().length < 8) {
      throw new AttendanceDomainError('BINDING_CHANGE_REASON_REQUIRED', 'El cambio requiere un motivo auditable.');
    }
    return this.repository.replaceBinding({ ...normalize(command), actorIdentityId: command.actorIdentityId, actorRole: command.actorRole, reason: command.reason.trim() });
  }

  unbindByCoordinator(command: {
    matricula: string; actorIdentityId: string; actorRole: 'COORDINATOR' | 'SUPER_USER'; reason: string; correlationId: string;
  }) {
    if (command.reason.trim().length < 8) {
      throw new AttendanceDomainError('BINDING_CHANGE_REASON_REQUIRED', 'La desvinculación requiere un motivo auditable.');
    }
    return this.repository.unbind({ ...command, matricula: command.matricula.trim().toUpperCase(), reason: command.reason.trim() });
  }
}

function normalize<T extends BindDeviceCommand>(command: T): T {
  return {
    ...command,
    matricula: command.matricula.trim().toUpperCase(),
    attendanceUuid: command.attendanceUuid.trim().toLowerCase(),
    deviceBindingId: command.deviceBindingId?.trim().toLowerCase() ?? null,
    platform: command.platform?.trim().toLowerCase() ?? null,
    deviceInfo: command.deviceInfo?.trim() ?? null,
  };
}
