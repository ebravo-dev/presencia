import type { Group } from '../entities/group.js';
import type { WeeklySchedule } from '../entities/group.js';

export interface GroupAssignmentDetail {
  id: string;
  externalGroupId: string;
  groupCode: string | null;
  schoolCycleExternalId: string;
  schoolCycleName: string | null;
  classroom: string | null;
  educationLevel: string | null;
  period: string | null;
  schedule: WeeklySchedule;
  firstSeenAt: Date;
  lastSeenAt: Date;
  teacher: { id: string; externalId: string; name: string };
  subject: { id: string; externalId: string; code: string | null; name: string };
  coordination: { id: string; externalId: string; name: string };
}

export interface IGroupAssignmentRepository {
  upsert(group: Group): Promise<void>;
  findByTeacherId(teacherId: string): Promise<GroupAssignmentDetail[]>;
  count(): Promise<number>;
}
