import type { AttendanceRepository } from '../domain/attendance.repository.js';
import { AttendanceDomainError } from '../domain/attendance.js';
import type { BindDeviceCommand, ReplaceDeviceBindingCommand } from '../domain/device-binding.js';
import type { BindingTokenClaims } from '../infrastructure/binding-token.js';

export class DeviceBindingService {
  constructor(private readonly repository: AttendanceRepository) {}

  bindAfterUatAuthentication(command: BindDeviceCommand) {
    return this.repository.bindInitial(normalize(command));
  }

  async reconcileExisting(command: BindDeviceCommand, claims: BindingTokenClaims) {
    const normalized = normalize(command);
    if (
      claims.matricula.trim().toUpperCase() !== normalized.matricula
      || claims.deviceBindingId !== normalized.deviceBindingId
    ) {
      throw new AttendanceDomainError(
        'DEVICE_BINDING_TOKEN_MISMATCH',
        'La autorización no corresponde al celular enviado.',
      );
    }
    const current = await this.repository.bindingByMatricula(normalized.matricula);
    if (
      !current
      || !current.active
      || current.id !== claims.subject
      || current.bindingVersion !== claims.bindingVersion
    ) {
      throw new AttendanceDomainError(
        'DEVICE_BINDING_TOKEN_REVOKED',
        'La autorización del celular fue revocada; inicia sesión nuevamente.',
      );
    }
    if (
      current.attendanceUuid !== normalized.attendanceUuid
      || current.deviceBindingId !== normalized.deviceBindingId
    ) {
      throw new AttendanceDomainError(
        'DEVICE_BINDING_CHANGE_REQUIRES_COORDINATOR',
        'La matrícula ya está vinculada; sólo coordinación puede cambiar su UUID.',
      );
    }
    return { binding: current, created: false, duplicate: true };
  }

  resolveForProfessor(input: { professorExternalId: string; matriculas: string[] }) {
    return this.repository.resolveDeviceBindings({
      professorExternalId: input.professorExternalId.trim(),
      matriculas: [...new Set(input.matriculas.map((value) => value.trim().toUpperCase()).filter(Boolean))],
    });
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
