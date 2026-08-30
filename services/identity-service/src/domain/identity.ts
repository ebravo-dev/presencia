export type IdentityKind = 'PROFESSOR' | 'STUDENT' | 'STAFF';
export type IdentityRole = 'PROFESSOR' | 'STUDENT' | 'COORDINATOR' | 'READ_ONLY' | 'SUPER_USER';

export interface Identity {
  readonly id: string;
  readonly kind: IdentityKind;
  readonly role: IdentityRole;
  readonly institutionalIdentifier: string;
  readonly email: string | null;
  readonly displayName: string;
  readonly deviceBindingId?: string | null;
  readonly devicePlatform?: string | null;
  readonly deviceInfo?: string | null;
  readonly disabledAt: Date | null;
  readonly lastAuthenticatedAt: Date;
}

export interface ResolveVerifiedIdentityInput {
  readonly kind: IdentityKind;
  readonly role: IdentityRole;
  readonly institutionalIdentifier: string;
  readonly email?: string | undefined;
  readonly displayName: string;
  readonly source: 'UAT_TEACHER' | 'UAT_STUDENT' | 'LOCAL_STAFF' | 'SUPER_USER';
  readonly correlationId: string;
  readonly deviceId?: string | undefined;
  readonly devicePlatform?: string | undefined;
  readonly deviceInfo?: string | undefined;
}
