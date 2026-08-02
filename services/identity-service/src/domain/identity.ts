export type IdentityKind = 'PROFESSOR' | 'STUDENT' | 'STAFF';
export type IdentityRole = 'PROFESSOR' | 'STUDENT' | 'COORDINATOR' | 'READ_ONLY' | 'SUPER_USER';

export interface Identity {
  readonly id: string;
  readonly kind: IdentityKind;
  readonly role: IdentityRole;
  readonly institutionalIdentifier: string;
  readonly email: string | null;
  readonly displayName: string;
  readonly disabledAt: Date | null;
  readonly lastAuthenticatedAt: Date;
}

export interface ResolveVerifiedIdentityInput {
  readonly kind: Extract<IdentityKind, 'PROFESSOR' | 'STUDENT'>;
  readonly role: Extract<IdentityRole, 'PROFESSOR' | 'STUDENT'>;
  readonly institutionalIdentifier: string;
  readonly email?: string | undefined;
  readonly displayName: string;
  readonly source: 'UAT_TEACHER' | 'UAT_STUDENT';
  readonly correlationId: string;
}
