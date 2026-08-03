import { z } from 'zod';

export const authenticatedSessionSchema = z.object({
  kind: z.enum(['PROFESSOR', 'STUDENT']),
  role: z.enum(['PROFESSOR', 'STUDENT']),
  institutionalIdentifier: z.string().trim().min(1).max(160),
  email: z.email().optional(),
  displayName: z.string().trim().min(1).max(240),
  source: z.enum(['UAT_TEACHER', 'UAT_STUDENT']),
  correlationId: z.string().min(1).max(128),
  deviceId: z.string().min(1).max(160).optional(),
}).superRefine((value, context) => {
  if (value.kind !== value.role) context.addIssue({ code: 'custom', path: ['role'], message: 'Role must match the verified identity kind' });
  if (value.kind === 'PROFESSOR' && value.source !== 'UAT_TEACHER') context.addIssue({ code: 'custom', path: ['source'], message: 'Invalid UAT source' });
  if (value.kind === 'STUDENT' && value.source !== 'UAT_STUDENT') context.addIssue({ code: 'custom', path: ['source'], message: 'Invalid UAT source' });
});

export const tokenSchema = z.object({ token: z.string().min(1) });

export const staffLoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(256),
});

export const superUserLoginSchema = z.object({
  password: z.string().min(1).max(256),
});

const staffAccountSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(160),
  password: z.string().min(8).max(256),
  role: z.enum(['COORDINATOR', 'READ_ONLY']).default('COORDINATOR'),
});

const staffAuditSchema = z.object({
  actorIdentityId: z.string().trim().min(1).max(160),
  correlationId: z.string().trim().min(1).max(128),
  reason: z.string().trim().min(1).max(500),
});

export const staffAccountCreateSchema = staffAccountSchema.extend(staffAuditSchema.shape);

export const staffAccountUpdateSchema = staffAccountSchema.partial().extend({
  disabled: z.boolean().optional(),
}).extend(staffAuditSchema.shape);

export const staffAccountImportSchema = z.object({
  accounts: z.array(z.object({
    legacySourceId: z.string().min(1).max(160),
    email: z.email(),
    name: z.string().trim().min(1).max(160),
    passwordHash: z.string().min(20),
    role: z.enum(['COORDINATOR', 'READ_ONLY']).default('COORDINATOR'),
    disabled: z.boolean().optional(),
  })).max(1_000),
}).extend(staffAuditSchema.shape);
