import type { Subject } from '../entities/subject.js';

export interface ISubjectRepository {
  upsert(subject: Subject): Promise<Subject & { id: string }>;
  count(): Promise<number>;
}
