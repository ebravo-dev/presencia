import { timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { CoordinatorAccountService } from '../../../application/services/coordinator-account.service.js';
import type { AttendanceBackendClient } from '../../../infrastructure/http/client/attendance-backend.client.js';
import { env } from '../../../config/env.js';

export interface SuperUserRoutesOptions {
  coordinatorAccountService: CoordinatorAccountService;
  attendanceBackendClient: AttendanceBackendClient;
}

interface SuperUserJwtPayload extends jwt.JwtPayload {
  role: 'SUPER_USER';
}

const SUPER_USER_COOKIE = 'super_user_session';
const sessionDurationSeconds = 4 * 60 * 60;
const defaultDebugSettings = { teacherAttendanceToleranceMinutes: 10 };

const superUserLoginSchema = z.object({
  password: z.string().min(1),
});

const coordinatorCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(['COORDINATOR', 'READ_ONLY']),
});

const coordinatorUpdateSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  password: z.string().min(8).optional(),
  role: z.enum(['COORDINATOR', 'READ_ONLY']).optional(),
  disabled: z.boolean().optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });
const matriculaParamsSchema = z.object({ matricula: z.string().min(1) });
const bindingQuerySchema = z.object({ q: z.string().trim().optional() });
const beaconSchema = z.object({
  classroom: z.string().trim().min(1),
  uuid: z.string().trim().min(8),
});
const beaconUpdateSchema = beaconSchema.partial();
const debugSettingsUpdateSchema = z.object({
  teacherAttendanceToleranceMinutes: z.number().int().min(0).max(120),
});

