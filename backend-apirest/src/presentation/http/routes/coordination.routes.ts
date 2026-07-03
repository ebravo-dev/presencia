import type { FastifyPluginAsync } from 'fastify';
import type { CoordinationService } from '../../../application/services/coordination.service.js';
import type { CoordinatorAuthService } from '../../../application/services/coordinator-auth.service.js';
import type { WeeklyAttendanceReportService } from '../../../application/services/weekly-attendance-report.service.js';
import { CoordinationController } from '../controllers/coordination.controller.js';
import { coordinationRouteSchemas } from '../schemas/coordination.schemas.js';
import { buildCoordinatorAuthHook } from '../hooks/coordinator-auth.hook.js';

export interface CoordinationRoutesOptions {
  coordinationService: CoordinationService;
  authService: CoordinatorAuthService;
  weeklyAttendanceReport: WeeklyAttendanceReportService;
}

export const coordinationRoutes: FastifyPluginAsync<CoordinationRoutesOptions> = async (
  fastify,
  { coordinationService, authService, weeklyAttendanceReport },
) => {
  fastify.addHook('preHandler', buildCoordinatorAuthHook(authService));
  const controller = new CoordinationController(coordinationService, weeklyAttendanceReport);

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
};
