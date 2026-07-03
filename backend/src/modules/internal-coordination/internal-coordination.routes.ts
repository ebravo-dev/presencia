import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from '../../core/config/env.js';
import { prisma } from '../../core/database/prisma.js';

const querySchema = z.object({
  professorEmail: z.string().email().transform((value) => value.toLowerCase()),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function hasValidServiceToken(request: FastifyRequest): boolean {
  const provided = request.headers['x-internal-service-token'];
  if (typeof provided !== 'string') return false;
  const expectedBuffer = Buffer.from(env.INTERNAL_API_TOKEN);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function internalCoordinationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', async (request, reply) => {
    if (!hasValidServiceToken(request)) {
      return reply.code(401).send({ error: 'UNAUTHORIZED_INTERNAL_CLIENT', message: 'Token interno invalido.' });
    }
  });

  fastify.get(
    '/internal/coordination/attendance-weekly',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }

      const professor = await prisma.professor.findUnique({
        where: { institutionalEmail: parsed.data.professorEmail },
        select: {
          id: true,
          institutionalEmail: true,
          name: true,
          groups: {
            select: {
              id: true,
              code: true,
              groupLetter: true,
              name: true,
              level: true,
              classroom: true,
              schedule: true,
              period: true,
              attendanceRecords: {
                where: {
                  date: {
                    gte: new Date(`${parsed.data.startDate}T00:00:00.000Z`),
                    lte: new Date(`${parsed.data.endDate}T23:59:59.999Z`),
                  },
                },
                select: {
                  date: true,
                  portalSyncStatus: true,
                  portalSyncError: true,
                  portalSyncedAt: true,
                  createdAt: true,
                },
              },
            },
            orderBy: [{ name: 'asc' }, { groupLetter: 'asc' }],
          },
        },
      });

      if (!professor) {
        return reply.code(404).send({ error: 'PROFESSOR_NOT_SYNCED', message: 'Profesor no sincronizado.' });
      }

      return reply.send({ data: professor });
    },
  );
}
