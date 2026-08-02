import { describe, expect, it } from 'vitest';
import { shouldApplyRosterSnapshot } from './attendance.js';

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
