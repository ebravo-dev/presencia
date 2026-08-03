import type { IdentityRole } from './identity.js';

export type StaffRole = Extract<IdentityRole, 'COORDINATOR' | 'READ_ONLY'>;

export interface StaffAccount {
  readonly id: string;
  readonly identityId: string;
  readonly email: string;
  readonly name: string;
  readonly role: StaffRole;
  readonly disabledAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface StaffCredential extends StaffAccount {
  readonly passwordHash: string;
}

export interface StaffAuditContext {
  readonly actorIdentityId: string;
  readonly correlationId: string;
  readonly reason: string;
  readonly source: 'SUPER_USER' | 'LEGACY_IMPORT';
}

export interface CreateStaffAccountInput {
  readonly email: string;
  readonly name: string;
  readonly passwordHash: string;
  readonly role: StaffRole;
  readonly legacySourceId?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly audit: StaffAuditContext;
}

export interface UpdateStaffAccountInput {
  readonly email?: string | undefined;
  readonly name?: string | undefined;
  readonly passwordHash?: string | undefined;
  readonly role?: StaffRole | undefined;
  readonly disabled?: boolean | undefined;
  readonly audit: StaffAuditContext;
}

export interface StaffAccountRepository {
  findCredentialByEmail(email: string): Promise<StaffCredential | null>;
  list(): Promise<StaffAccount[]>;
  create(input: CreateStaffAccountInput): Promise<StaffAccount>;
  update(id: string, input: UpdateStaffAccountInput): Promise<StaffAccount>;
  delete(id: string, audit: StaffAuditContext): Promise<void>;
  import(input: CreateStaffAccountInput & { legacySourceId: string }): Promise<StaffAccount>;
}
