import type { FastifyPluginAsync } from 'fastify';
import type { UatService } from '../../../application/services/uat.service.js';
import type { UatStudentService } from '../../../application/services/uat-student.service.js';
import type { IDomainEventBus } from '../../../domain/events/domain-event-bus.js';
import type { SharedClassService } from '../../../application/services/shared-class.service.js';
import type { AttendanceBackendClient } from '../../../infrastructure/http/client/attendance-backend.client.js';
import { AsistenciaController } from '../controllers/asistencia.controller.js';
import { CatalogoController } from '../controllers/catalogo.controller.js';
import { ConsultaController } from '../controllers/consulta.controller.js';
import { SessionController } from '../controllers/session.controller.js';
import { StudentSessionController } from '../controllers/student-session.controller.js';
import { SharedClassController } from '../controllers/shared-class.controller.js';
import { buildAuthUatHook } from '../hooks/auth-uat.hook.js';
import { buildAuthUatStudentHook } from '../hooks/auth-uat-student.hook.js';

export interface UatRoutesOptions {
  uatService: UatService;
  uatStudentService: UatStudentService;
  eventBus: IDomainEventBus;
  sharedClassService: SharedClassService;
  attendanceBackendClient: AttendanceBackendClient;
}

export const uatRoutes: FastifyPluginAsync<UatRoutesOptions> = async (
  fastify,
  { uatService, uatStudentService, eventBus, sharedClassService, attendanceBackendClient },
) => {
  const authUat = buildAuthUatHook(uatService);
  const authUatStudent = buildAuthUatStudentHook(uatStudentService);
  const sessionController = new SessionController(uatService, eventBus);
  const studentSessionController = new StudentSessionController(uatStudentService);
  const consultaController = new ConsultaController(uatService);
  const catalogoController = new CatalogoController(uatService);
  const asistenciaController = new AsistenciaController(uatService, attendanceBackendClient);
  const sharedClassController = new SharedClassController(sharedClassService);

  fastify.post('/api/uat/sessions', sessionController.create);
  fastify.delete('/api/uat/sessions/:sessionId', sessionController.delete);

  fastify.post('/api/uat/alumnos/sessions', studentSessionController.create);
  fastify.delete('/api/uat/alumnos/sessions/:sessionId', studentSessionController.delete);
  fastify.get('/api/uat/alumnos/carreras', { preHandler: authUatStudent }, studentSessionController.careers);
  fastify.post('/api/uat/alumnos/carreras/seleccionar', { preHandler: authUatStudent }, studentSessionController.selectCareer);
  fastify.get('/api/uat/alumnos/horario', { preHandler: authUatStudent }, studentSessionController.schedule);
  fastify.get('/api/uat/alumnos/calificaciones/parciales', { preHandler: authUatStudent }, studentSessionController.partialGrades);
  fastify.get('/api/uat/alumnos/calificaciones/finales', { preHandler: authUatStudent }, studentSessionController.finalGrades);

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
};
