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
