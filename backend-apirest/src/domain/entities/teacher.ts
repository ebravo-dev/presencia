export interface Teacher {
  id?: string;
  externalId: string;
  institutionalCode: string | null;
  name: string;
  email: string | null;
  lastAuthenticatedAt: Date;
  lastHarvestedAt: Date | null;
}