export const superUserRoutes: FastifyPluginAsync<SuperUserRoutesOptions> = async (
  fastify,
  { coordinatorAccountService, attendanceBackendClient },
) => {
  const requireSuperUser = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = authenticateSuperUser(request.cookies[SUPER_USER_COOKIE]);
    if (!user) {
      return reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Sesion de super usuario requerida.',
      });
    }
  };

  fastify.post(
    '/api/superUsuario/auth/login',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = superUserLoginSchema.safeParse(request.body);
      if (!parsed.success) return sendValidationError(reply, parsed.error.errors.map((issue) => issue.message));

      if (!passwordMatches(parsed.data.password)) {
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Contrasena de super usuario invalida.',
        });
      }

      const expiresAt = new Date(Date.now() + sessionDurationSeconds * 1000);
      const token = jwt.sign({ role: 'SUPER_USER' }, env.COORDINATION_JWT_SECRET, {
        subject: 'superUsuario',
        expiresIn: sessionDurationSeconds,
        issuer: 'presencia-backend-apirest',
      });
      reply.setCookie(SUPER_USER_COOKIE, token, cookieOptions(expiresAt));
      return reply.send({
        data: {
          user: { role: 'SUPER_USER' },
          expiresAt: expiresAt.toISOString(),
        },
      });
    },
  );

  fastify.get('/api/superUsuario/auth/me', { preHandler: requireSuperUser }, async (_request, reply) => {
    return reply.send({ data: { user: { role: 'SUPER_USER' } } });
  });

  fastify.post('/api/superUsuario/auth/logout', { preHandler: requireSuperUser }, async (_request, reply) => {
    reply.clearCookie(SUPER_USER_COOKIE, { path: '/api/superUsuario', sameSite: 'lax' });
    return reply.code(204).send();
  });

  fastify.get('/api/superUsuario/coordinadores', { preHandler: requireSuperUser }, async (_request, reply) => {
    return reply.send(await coordinatorAccountService.listCoordinators());
  });

  fastify.post('/api/superUsuario/coordinadores', { preHandler: requireSuperUser }, async (request, reply) => {
    const parsed = coordinatorCreateSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, parsed.error.errors.map((issue) => issue.message));

    try {
      return reply.code(201).send(await coordinatorAccountService.createCoordinator(parsed.data));
    } catch (error: any) {
      if (error.code === 'P2002') {
        return reply.code(409).send({ error: 'COORDINATOR_EXISTS', message: 'Ya existe una cuenta con ese correo.' });
      }
      throw error;
    }
  });

  fastify.put<{ Params: { id: string } }>('/api/superUsuario/coordinadores/:id', { preHandler: requireSuperUser }, async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error.errors.map((issue) => issue.message));
    const parsed = coordinatorUpdateSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, parsed.error.errors.map((issue) => issue.message));

    try {
      return reply.send(await coordinatorAccountService.updateCoordinator(params.data.id, parsed.data));
    } catch (error: any) {
      if (error.code === 'P2025') {
        return reply.code(404).send({ error: 'COORDINATOR_NOT_FOUND', message: 'Cuenta de coordinador no encontrada.' });
      }
      if (error.code === 'P2002') {
        return reply.code(409).send({ error: 'COORDINATOR_EXISTS', message: 'Ya existe una cuenta con ese correo.' });
      }
      throw error;
    }
  });

  fastify.delete<{ Params: { id: string } }>('/api/superUsuario/coordinadores/:id', { preHandler: requireSuperUser }, async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error.errors.map((issue) => issue.message));

    try {
      await coordinatorAccountService.deleteCoordinator(params.data.id);
      return reply.code(204).send();
    } catch (error: any) {
      if (error.code === 'P2025') {
        return reply.code(404).send({ error: 'COORDINATOR_NOT_FOUND', message: 'Cuenta de coordinador no encontrada.' });
      }
      throw error;
    }
  });

  fastify.get('/api/superUsuario/beacons', { preHandler: requireSuperUser }, async (_request, reply) => {
    return reply.send(await attendanceBackendClient.listBeacons());
  });

  fastify.post('/api/superUsuario/beacons', { preHandler: requireSuperUser }, async (request, reply) => {
    const parsed = beaconSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, parsed.error.errors.map((issue) => issue.message));
    return reply.code(201).send(await attendanceBackendClient.createBeacon(parsed.data));
  });

  fastify.put<{ Params: { id: string } }>('/api/superUsuario/beacons/:id', { preHandler: requireSuperUser }, async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error.errors.map((issue) => issue.message));
    const parsed = beaconUpdateSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, parsed.error.errors.map((issue) => issue.message));
    return reply.send(await attendanceBackendClient.updateBeacon(params.data.id, parsed.data));
  });

  fastify.delete<{ Params: { id: string } }>('/api/superUsuario/beacons/:id', { preHandler: requireSuperUser }, async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error.errors.map((issue) => issue.message));
    await attendanceBackendClient.deleteBeacon(params.data.id);
    return reply.code(204).send();
  });

  fastify.get('/api/superUsuario/alumnos-vinculados', { preHandler: requireSuperUser }, async (request, reply) => {
    const parsed = bindingQuerySchema.safeParse(request.query);
    if (!parsed.success) return sendValidationError(reply, parsed.error.errors.map((issue) => issue.message));
    return reply.send(await attendanceBackendClient.listStudentDeviceBindings({ q: parsed.data.q }));
  });

  fastify.delete<{ Params: { matricula: string } }>('/api/superUsuario/alumnos-vinculados/:matricula', { preHandler: requireSuperUser }, async (request, reply) => {
    const params = matriculaParamsSchema.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error.errors.map((issue) => issue.message));
    await attendanceBackendClient.deleteStudentDeviceBinding(decodeURIComponent(params.data.matricula));
    return reply.code(204).send();
  });

  fastify.get('/api/superUsuario/debug/status', { preHandler: requireSuperUser }, async (_request, reply) => {
    return reply.send({
      data: {
        enabled: env.PRESENCIA_DEBUG_MODE,
        period: env.PRESENCIA_DEBUG_CYCLE_NAME,
        settings: defaultDebugSettings,
        apiRestPolicy: env.PRESENCIA_DEBUG_MODE
          ? 'Modo debug activo en backend-apirest.'
          : 'Flujo real habilitado desde backend-apirest.',
      },
      meta: { generatedAt: new Date().toISOString() },
    });
  });

  fastify.get('/api/superUsuario/debug/settings', { preHandler: requireSuperUser }, async (_request, reply) => {
    return reply.send({ data: defaultDebugSettings, meta: { generatedAt: new Date().toISOString() } });
  });

  fastify.put('/api/superUsuario/debug/settings', { preHandler: requireSuperUser }, async (request, reply) => {
    const parsed = debugSettingsUpdateSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, parsed.error.errors.map((issue) => issue.message));
    return reply.send({ data: parsed.data, meta: { generatedAt: new Date().toISOString() } });
  });

  fastify.get('/api/superUsuario/debug/classes', { preHandler: requireSuperUser }, async (_request, reply) => {
    return reply.send({ data: [], meta: { generatedAt: new Date().toISOString() } });
  });

  fastify.post('/api/superUsuario/debug/classes', { preHandler: requireSuperUser }, async (_request, reply) => {
    return reply.code(501).send({
      error: 'DEBUG_CLASSES_NOT_AVAILABLE',
      message: 'Las clases debug no estan disponibles en backend-apirest.',
    });
  });

  fastify.put('/api/superUsuario/debug/classes/:id', { preHandler: requireSuperUser }, async (_request, reply) => {
    return reply.code(501).send({
      error: 'DEBUG_CLASSES_NOT_AVAILABLE',
      message: 'Las clases debug no estan disponibles en backend-apirest.',
    });
  });

  fastify.get('/api/superUsuario/debug/student-attendance', { preHandler: requireSuperUser }, async (_request, reply) => {
    return reply.send({ data: [], meta: { generatedAt: new Date().toISOString() } });
  });

  fastify.get('/api/superUsuario/debug/flow-logs', { preHandler: requireSuperUser }, async (_request, reply) => {
    return reply.send({
      data: {
        syncJobs: [],
        attendanceRecords: [],
        recentBindings: [],
      },
      meta: { generatedAt: new Date().toISOString() },
    });
  });
};

function passwordMatches(candidate: string): boolean {
  const expected = Buffer.from(env.SUPER_USER_PASSWORD);
  const actual = Buffer.from(candidate);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function authenticateSuperUser(token?: string): { role: 'SUPER_USER' } | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.COORDINATION_JWT_SECRET, { issuer: 'presencia-backend-apirest' }) as SuperUserJwtPayload;
    if (payload.sub !== 'superUsuario' || payload.role !== 'SUPER_USER') return null;
    return { role: 'SUPER_USER' };
  } catch {
    return null;
  }
}

function cookieOptions(expires: Date) {
  return {
    path: '/api/superUsuario',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.COORDINATION_COOKIE_SECURE ?? env.NODE_ENV === 'production',
    expires,
  };
}

function sendValidationError(reply: FastifyReply, messages: string[]) {
  return reply.code(400).send({
    statusCode: 400,
    error: 'Validation Error',
    message: messages.join(', '),
  });
}
