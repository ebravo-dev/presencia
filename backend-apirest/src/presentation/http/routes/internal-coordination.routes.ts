import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { CoordinatorAccountService } from '../../../application/services/coordinator-account.service.js';
import { buildInternalTokenHook } from '../hooks/internal-token.hook.js';

export interface InternalCoordinationRoutesOptions {
  coordinatorAccountService: CoordinatorAccountService;
  internalToken: string;
}

const coordinatorCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(['COORDINATOR', 'READ_ONLY']).optional(),
});

const coordinatorUpdateSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  password: z.string().min(8).optional(),
  role: z.enum(['COORDINATOR', 'READ_ONLY']).optional(),
  disabled: z.boolean().optional(),
});

export const internalCoordinationRoutes: FastifyPluginAsync<InternalCoordinationRoutesOptions> = async (
  fastify,
  { coordinatorAccountService, internalToken },
) => {
  const requireInternalToken = buildInternalTokenHook(internalToken);

  fastify.get(
    '/api/internal/coordinacion/coordinadores',
    { preHandler: requireInternalToken },
    async (_request, reply) => reply.send(await coordinatorAccountService.listCoordinators()),
  );

  fastify.post(
    '/api/internal/coordinacion/coordinadores',
    { preHandler: requireInternalToken },
    async (request, reply) => {
      const parsed = coordinatorCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: parsed.error.errors.map((issue) => issue.message).join(', '),
        });
      }

      try {
        return reply.code(201).send(await coordinatorAccountService.createCoordinator(parsed.data));
      } catch (error: unknown) {
        if (errorCode(error) === 'P2002') {
          return reply.code(409).send({
            error: 'COORDINATOR_EXISTS',
            message: 'Ya existe una cuenta con ese correo.',
          });
        }
        throw error;
      }
    },
  );

  fastify.put<{ Params: { id: string } }>(
    '/api/internal/coordinacion/coordinadores/:id',
    { preHandler: requireInternalToken },
    async (request, reply) => {
      const parsed = coordinatorUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: parsed.error.errors.map((issue) => issue.message).join(', '),
        });
      }

      try {
        return reply.send(await coordinatorAccountService.updateCoordinator(request.params.id, parsed.data));
      } catch (error: unknown) {
        if (errorCode(error) === 'P2025') {
          return reply.code(404).send({
            error: 'COORDINATOR_NOT_FOUND',
            message: 'Cuenta de coordinador no encontrada.',
          });
        }
        if (errorCode(error) === 'P2002') {
          return reply.code(409).send({
            error: 'COORDINATOR_EXISTS',
            message: 'Ya existe una cuenta con ese correo.',
          });
        }
        throw error;
      }
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    '/api/internal/coordinacion/coordinadores/:id',
    { preHandler: requireInternalToken },
    async (request, reply) => {
      try {
        await coordinatorAccountService.deleteCoordinator(request.params.id);
        return reply.code(204).send();
      } catch (error: unknown) {
        if (errorCode(error) === 'P2025') {
          return reply.code(404).send({
            error: 'COORDINATOR_NOT_FOUND',
            message: 'Cuenta de coordinador no encontrada.',
          });
        }
        throw error;
      }
    },
  );
};

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}
