import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { UatService } from '../../../application/services/uat.service.js';
import type { UatStudentService } from '../../../application/services/uat-student.service.js';
import type { IDomainEventBus } from '../../../domain/events/domain-event-bus.js';
import type { AcademicServiceClient } from '../../../infrastructure/http/client/academic-service.client.js';
import type { AttendanceUploadService } from '../../../application/services/attendance-upload.service.js';
import type { AttendanceUploadWorker } from '../../../infrastructure/jobs/attendance-upload.worker.js';
import type { AttendanceCaptureClient } from '../../../infrastructure/http/client/attendance-capture.client.js';
import type { AttendanceServiceCommandClient } from '../../../infrastructure/http/client/attendance-service-command.client.js';
import { AsistenciaController } from '../controllers/asistencia.controller.js';
import { AttendanceUploadController } from '../controllers/attendance-upload.controller.js';
import { CatalogoController } from '../controllers/catalogo.controller.js';
import { ConsultaController } from '../controllers/consulta.controller.js';
import { SessionController } from '../controllers/session.controller.js';
import { StudentSessionController } from '../controllers/student-session.controller.js';
import { SharedClassController } from '../controllers/shared-class.controller.js';
import { ProfessorDeviceBindingController } from '../controllers/professor-device-binding.controller.js';
import { ProfessorPresenceController } from '../controllers/professor-presence.controller.js';
import { buildAuthUatHook } from '../hooks/auth-uat.hook.js';
import { buildAuthUatStudentHook } from '../hooks/auth-uat-student.hook.js';
import { env } from '../../../config/env.js';

export interface UatRoutesOptions {
  uatService: UatService;
  uatStudentService: UatStudentService;
  eventBus: IDomainEventBus;
  academicServiceClient: AcademicServiceClient;
  attendanceUploadService: AttendanceUploadService;
  attendanceUploadWorker: AttendanceUploadWorker;
  attendanceCaptureClient: AttendanceCaptureClient;
  attendanceServiceCommands?: AttendanceServiceCommandClient;
}

export const uatRoutes: FastifyPluginAsync<UatRoutesOptions> = async (
  fastify,
  { uatService, uatStudentService, eventBus, academicServiceClient, attendanceUploadService, attendanceUploadWorker, attendanceCaptureClient, attendanceServiceCommands },
) => {
  const authUat = buildAuthUatHook(uatService);
  const authUatStudent = buildAuthUatStudentHook(uatStudentService);
  const internal = async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.headers['x-internal-service-token'] !== env.INTERNAL_API_TOKEN) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
  };
  const sessionController = new SessionController(uatService, eventBus, attendanceServiceCommands);
  const studentSessionController = new StudentSessionController(uatStudentService);
  const consultaController = new ConsultaController(uatService);
  const catalogoController = new CatalogoController(uatService);
  const asistenciaController = new AsistenciaController(
    uatService, attendanceCaptureClient, attendanceUploadService, attendanceUploadWorker,
  );
  const attendanceUploadController = new AttendanceUploadController(attendanceUploadService);
  const sharedClassController = new SharedClassController(academicServiceClient);
  const professorDeviceBindingController = new ProfessorDeviceBindingController(attendanceServiceCommands);
  const professorPresenceController = new ProfessorPresenceController(attendanceServiceCommands);

  fastify.post('/api/uat/sessions', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, sessionController.create);
  fastify.get('/internal/v1/config/academic-cycle', { preHandler: internal }, () => academicServiceClient.activeAcademicCycle());
  fastify.delete('/api/uat/sessions/:sessionId', sessionController.delete);

  fastify.post('/api/uat/alumnos/sessions', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, studentSessionController.create);
  fastify.delete('/api/uat/alumnos/sessions/:sessionId', studentSessionController.delete);
  fastify.get('/api/uat/alumnos/carreras', { preHandler: authUatStudent }, studentSessionController.careers);
  fastify.post('/api/uat/alumnos/carreras/seleccionar', { preHandler: authUatStudent }, studentSessionController.selectCareer);
  fastify.get('/api/uat/alumnos/horario', { preHandler: authUatStudent }, studentSessionController.schedule);
  fastify.get('/api/uat/alumnos/calificaciones/parciales', { preHandler: authUatStudent }, studentSessionController.partialGrades);
  fastify.get('/api/uat/alumnos/calificaciones/finales', { preHandler: authUatStudent }, studentSessionController.finalGrades);
  fastify.get('/api/uat/alumnos/asistencia/configuracion', { preHandler: authUatStudent }, sessionController.settings);

  fastify.get('/api/uat/profesor/consultas/horarios', { preHandler: authUat }, consultaController.horarios);
  fastify.get('/api/uat/profesor/consultas/examenes', { preHandler: authUat }, consultaController.examenes);
  fastify.post('/api/uat/profesor/sync', { preHandler: authUat }, sessionController.sync);
  fastify.get('/api/uat/profesor/ciclo-escolar', { preHandler: authUat }, () => academicServiceClient.activeAcademicCycle());
  fastify.get('/api/uat/profesor/asistencia/configuracion', { preHandler: authUat }, sessionController.settings);
  fastify.post('/api/uat/profesor/consultas/snapshot', consultaController.snapshot);

  fastify.get('/api/uat/catalogos/niveles-educativos', { preHandler: authUat }, catalogoController.nivelesEducativos);
  fastify.get('/api/uat/catalogos/campus', { preHandler: authUat }, catalogoController.campus);
  fastify.get('/api/uat/catalogos/des', { preHandler: authUat }, catalogoController.des);
  fastify.get('/api/uat/catalogos/ciclos-escolares', { preHandler: authUat }, catalogoController.ciclosEscolares);

  fastify.get('/api/uat/profesor/control-asistencia/grupos', { preHandler: authUat }, asistenciaController.gruposProfesor);
  fastify.get('/api/uat/profesor/clases-compartidas', { preHandler: authUat }, sharedClassController.forAuthenticatedTeacher);
  fastify.post('/api/uat/profesor/device-bindings/resolve', { preHandler: authUat }, professorDeviceBindingController.resolve);
  fastify.post('/api/uat/profesor/beacons/resolve', { preHandler: authUat }, professorDeviceBindingController.resolveBeacons);
  fastify.post('/api/uat/profesor/presencia/entrada', { preHandler: authUat }, professorPresenceController.entry);
  fastify.post('/api/uat/profesor/presencia/salida', { preHandler: authUat }, professorPresenceController.exit);
  fastify.post('/api/uat/profesor/presencia/alumnos', { preHandler: authUat }, professorPresenceController.studentDetections);
  fastify.get('/api/uat/profesor/control-asistencia/semanas', { preHandler: authUat }, asistenciaController.semanasGrupo);
  fastify.get(
    '/api/uat/profesor/control-asistencia/asistencia-grupo',
    { preHandler: authUat },
    asistenciaController.asistenciaGrupo,
  );
  fastify.post('/api/uat/profesor/control-asistencia/asistencias', { preHandler: authUat }, async (request, reply) => {
    return reply.code(202).send(await asistenciaController.guardar(request));
  });
  fastify.post('/api/uat/asistencia/guardar', { preHandler: authUat }, async (request, reply) => {
    return reply.code(202).send(await asistenciaController.guardar(request));
  });
  fastify.post('/api/uat/asistencia/registros/estado', { preHandler: authUat }, attendanceUploadController.recordStatuses);
};
