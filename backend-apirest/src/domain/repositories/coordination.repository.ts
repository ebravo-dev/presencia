import type { Coordination } from '../entities/coordination.js';

export interface CoordinationSummary extends Coordination {
  id: string;
  teacherCount: number;
  subjectCount: number;
  assignmentCount: number;
}

export interface ICoordinationRepository {
  upsert(coordination: Coordination): Promise<Coordination & { id: string }>;
  findAll(): Promise<CoordinationSummary[]>;
  count(): Promise<number>;
}
