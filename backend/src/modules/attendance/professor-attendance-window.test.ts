import { describe, expect, it } from 'vitest';
import { classifyProfessorArrival } from './professor-attendance-window.js';

describe('classifyProfessorArrival', () => {
    const classify = (iso: string) => classifyProfessorArrival({
        schedule: { lunes: '07:00-08:00' },
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
});
