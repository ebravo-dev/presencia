import { describe, expect, it } from 'vitest';
import { classifyProfessorArrival } from './professor-attendance-window.js';

describe('classifyProfessorArrival', () => {
  const schedule = { lunes: '07:00-08:00' };
  const classify = (iso: string) => classifyProfessorArrival({
    schedule,
    observedAt: new Date(iso),
    timeZone: 'America/Monterrey',
    toleranceMinutes: 10,
  });

  it.each([
    ['2026-08-03T12:49:59.000Z', 'OUTSIDE_WINDOW'],
    ['2026-08-03T12:50:00.000Z', 'ON_TIME'],
    ['2026-08-03T13:10:59.000Z', 'ON_TIME'],
    ['2026-08-03T13:11:00.000Z', 'LATE'],
    ['2026-08-03T14:10:59.000Z', 'LATE'],
    ['2026-08-03T14:11:00.000Z', 'OUTSIDE_WINDOW'],
  ] as const)('classifies %s as %s', (iso, expected) => {
    expect(classify(iso)).toBe(expected);
  });

  it('merges consecutive hourly blocks into one class window', () => {
    expect(classifyProfessorArrival({
      schedule: { monday: [
        { startTime: '07:00', endTime: '08:00' },
        { startTime: '08:00', endTime: '09:00' },
      ] },
      observedAt: new Date('2026-08-03T15:05:00.000Z'),
      timeZone: 'America/Monterrey',
      toleranceMinutes: 10,
    })).toBe('LATE');
  });
});
