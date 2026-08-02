import { describe, expect, it } from 'vitest';
import { decideInitialBinding } from './device-binding.js';

const activeBinding = {
  active: true,
  attendanceUuid: '12345678-1234-4234-9234-123456789abc',
  deviceBindingId: '12345678-1234-4234-9234-123456789abd',
};

describe('decideInitialBinding', () => {
  it('keeps exact retries idempotent and rejects active device changes', () => {
    expect(decideInitialBinding(activeBinding, activeBinding)).toBe('DUPLICATE');
    expect(decideInitialBinding(activeBinding, {
      attendanceUuid: '22345678-1234-4234-9234-123456789abc',
      deviceBindingId: activeBinding.deviceBindingId,
    })).toBe('REJECT');
  });

  it('allows the next UAT login only after the coordinator made the binding inactive', () => {
    expect(decideInitialBinding({ ...activeBinding, active: false }, {
      attendanceUuid: '22345678-1234-4234-9234-123456789abc',
      deviceBindingId: null,
    })).toBe('REBIND_AFTER_COORDINATOR_UNBIND');
  });
});
