import type { ProjectionEvent } from './projection-event.js';

export interface TeacherListQuery {
  coordinationId?: string | undefined; search?: string | undefined; page: number; pageSize: number;
}
export interface CoordinationQueryRepository {
  project(event: ProjectionEvent, consumer: string): Promise<boolean>;
  overview(): Promise<unknown>;
  coordinations(): Promise<unknown>;
  teachers(query: TeacherListQuery): Promise<unknown>;
  teacherAssignments(teacherId: string): Promise<unknown | null>;
  teacherReportSource(teacherId: string, startDate: string, endDate: string): Promise<unknown | null>;
  resetDemoData(): Promise<void>;
}
