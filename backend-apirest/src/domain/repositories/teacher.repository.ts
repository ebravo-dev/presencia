import type { Teacher } from '../entities/teacher.js';

export interface TeacherQuery {
  coordinationId?: string;
  search?: string;
  page: number;
  pageSize: number;
}

export interface TeacherSummary extends Teacher {
  id: string;
  assignmentCount: number;
  subjectCount: number;
  coordinations: Array<{ id: string; externalId: string; name: string }>;
}

export interface ITeacherRepository {
  upsert(teacher: Teacher): Promise<Teacher & { id: string }>;
  markHarvested(externalId: string, harvestedAt: Date): Promise<void>;
  findAll(query: TeacherQuery): Promise<{ items: TeacherSummary[]; total: number }>;
  findById(id: string): Promise<TeacherSummary | null>;
  count(): Promise<number>;
}
