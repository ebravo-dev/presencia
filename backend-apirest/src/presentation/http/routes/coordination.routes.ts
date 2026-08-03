import type { FastifyPluginAsync } from 'fastify';
import type { CoordinatorAuthService } from '../../../application/services/coordinator-auth.service.js';
import type { AcademicServiceClient } from '../../../infrastructure/http/client/academic-service.client.js';
import type { AttendanceServiceCommandClient } from '../../../infrastructure/http/client/attendance-service-command.client.js';
import type { CoordinationQueryClient } from '../../../infrastructure/http/client/coordination-query.client.js';
import { CoordinationController } from '../controllers/coordination.controller.js';
import { coordinationRouteSchemas } from '../schemas/coordination.schemas.js';
import { buildCoordinatorAuthHook } from '../hooks/coordinator-auth.hook.js';

export interface CoordinationRoutesOptions {
  authService: CoordinatorAuthService;
  academicServiceClient: AcademicServiceClient;
  attendanceServiceCommands: AttendanceServiceCommandClient;
  coordinationQuery: CoordinationQueryClient;
}

export const coordinationRoutes: FastifyPluginAsync<CoordinationRoutesOptions> = async (
  fastify,
  { authService, academicServiceClient, attendanceServiceCommands, coordinationQuery },
) => {
  fastify.addHook('preHandler', buildCoordinatorAuthHook(authService));
  const requireWriteCoordinator = buildCoordinatorAuthHook(authService, { write: true });
  const controller = new CoordinationController(
    academicServiceClient,
    attendanceServiceCommands,
    coordinationQuery,
  );

  fastify.get('/api/coordinacion/resumen', { schema: coordinationRouteSchemas.overview }, controller.overview);
  fastify.get(
    '/api/coordinacion/coordinaciones',
    { schema: coordinationRouteSchemas.coordinations },
    controller.coordinations,
  );
  fastify.get('/api/coordinacion/profesores', { schema: coordinationRouteSchemas.teachers }, controller.teachers);
  fastify.get(
    '/api/coordinacion/profesores/:teacherId/asignaciones',
    { schema: coordinationRouteSchemas.teacherAssignments },
    controller.teacherAssignments,
  );
  fastify.get(
    '/api/coordinacion/reportes/asistencia-semanal',
    { schema: coordinationRouteSchemas.weeklyReport },
    controller.weeklyReport,
  );
  fastify.get(
    '/api/coordinacion/reportes/asistencia-rango',
    { schema: coordinationRouteSchemas.rangeReport },
    controller.rangeReport,
  );

  // El BFF autentica y delega; los datos pertenecen a sus servicios de dominio.
  fastify.get('/api/coordinacion/infraestructura/resumen', controller.infrastructureSummary);
  fastify.get('/api/coordinacion/infraestructura/beacons', controller.beacons);
  fastify.post('/api/coordinacion/infraestructura/beacons', { preHandler: requireWriteCoordinator }, controller.createBeacon);
  fastify.put<{ Params: { id: string } }>('/api/coordinacion/infraestructura/beacons/:id', { preHandler: requireWriteCoordinator }, controller.updateBeacon);
  fastify.delete<{ Params: { id: string } }>('/api/coordinacion/infraestructura/beacons/:id', { preHandler: requireWriteCoordinator }, controller.deleteBeacon);
  fastify.get('/api/coordinacion/infraestructura/alumnos-vinculados', controller.studentDeviceBindings);
  fastify.delete<{ Params: { matricula: string } }>(
    '/api/coordinacion/infraestructura/alumnos-vinculados/:matricula',
    { preHandler: requireWriteCoordinator },
    controller.deleteStudentDeviceBinding,
  );
  fastify.get('/api/coordinacion/clases-compartidas/opciones', controller.sharedClassOptions);
  fastify.get('/api/coordinacion/clases-compartidas', controller.sharedClasses);
  fastify.post('/api/coordinacion/clases-compartidas', { preHandler: requireWriteCoordinator }, controller.createSharedClass);
  fastify.put('/api/coordinacion/clases-compartidas/:id', { preHandler: requireWriteCoordinator }, controller.updateSharedClass);
  fastify.delete('/api/coordinacion/clases-compartidas/:id', { preHandler: requireWriteCoordinator }, controller.deleteSharedClass);
};
