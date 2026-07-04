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

  fastify.get('/api/coordinacion/infraestructura/resumen', controller.infrastructureSummary);
  fastify.get('/api/coordinacion/infraestructura/beacons', controller.beacons);
  fastify.post('/api/coordinacion/infraestructura/beacons', controller.createBeacon);
  fastify.put('/api/coordinacion/infraestructura/beacons/:id', controller.updateBeacon);
  fastify.delete('/api/coordinacion/infraestructura/beacons/:id', controller.deleteBeacon);
  fastify.get('/api/coordinacion/infraestructura/alumnos-vinculados', controller.studentDeviceBindings);
  fastify.delete('/api/coordinacion/infraestructura/alumnos-vinculados/:matricula', controller.deleteStudentDeviceBinding);
  fastify.get('/api/coordinacion/clases-compartidas/opciones', controller.sharedClassOptions);
  fastify.get('/api/coordinacion/clases-compartidas', controller.sharedClasses);
  fastify.post('/api/coordinacion/clases-compartidas', controller.createSharedClass);
  fastify.put('/api/coordinacion/clases-compartidas/:id', controller.updateSharedClass);
  fastify.delete('/api/coordinacion/clases-compartidas/:id', controller.deleteSharedClass);
  fastify.get('/api/coordinacion/infraestructura/sustituciones/opciones', controller.substitutionOptions);
  fastify.get('/api/coordinacion/infraestructura/sustituciones', controller.substituteAssignments);
  fastify.post('/api/coordinacion/infraestructura/sustituciones', controller.createSubstituteAssignment);
  fastify.put('/api/coordinacion/infraestructura/sustituciones/:id', controller.updateSubstituteAssignment);
  fastify.delete('/api/coordinacion/infraestructura/sustituciones/:id', controller.deleteSubstituteAssignment);
};
