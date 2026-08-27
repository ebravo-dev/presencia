import type { Identity, ResolveVerifiedIdentityInput } from './identity.js';

export interface IdentityRepository {
  resolveVerified(input: ResolveVerifiedIdentityInput): Promise<Identity>;
  findById(id: string): Promise<Identity | null>;
  listRegisteredStudents(): Promise<Identity[]>;
  findRegisteredStudentByMatricula(matricula: string): Promise<Identity | null>;
  resetDemoIdentities(): Promise<string[]>;
  purgeAllIdentities(): Promise<string[]>;
}
