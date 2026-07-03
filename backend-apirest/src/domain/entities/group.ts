import type { JsonRecord } from '../types/uat.interfaces.js';

export interface Group {
  id?: string;
  externalGroupId: string;
  groupCode: string | null;
  schoolCycleExternalId: string;
  schoolCycleName: string | null;
  classroom: string | null;
  educationLevel: string | null;
  period: string | null;
  schedule: WeeklySchedule;
  teacherExternalId: string;
  subjectExternalId: string;
  coordinationExternalId: string;
  rawPayload: JsonRecord;
}

export interface ScheduleSlot {
  raw: string;
  startTime: string | null;
  endTime: string | null;
}

export type ScheduleDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type WeeklySchedule = Record<ScheduleDay, ScheduleSlot[]>;
