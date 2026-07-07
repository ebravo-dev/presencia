import type { FastifyPluginAsync } from 'fastify';
import type { UatService } from '../../../application/services/uat.service.js';
import type { IDomainEventBus } from '../../../domain/events/domain-event-bus.js';
import type { SharedClassService } from '../../../application/services/shared-class.service.js';
import type { AttendanceUploadService } from '../../../application/services/attendance-upload.service.js';
import type { AttendanceUploadWorker } from '../../../infrastructure/jobs/attendance-upload.worker.js';
import { AsistenciaController } from '../controllers/asistencia.controller.js';
import { AttendanceUploadController } from '../controllers/attendance-upload.controller.js';
import { CatalogoController } from '../controllers/catalogo.controller.js';
import { ConsultaController } from '../controllers/consulta.controller.js';
import { SessionController } from '../controllers/session.controller.js';
import { SharedClassController } from '../controllers/shared-class.controller.js';
import { buildAuthUatHook } from '../hooks/auth-uat.hook.js';

export interface UatRoutesOptions {
  uatService: UatService;
  eventBus: IDomainEventBus;
  sharedClassService: SharedClassService;
  attendanceUploadService: AttendanceUploadService;
  attendanceUploadWorker: AttendanceUploadWorker;
}

export const uatRoutes: FastifyPluginAsync<UatRoutesOptions> = async (
  fastify,
  { uatService, eventBus, sharedClassService, attendanceUploadService, attendanceUploadWorker },
) => {
  const authUat = buildAuthUatHook(uatService);
  const sessionController = new SessionController(uatService, eventBus);
  const consultaController = new ConsultaController(uatService);
  const catalogoController = new CatalogoController(uatService);
  const asistenciaController = new AsistenciaController(uatService);
  const attendanceUploadController = new AttendanceUploadController(attendanceUploadService, attendanceUploadWorker);
  const sharedClassController = new SharedClassController(sharedClassService);

  fastify.post('/api/uat/sessions', sessionController.create);
  fastify.delete('/api/uat/sessions/:sessionId', sessionController.delete);

  fastify.get('/api/uat/profesor/consultas/horarios', { preHandler: authUat }, consultaController.horarios);
  fastify.get('/api/uat/profesor/consultas/examenes', { preHandler: authUat }, consultaController.examenes);
  fastify.post('/api/uat/profesor/consultas/snapshot', consultaController.snapshot);

  fastify.get('/api/uat/catalogos/niveles-educativos', { preHandler: authUat }, catalogoController.nivelesEducativos);
  fastify.get('/api/uat/catalogos/campus', { preHandler: authUat }, catalogoController.campus);
  fastify.get('/api/uat/catalogos/des', { preHandler: authUat }, catalogoController.des);
  fastify.get('/api/uat/catalogos/ciclos-escolares', { preHandler: authUat }, catalogoController.ciclosEscolares);

  fastify.get('/api/uat/profesor/control-asistencia/grupos', { preHandler: authUat }, asistenciaController.gruposProfesor);
  fastify.get('/api/uat/profesor/clases-compartidas', { preHandler: authUat }, sharedClassController.forAuthenticatedTeacher);
  fastify.get('/api/uat/profesor/control-asistencia/semanas', { preHandler: authUat }, asistenciaController.semanasGrupo);
  fastify.get(
    '/api/uat/profesor/control-asistencia/asistencia-grupo',
    { preHandler: authUat },
    asistenciaController.asistenciaGrupo,
  );
  fastify.post('/api/uat/profesor/control-asistencia/asistencias', { preHandler: authUat }, asistenciaController.guardar);
  fastify.post('/api/uat/asistencia/guardar', { preHandler: authUat }, asistenciaController.guardar);
  fastify.post('/api/uat/asistencia/lotes', { preHandler: authUat }, attendanceUploadController.submit);
  fastify.post('/api/uat/asistencia/registros/estado', { preHandler: authUat }, attendanceUploadController.recordStatuses);
  fastify.get('/api/uat/asistencia/lotes/:batchId', { preHandler: authUat }, attendanceUploadController.status);
};
