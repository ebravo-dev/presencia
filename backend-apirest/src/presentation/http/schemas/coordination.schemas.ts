import { z } from 'zod';
import { ApiError } from '../../../errors/api-error.js';

export const teacherListQuerySchema = z
  .object({
    coordinationId: z.string().trim().min(1).optional(),
    search: z.string().trim().min(1).max(100).optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export const teacherParamsSchema = z.object({ teacherId: z.string().trim().min(1) }).strict();

export const weeklyReportQuerySchema = z.object({
  teacherId: z.string().trim().min(1),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
    (value) => new Date(`${value}T12:00:00.000Z`).getUTCDay() === 1,
    'weekStart debe ser lunes.',
  ),
}).strict();

const optionalDateTimeSchema = z.string().datetime().nullable().optional();

export const sharedClassBodySchema = z.object({
  sourceAssignmentId: z.string().trim().min(1),
  assignedTeacherId: z.string().trim().min(1),
  startsAt: optionalDateTimeSchema,
  endsAt: optionalDateTimeSchema,
  active: z.boolean().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
}).strict();

export const sharedClassUpdateBodySchema = sharedClassBodySchema.partial();
export const sharedClassParamsSchema = z.object({ id: z.string().trim().min(1) }).strict();

export function parseCoordinationPayload<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
): z.output<TSchema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Solicitud de coordinacion invalida.', result.error.flatten());
  }
  return result.data;
}

const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] } as const;
const dateTime = { type: 'string', format: 'date-time' } as const;
const coordinationSummary = {
  type: 'object',
  required: ['id', 'externalId', 'name', 'shortName', 'teacherCount', 'subjectCount', 'assignmentCount'],
  properties: {
    id: { type: 'string' },
    externalId: { type: 'string' },
    name: { type: 'string' },
    shortName: nullableString,
    teacherCount: { type: 'integer' },
    subjectCount: { type: 'integer' },
    assignmentCount: { type: 'integer' },
  },
} as const;
const generatedMeta = {
  type: 'object',
  required: ['generatedAt'],
  properties: { generatedAt: dateTime },
} as const;
const teacherSummary = {
  type: 'object',
  required: [
    'id',
    'externalId',
    'institutionalCode',
    'name',
    'email',
    'lastAuthenticatedAt',
    'lastHarvestedAt',
    'assignmentCount',
    'subjectCount',
    'coordinations',
  ],
  properties: {
    id: { type: 'string' },
    externalId: { type: 'string' },
    institutionalCode: nullableString,
    name: { type: 'string' },
    email: nullableString,
    lastAuthenticatedAt: dateTime,
    lastHarvestedAt: { anyOf: [dateTime, { type: 'null' }] },
    assignmentCount: { type: 'integer' },
    subjectCount: { type: 'integer' },
    coordinations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'externalId', 'name'],
        properties: { id: { type: 'string' }, externalId: { type: 'string' }, name: { type: 'string' } },
      },
    },
  },
} as const;
const assignmentSummary = {
  type: 'object',
  required: [
    'id',
    'externalGroupId',
    'groupCode',
    'schoolCycleExternalId',
    'schoolCycleName',
    'classroom',
    'educationLevel',
    'period',
    'schedule',
    'firstSeenAt',
    'lastSeenAt',
    'teacher',
    'subject',
    'coordination',
  ],
  properties: {
    id: { type: 'string' },
    externalGroupId: { type: 'string' },
    groupCode: nullableString,
    schoolCycleExternalId: { type: 'string' },
    schoolCycleName: nullableString,
    classroom: nullableString,
    educationLevel: nullableString,
    period: nullableString,
    schedule: { type: 'object', additionalProperties: { type: 'array', items: { type: 'object', additionalProperties: true } } },
    firstSeenAt: dateTime,
    lastSeenAt: dateTime,
    teacher: {
      type: 'object',
      required: ['id', 'externalId', 'name'],
      properties: { id: { type: 'string' }, externalId: { type: 'string' }, name: { type: 'string' } },
    },
    subject: {
      type: 'object',
      required: ['id', 'externalId', 'code', 'name'],
      properties: {
        id: { type: 'string' },
        externalId: { type: 'string' },
        code: nullableString,
        name: { type: 'string' },
      },
    },
    coordination: {
      type: 'object',
      required: ['id', 'externalId', 'name'],
      properties: { id: { type: 'string' }, externalId: { type: 'string' }, name: { type: 'string' } },
    },
  },
} as const;

export const coordinationRouteSchemas = {
  overview: {
    response: {
      200: {
        type: 'object',
        required: ['data', 'meta'],
        properties: {
          data: {
            type: 'object',
            required: ['counts', 'coordinations'],
            properties: {
              counts: {
                type: 'object',
                required: ['teachers', 'subjects', 'coordinations', 'assignments'],
                properties: {
                  teachers: { type: 'integer' },
                  subjects: { type: 'integer' },
                  coordinations: { type: 'integer' },
                  assignments: { type: 'integer' },
                },
              },
              coordinations: { type: 'array', items: coordinationSummary },
            },
          },
          meta: generatedMeta,
        },
      },
    },
  },
  coordinations: {
    response: {
      200: {
        type: 'object',
        required: ['data', 'meta'],
        properties: { data: { type: 'array', items: coordinationSummary }, meta: generatedMeta },
      },
    },
  },
  teachers: {
    querystring: {
      type: 'object',
      additionalProperties: false,
      properties: {
        coordinationId: { type: 'string', minLength: 1 },
        search: { type: 'string', minLength: 1, maxLength: 100 },
        page: { type: 'integer', minimum: 1, default: 1 },
        pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
      },
    },
    response: {
      200: {
        type: 'object',
        required: ['data', 'meta'],
        properties: {
          data: { type: 'array', items: teacherSummary },
          meta: {
            type: 'object',
            required: ['page', 'pageSize', 'total', 'totalPages'],
            properties: {
              page: { type: 'integer' },
              pageSize: { type: 'integer' },
              total: { type: 'integer' },
              totalPages: { type: 'integer' },
            },
          },
        },
      },
    },
  },
  teacherAssignments: {
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['teacherId'],
      properties: { teacherId: { type: 'string', minLength: 1 } },
    },
    response: {
      200: {
        type: 'object',
        required: ['data', 'meta'],
        properties: {
          data: {
            type: 'object',
            required: ['teacher', 'assignments'],
            properties: {
              teacher: teacherSummary,
              assignments: { type: 'array', items: assignmentSummary },
            },
          },
          meta: generatedMeta,
        },
      },
    },
  },
  weeklyReport: {
    querystring: {
      type: 'object', additionalProperties: false, required: ['teacherId', 'weekStart'],
      properties: {
        teacherId: { type: 'string', minLength: 1 },
        weekStart: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      },
    },
  },
} as const;
