export interface DeviceBindingValue {
  readonly id: string;
  readonly matricula: string;
  readonly attendanceUuid: string;
  readonly deviceBindingId: string | null;
  readonly platform: string | null;
  readonly deviceInfo: string | null;
  readonly bindingVersion: number;
  readonly active: boolean;
  readonly updatedAt: Date;
}

export interface BindDeviceCommand {
  readonly matricula: string;
  readonly attendanceUuid: string;
  readonly deviceBindingId?: string | null | undefined;
  readonly platform?: string | null | undefined;
  readonly deviceInfo?: string | null | undefined;
  readonly correlationId: string;
}

export interface ReplaceDeviceBindingCommand extends BindDeviceCommand {
  readonly actorIdentityId: string;
  readonly actorRole: 'COORDINATOR' | 'SUPER_USER';
  readonly reason: string;
}

export interface BindDeviceResult {
  readonly binding: DeviceBindingValue;
  readonly created: boolean;
  readonly duplicate: boolean;
}

export type InitialBindingDecision = 'CREATE' | 'DUPLICATE' | 'REBIND_AFTER_COORDINATOR_UNBIND' | 'REJECT';

export function decideInitialBinding(
  existing: Pick<DeviceBindingValue, 'active' | 'attendanceUuid' | 'deviceBindingId'> | null,
  requested: Pick<BindDeviceCommand, 'attendanceUuid' | 'deviceBindingId'>,
): InitialBindingDecision {
  if (!existing) return 'CREATE';
  const sameDevice = existing.attendanceUuid === requested.attendanceUuid
    && existing.deviceBindingId === (requested.deviceBindingId ?? null);
  if (existing.active) return sameDevice ? 'DUPLICATE' : 'REJECT';

  // An inactive binding can only exist after an audited coordinator action.
  // The next successful UAT login is therefore allowed to bind the replacement.
  return 'REBIND_AFTER_COORDINATOR_UNBIND';
}
