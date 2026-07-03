import type { JsonRecord } from '../types/uat.interfaces.js';

export interface Group {
  id?: string;
  externalGroupId: string;
  groupCode: string | null;
  schoolCycleExternalId: string;
  schoolCycleName: string | null;
  teacherExternalId: string;
  subjectExternalId: string;
  coordinationExternalId: string;
  rawPayload: JsonRecord;
}
