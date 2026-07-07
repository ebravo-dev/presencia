import type { FastifyPluginAsync } from 'fastify';
import type { CoordinationService } from '../../../application/services/coordination.service.js';
import type { CoordinatorAuthService } from '../../../application/services/coordinator-auth.service.js';
import type { WeeklyAttendanceReportService } from '../../../application/services/weekly-attendance-report.service.js';
import type { AttendanceBackendClient } from '../../../infrastructure/http/client/attendance-backend.client.js';
import type { SharedClassService } from '../../../application/services/shared-class.service.js';
import { CoordinationController } from '../controllers/coordination.controller.js';
import { coordinationRouteSchemas } from '../schemas/coordination.schemas.js';
import { buildCoordinatorAuthHook } from '../hooks/coordinator-auth.hook.js';

export interface CoordinationRoutesOptions {
  coordinationService: CoordinationService;
  authService: CoordinatorAuthService;
  weeklyAttendanceReport: WeeklyAttendanceReportService;
  attendanceBackendClient: AttendanceBackendClient;
  sharedClassService: SharedClassService;
}

export const coordinationRoutes: FastifyPluginAsync<CoordinationRoutesOptions> = async (
  fastify,
  { coordinationService, authService, weeklyAttendanceReport, attendanceBackendClient, sharedClassService },
) => {
  fastify.addHook('preHandler', buildCoordinatorAuthHook(authService));
  const requireWriteCoordinator = buildCoordinatorAuthHook(authService, { write: true });
  const controller = new CoordinationController(coordinationService, weeklyAttendanceReport, attendanceBackendClient, sharedClassService);

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

  fastify.get('/api/coordinacion/clases-compartidas/opciones', controller.sharedClassOptions);
  fastify.get('/api/coordinacion/clases-compartidas', controller.sharedClasses);
  fastify.post('/api/coordinacion/clases-compartidas', { preHandler: requireWriteCoordinator }, controller.createSharedClass);
  fastify.put('/api/coordinacion/clases-compartidas/:id', { preHandler: requireWriteCoordinator }, controller.updateSharedClass);
  fastify.delete('/api/coordinacion/clases-compartidas/:id', { preHandler: requireWriteCoordinator }, controller.deleteSharedClass);
};
