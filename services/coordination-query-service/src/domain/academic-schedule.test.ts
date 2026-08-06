import { describe, expect, it } from 'vitest';
import { normalizeAcademicSchedule } from './academic-schedule.js';

describe('normalizeAcademicSchedule', () => {
  it('fills missing days so partial historical schedules remain safe for clients', () => {
    const schedule = normalizeAcademicSchedule({
      lunes: '7:00-8:00',
      wednesday: [{ startTime: '09:00', endTime: '10:30' }],
      friday: null,
    });

    expect(schedule.monday).toEqual([{ raw: '7:00-8:00', startTime: '07:00', endTime: '08:00' }]);
    expect(schedule.wednesday).toEqual([{ raw: '09:00-10:30', startTime: '09:00', endTime: '10:30' }]);
    expect(schedule.tuesday).toEqual([]);
    expect(schedule.friday).toEqual([]);
    expect(schedule.sunday).toEqual([]);
  });

  it('returns a complete empty week for malformed values', () => {
    expect(normalizeAcademicSchedule(null)).toEqual({
      monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [],
    });
  });
});
