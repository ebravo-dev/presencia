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
  schoolCycleYear: number;
  schoolCycleTerm: number;
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
  schoolCycleYear: number;
  schoolCycleTerm: number;
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
  findActiveByTeacherIdentity(identity: string, cycle?: { year: number; term: number }): Promise<SharedClassAssignmentDetail[]>;
  create(data: SharedClassAssignmentData): Promise<SharedClassAssignmentDetail>;
  update(id: string, data: Partial<SharedClassAssignmentData>): Promise<SharedClassAssignmentDetail>;
  delete(id: string): Promise<boolean>;
}
