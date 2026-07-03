import { describe, expect, it } from 'vitest';
import type { UatHorarioItem } from '../../domain/types/uat.interfaces.js';
import { mapWeeklySchedule, parseScheduleSlots } from './uat-teacher-data.mapper.js';

describe('UatTeacherDataMapper schedule normalization', () => {
  it('normaliza rangos por dia y conserva valores no interpretables', () => {
    const schedule = mapWeeklySchedule({ Txt_Lunes: '7:00 - 8:30', Txt_Martes: 'Por definir' } as UatHorarioItem);
    expect(schedule.monday[0]).toEqual({ raw: '7:00 - 8:30', startTime: '07:00', endTime: '08:30' });
    expect(schedule.tuesday[0]).toEqual({ raw: 'Por definir', startTime: null, endTime: null });
    expect(schedule.wednesday).toEqual([]);
  });

  it('separa multiples bloques horarios', () => {
    expect(parseScheduleSlots('07:00-08:00; 10:00 a 11:30')).toHaveLength(2);
  });
});
