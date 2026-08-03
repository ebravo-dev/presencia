import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { SuperUserAuthService } from '../../../application/services/super-user-auth.service.js';
import type { AttendanceBackendClient } from '../../../infrastructure/http/client/attendance-backend.client.js';
import type { AttendanceServiceCommandClient } from '../../../infrastructure/http/client/attendance-service-command.client.js';
import type { IdentityServiceClient } from '../../../infrastructure/http/client/identity-service.client.js';
import { env } from '../../../config/env.js';
import { buildSuperUserAuthHook, SUPER_USER_COOKIE } from '../hooks/super-user-auth.hook.js';

interface SuperUserRoutesOptions {
  authService: SuperUserAuthService;
  identityService: IdentityServiceClient;
  attendanceService: AttendanceServiceCommandClient;
  attendanceBackend: AttendanceBackendClient;
}

const loginSchema = z.object({ password: z.string().min(1).max(256) });
const coordinatorCreateSchema = z.object({
  email: z.string().email(), name: z.string().trim().min(1), password: z.string().min(8),
  role: z.enum(['COORDINATOR', 'READ_ONLY']).default('COORDINATOR'),
});
const coordinatorUpdateSchema = coordinatorCreateSchema.partial().extend({ disabled: z.boolean().optional() });
const beaconSchema = z.object({ classroom: z.string().trim().min(1), uuid: z.string().trim().min(8) });
const beaconUpdateSchema = beaconSchema.partial();

export const superUserRoutes: FastifyPluginAsync<SuperUserRoutesOptions> = async (
  fastify,
  { authService, identityService, attendanceService, attendanceBackend },
) => {
  fastify.post('/api/superUsuario/auth/login', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const input = loginSchema.parse(request.body);
    try {
      const session = await authService.login(input.password);
      reply.setCookie(SUPER_USER_COOKIE, session.token, cookieOptions(session.expiresAt));
      return reply.send({ data: { user: { role: session.user.role }, expiresAt: session.expiresAt.toISOString() } });
    } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_SUPER_USER_PASSWORD') {
        return reply.code(401).send({ error: 'INVALID_SUPER_USER_PASSWORD', message: 'Contraseña de super usuario inválida.' });
      }
      throw error;
    }
  });

  fastify.post('/api/superUsuario/auth/logout', async (request, reply) => {
    await authService.logout(request.cookies[SUPER_USER_COOKIE]);
    reply.clearCookie(SUPER_USER_COOKIE, cookieClearOptions());
    return reply.code(204).send();
  });

  const requireSuperUser = buildSuperUserAuthHook(authService);
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.routeOptions.url === '/api/superUsuario/auth/login'
      || request.routeOptions.url === '/api/superUsuario/auth/logout') return;
    return requireSuperUser(request, reply);
  });

  fastify.get('/api/superUsuario/auth/me', async (request) => ({ data: { user: { role: request.superUser?.role } } }));
  fastify.get('/api/superUsuario/coordinadores', async () => identityService.listStaffAccounts());
  fastify.post('/api/superUsuario/coordinadores', async (request, reply) => {
    const input = coordinatorCreateSchema.parse(request.body);
    return reply.code(201).send(await identityService.createStaffAccount({
      ...input, ...staffAudit(request.superUser?.id, request.id, 'Alta de cuenta coordinadora.'),
    }));
  });
  fastify.put<{ Params: { id: string } }>('/api/superUsuario/coordinadores/:id', async (request) => {
    const input = coordinatorUpdateSchema.parse(request.body);
    return identityService.updateStaffAccount(request.params.id, {
      ...input, ...staffAudit(request.superUser?.id, request.id, 'Actualización de cuenta coordinadora.'),
    });
  });
  fastify.delete<{ Params: { id: string } }>('/api/superUsuario/coordinadores/:id', async (request, reply) => {
    await identityService.deleteStaffAccount(
      request.params.id,
      staffAudit(request.superUser?.id, request.id, 'Baja de cuenta coordinadora.'),
    );
    return reply.code(204).send();
  });

  fastify.get('/api/superUsuario/beacons', async () => attendanceService.listClassroomBeacons());
  fastify.post('/api/superUsuario/beacons', async (request, reply) => {
    const input = beaconSchema.parse(request.body);
    return reply.code(201).send(await attendanceService.createClassroomBeacon({
      ...input, ...actor(request.superUser?.id, request.id, 'Alta de beacon desde super usuario.'),
    }));
  });
  fastify.put<{ Params: { id: string } }>('/api/superUsuario/beacons/:id', async (request) => {
    const input = beaconUpdateSchema.parse(request.body);
    return attendanceService.updateClassroomBeacon(request.params.id, {
      ...input, ...actor(request.superUser?.id, request.id, 'Actualización de beacon desde super usuario.'),
    });
  });
  fastify.delete<{ Params: { id: string } }>('/api/superUsuario/beacons/:id', async (request, reply) => {
    await attendanceService.deleteClassroomBeacon(request.params.id, actor(
      request.superUser?.id, request.id, 'Baja de beacon desde super usuario.',
    ));
    return reply.code(204).send();
  });

  fastify.get('/api/superUsuario/alumnos-vinculados', async (request) => {
    const { q } = request.query as { q?: string };
    return attendanceService.listStudentDeviceBindings({ q });
  });
  fastify.delete<{ Params: { matricula: string } }>('/api/superUsuario/alumnos-vinculados/:matricula', async (request, reply) => {
    await attendanceService.unbindStudentDevice({
      matricula: request.params.matricula,
      ...actor(request.superUser?.id, request.id, 'Desvinculación solicitada desde super usuario.'),
    });
    return reply.code(204).send();
  });

  fastify.get('/api/superUsuario/debug/status', async () => attendanceBackend.getDebugStatus());
  fastify.get('/api/superUsuario/debug/settings', async () => attendanceBackend.getDebugSettings());
  fastify.put('/api/superUsuario/debug/settings', async (request) => attendanceBackend.updateDebugSettings(request.body));
  fastify.get('/api/superUsuario/debug/classes', async () => attendanceBackend.listDebugClasses());
  fastify.post('/api/superUsuario/debug/classes', async (request) => attendanceBackend.createDebugClass(request.body));
  fastify.put<{ Params: { id: string } }>('/api/superUsuario/debug/classes/:id', async (request) => attendanceBackend.updateDebugClass(request.params.id, request.body));
  fastify.get('/api/superUsuario/debug/student-attendance', async () => attendanceBackend.listDebugStudentAttendance());
  fastify.get('/api/superUsuario/debug/flow-logs', async () => attendanceBackend.listDebugFlowLogs());
};

function actor(identityId: string | undefined, correlationId: string, reason: string) {
  if (!identityId) throw new Error('SUPER_USER_IDENTITY_REQUIRED');
  return { actorIdentityId: identityId, actorRole: 'SUPER_USER' as const, reason, correlationId };
}

function staffAudit(identityId: string | undefined, correlationId: string, reason: string) {
  if (!identityId) throw new Error('SUPER_USER_IDENTITY_REQUIRED');
  return { actorIdentityId: identityId, correlationId, reason };
}

function cookieOptions(expires: Date) {
  return {
    path: '/api/superUsuario', httpOnly: true, sameSite: 'strict' as const,
    secure: env.COORDINATION_COOKIE_SECURE ?? env.NODE_ENV === 'production', expires,
  };
}

function cookieClearOptions() {
  return {
    path: '/api/superUsuario', httpOnly: true, sameSite: 'strict' as const,
    secure: env.COORDINATION_COOKIE_SECURE ?? env.NODE_ENV === 'production',
  };
}
