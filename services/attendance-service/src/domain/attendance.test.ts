import { describe, expect, it } from 'vitest';
import { shouldApplyGroupAccessGrant, shouldApplyRosterSnapshot } from './attendance.js';

describe('shouldApplyRosterSnapshot', () => {
  const current = { rosterVersion: 'snapshot-2', rosterObservedAt: new Date('2026-08-02T12:00:00.000Z') };

  it('rejects delayed older events and exact redeliveries', () => {
    expect(shouldApplyRosterSnapshot(current, {
      rosterVersion: 'snapshot-1', rosterObservedAt: new Date('2026-08-02T11:59:59.000Z'),
    })).toBe(false);
    expect(shouldApplyRosterSnapshot(current, current)).toBe(false);
  });

  it('accepts a newer snapshot', () => {
    expect(shouldApplyRosterSnapshot(current, {
      rosterVersion: 'snapshot-3', rosterObservedAt: new Date('2026-08-02T12:00:01.000Z'),
    })).toBe(true);
  });
});

describe('academic group access grant ordering', () => {
  it('accepts only a newer assignment event so stale activation cannot undo a revocation', () => {
    const revokedAt = new Date('2026-08-03T14:00:00.000Z');
    expect(shouldApplyGroupAccessGrant(null, { observedAt: revokedAt })).toBe(true);
    expect(shouldApplyGroupAccessGrant(
      { observedAt: revokedAt },
      { observedAt: new Date('2026-08-03T13:59:59.999Z') },
    )).toBe(false);
    expect(shouldApplyGroupAccessGrant(
      { observedAt: revokedAt },
      { observedAt: new Date('2026-08-03T14:00:00.001Z') },
    )).toBe(true);
  });
});
