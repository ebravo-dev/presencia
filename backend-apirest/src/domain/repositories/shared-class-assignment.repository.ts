import type { GroupAssignmentDetail } from './group-assignment.repository.js';

export interface SharedClassTeacher {
  id: string;
  externalId: string;
  institutionalCode: string | null;
  name: string;
  email: string | null;
}

export interface SharedClassAssignmentDetail {
  id: string;
  sourceAssignmentId: string;
  assignedTeacherId: string;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  sourceAssignment: GroupAssignmentDetail;
  assignedTeacher: SharedClassTeacher;
}

export interface SharedClassAssignmentData {
  sourceAssignmentId: string;
  assignedTeacherId: string;
  startsAt?: Date | null;
  endsAt?: Date | null;
  active?: boolean;
  notes?: string | null;
}

export interface SharedClassOptions {
  teachers: SharedClassTeacher[];
  assignments: GroupAssignmentDetail[];
}

export interface ISharedClassAssignmentRepository {
  listOptions(): Promise<SharedClassOptions>;
  findAll(): Promise<SharedClassAssignmentDetail[]>;
  findById(id: string): Promise<SharedClassAssignmentDetail | null>;
  findActiveByTeacherIdentity(identity: string, at: Date): Promise<SharedClassAssignmentDetail[]>;
  create(data: SharedClassAssignmentData): Promise<SharedClassAssignmentDetail>;
  update(id: string, data: Partial<SharedClassAssignmentData>): Promise<SharedClassAssignmentDetail>;
  delete(id: string): Promise<boolean>;
}
