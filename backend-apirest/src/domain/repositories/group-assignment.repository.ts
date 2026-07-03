import type { Group } from '../entities/group.js';

export interface GroupAssignmentDetail {
  id: string;
  externalGroupId: string;
  groupCode: string | null;
  schoolCycleExternalId: string;
  schoolCycleName: string | null;
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
