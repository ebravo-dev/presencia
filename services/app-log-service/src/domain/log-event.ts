import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).optional();
const contextValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.string().max(8_000), z.number().finite(), z.boolean(), z.null(),
  z.array(contextValueSchema).max(100), z.record(z.string().max(100), contextValueSchema),
]));

export const appLogEventSchema = z.object({
  eventId: z.uuid(),
  sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  level: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']),
  application: z.enum(['STUDENT', 'PROFESSOR']),
  eventName: z.string().trim().min(1).max(120).regex(/^[a-z0-9][a-z0-9._-]*$/i),
  message: z.string().trim().min(1).max(8_000),
  occurredAt: z.iso.datetime({ offset: true }),
  installationId: z.uuid(),
  appSessionId: z.uuid(),
  userIdentifier: optionalText(160),
  appVersion: z.string().trim().min(1).max(40),
  buildNumber: z.string().trim().min(1).max(40),
  platform: z.string().trim().min(1).max(40),
  osVersion: z.string().trim().min(1).max(500),
  deviceModel: optionalText(160),
  deviceManufacturer: optionalText(160),
  locale: optionalText(40),
  timezoneOffset: optionalText(16),
  networkType: optionalText(40),
  errorType: optionalText(240),
  errorMessage: optionalText(8_000),
  stackTrace: optionalText(32_000),
  correlationId: optionalText(128),
  context: z.record(z.string().max(100), contextValueSchema).optional(),
}).strict();

export const logBatchSchema = z.object({
  schemaVersion: z.literal(1),
  batchId: z.uuid(),
  sentAt: z.iso.datetime({ offset: true }),
  events: z.array(appLogEventSchema).min(1).max(50),
}).strict().superRefine((value, context) => {
  const ids = value.events.map(({ eventId }) => eventId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: 'custom', path: ['events'], message: 'Event IDs must be unique inside a batch' });
  }
  const serializedBytes = Buffer.byteLength(JSON.stringify(value.events));
  if (serializedBytes > 900_000) {
    context.addIssue({ code: 'custom', path: ['events'], message: 'Batch is too large' });
  }
});

export type AppLogEventInput = z.infer<typeof appLogEventSchema>;
export type LogBatchInput = z.infer<typeof logBatchSchema>;

export const logQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  application: z.enum(['STUDENT', 'PROFESSOR']).optional(),
  level: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']).optional(),
  installationId: z.uuid().optional(),
  userIdentifier: z.string().trim().max(160).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export type LogQuery = z.infer<typeof logQuerySchema>;
