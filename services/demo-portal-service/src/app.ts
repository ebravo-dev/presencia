import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { DemoCatalogService } from './catalog.service.js';
import { DemoCatalogError } from './catalog.service.js';
import type { DemoPortalEnv } from './config.js';
import {
  classStudentSchema, createDemoClassSchema, createDemoStudentSchema, createDemoTeacherSchema,
  registeredStudentMembershipSchema,
  simulateAttendanceSchema,
  updateDemoClassSchema, updateDemoSettingsSchema, updateDemoStudentSchema, updateDemoTeacherSchema,
} from './model.js';

export async function buildDemoPortalApp(options: {
  env: DemoPortalEnv;
  catalog: DemoCatalogService;
  ready: () => Promise<boolean>;
}) {
  const app = Fastify({ logger: { level: options.env.NODE_ENV === 'test' ? 'silent' : 'info' } });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { global: false });
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => done(null, body));

  app.get('/health', async () => ({ status: 'ok', service: 'demo-portal-service', enabled: options.env.PRESENCIA_DEBUG_MODE }));
  app.get('/health/live', async () => ({ status: 'ok', service: 'demo-portal-service' }));
  app.get('/health/ready', async (_request, reply) => {
    const redis = await options.ready();
    return reply.code(redis ? 200 : 503).send({ status: redis ? 'ok' : 'degraded', enabled: options.env.PRESENCIA_DEBUG_MODE, dependencies: { redis } });
  });

  const internal = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!options.env.PRESENCIA_DEBUG_MODE || request.headers['x-internal-service-token'] !== options.env.INTERNAL_API_TOKEN) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
  };

  app.get('/internal/v1/demo/status', { preHandler: internal }, async () => ({
    data: {
      cycleId: options.env.PRESENCIA_DEMO_CYCLE_ID,
      cycleName: options.env.PRESENCIA_DEMO_CYCLE_NAME,
      coordinationId: options.env.PRESENCIA_DEMO_COORDINATION_ID,
      coordinationName: options.env.PRESENCIA_DEMO_COORDINATION_NAME,
      ...(await options.catalog.snapshot()),
    },
  }));
  app.get('/internal/v1/demo/catalog', { preHandler: internal }, async () => ({ data: await options.catalog.snapshot() }));
  app.post('/internal/v1/demo/teachers', { preHandler: internal }, async (request, reply) => {
    const teacher = await options.catalog.createTeacher(createDemoTeacherSchema.parse(request.body));
    return reply.code(201).send({ data: teacher });
  });
  app.put('/internal/v1/demo/teachers/:id', { preHandler: internal }, async (request) => ({
    data: await options.catalog.updateTeacher((request.params as { id: string }).id, updateDemoTeacherSchema.parse(request.body)),
  }));
  app.delete('/internal/v1/demo/teachers/:id', { preHandler: internal }, async (request, reply) => {
    await options.catalog.deleteTeacher((request.params as { id: string }).id);
    return reply.code(204).send();
  });
  app.post('/internal/v1/demo/students', { preHandler: internal }, async (request, reply) => {
    const student = await options.catalog.createStudent(createDemoStudentSchema.parse(request.body));
    return reply.code(201).send({ data: student });
  });
  app.put('/internal/v1/demo/students/:id', { preHandler: internal }, async (request) => ({
    data: await options.catalog.updateStudent((request.params as { id: string }).id, updateDemoStudentSchema.parse(request.body)),
  }));
  app.delete('/internal/v1/demo/students/:id', { preHandler: internal }, async (request, reply) => {
    await options.catalog.deleteStudent((request.params as { id: string }).id);
    return reply.code(204).send();
  });
  app.post('/internal/v1/demo/classes', { preHandler: internal }, async (request, reply) => {
    const item = await options.catalog.createClass(createDemoClassSchema.parse(request.body));
    return reply.code(201).send({ data: item });
  });
  app.put('/internal/v1/demo/classes/:id', { preHandler: internal }, async (request) => ({
    data: await options.catalog.updateClass((request.params as { id: string }).id, updateDemoClassSchema.parse(request.body)),
  }));
  app.delete('/internal/v1/demo/classes/:id', { preHandler: internal }, async (request, reply) => {
    await options.catalog.deleteClass((request.params as { id: string }).id);
    return reply.code(204).send();
  });
  app.post('/internal/v1/demo/classes/:id/students', { preHandler: internal }, async (request, reply) => {
    const { studentId } = classStudentSchema.parse(request.body);
    return reply.code(201).send({ data: await options.catalog.addStudentToClass((request.params as { id: string }).id, studentId) });
  });
  app.post('/internal/v1/demo/classes/:id/registered-students', { preHandler: internal }, async (request, reply) => {
    const student = registeredStudentMembershipSchema.parse(request.body);
    return reply.code(201).send({
      data: await options.catalog.addRegisteredStudentToClass((request.params as { id: string }).id, student),
    });
  });
  app.delete('/internal/v1/demo/classes/:id/students/:studentId', { preHandler: internal }, async (request, reply) => {
    const { id, studentId } = request.params as { id: string; studentId: string };
    await options.catalog.removeStudentFromClass(id, studentId);
    return reply.code(204).send();
  });
  app.post('/internal/v1/demo/classes/:id/simulate-attendance', { preHandler: internal }, async (request, reply) => {
    const input = simulateAttendanceSchema.parse(request.body);
    const data = await options.catalog.simulateAttendance((request.params as { id: string }).id, input);
    return reply.code(201).send({ data });
  });
  app.put('/internal/v1/demo/settings', { preHandler: internal }, async (request) => ({
    data: await options.catalog.updateSettings(updateDemoSettingsSchema.parse(request.body)),
  }));
  app.delete('/internal/v1/demo/data', { preHandler: internal }, async () => ({
    data: { deleted: await options.catalog.reset() },
  }));

  app.get('/', async (_request, reply) => {
    if (!options.env.PRESENCIA_DEBUG_MODE) return disabled(reply);
    reply.header('set-cookie', 'ASP.NET_SessionId=presencia-demo-student; Path=/; HttpOnly; SameSite=Lax');
    return reply.type('text/html').send('<input name="__RequestVerificationToken" value="presencia-demo-csrf">');
  });
  app.get('/Login', async (_request, reply) => {
    if (!options.env.PRESENCIA_DEBUG_MODE) return disabled(reply);
    reply.header('set-cookie', 'ASP.NET_SessionId=presencia-demo-teacher; Path=/; HttpOnly; SameSite=Lax');
    return reply.type('text/html').send('<html><body>Portal UAT Demo</body></html>');
  });
  app.post('/Login/Accesar_Dominio', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    if (!options.env.PRESENCIA_DEBUG_MODE) return disabled(reply);
    const form = formBody(request.body);
    const studentLogin = form.has('__RequestVerificationToken');
    const username = form.get('txtUsuario') ?? '';
    const password = form.get('txtContrasenia') ?? '';
    if (studentLogin && form.get('__RequestVerificationToken') !== 'presencia-demo-csrf') return invalidLogin(reply);
    if (studentLogin) {
      const student = await options.catalog.authenticateStudent(username, password);
      if (!student) return invalidLogin(reply);
      reply.header('set-cookie', `.ASPXAUTH=${sessionToken('student', student.id, options.env.DEMO_SESSION_SECRET)}; Path=/; HttpOnly; SameSite=Lax`);
      return { exito: true, mensaje: 'Acceso demo correcto', parametros: { Txt_Nombre_Alumno: student.name } };
    }
    const teacher = await options.catalog.authenticateTeacher(username, password);
    if (!teacher) return invalidLogin(reply);
    reply.header('set-cookie', `.ASPXAUTH=${sessionToken('teacher', teacher.id, options.env.DEMO_SESSION_SECRET)}; Path=/; HttpOnly; SameSite=Lax`);
    return {
      exito: true, mensaje: 'Acceso demo correcto',
      parametros: { Id_Plantilla_AdmonUAT: teacher.externalId, Cve_Usuario_AdmonUAT: teacher.email.split('@')[0], Txt_Usuario_AdmonUAT: teacher.name },
    };
  });
  app.get('/Login/Validar', async (request, reply) => {
    const session = portalSession(request, options.env.DEMO_SESSION_SECRET);
    return session ? reply.type('text/html').send('<html><body>Sesión demo válida</body></html>') : reply.code(401).type('text/html').send('<html><body>Login</body></html>');
  });

  app.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/internal/') || request.url.startsWith('/health') || request.url === '/' || request.url.startsWith('/Login')) return;
    if (!options.env.PRESENCIA_DEBUG_MODE) return disabled(reply);
    if (!portalSession(request, options.env.DEMO_SESSION_SECRET) || request.headers['x-requested-with'] !== 'XMLHttpRequest') {
      return reply.code(401).send({ exito: false, mensaje: 'Sesión demo requerida.' });
    }
  });

  app.post('/Genericos/BuscarNivelEducativo', async () => ({ data: [{ Id_Nivel_Educativo: 1, Txt_Nivel_Educativo: 'Licenciatura' }] }));
  app.post('/Genericos/BuscarCampus', async () => ({ data: [{ Id_CU: 1, Txt_CU: 'Campus Demo' }] }));
  app.post('/Genericos/BuscarDES', async () => ({ data: [{
    Id_DES: options.env.PRESENCIA_DEMO_COORDINATION_ID,
    Txt_DES: options.env.PRESENCIA_DEMO_COORDINATION_NAME,
    Txt_Nombre_Corto: 'DEMO',
  }] }));
  app.post('/Genericos/BuscarCicloEscolar', async () => ({ data: [{
    Id_Ciclo_Escolar: options.env.PRESENCIA_DEMO_CYCLE_ID,
    Ciclo: options.env.PRESENCIA_DEMO_CYCLE_NAME,
    Sn_Activo: true,
  }] }));
  app.get('/Profesor/Consultas/BuscaHorarios', async (request, reply) => {
    const teacher = await authenticatedTeacher(request, options);
    return teacher ? { data: (await options.catalog.classesForTeacher(teacher.id)).map(toTeacherSchedule) } : unauthorized(reply);
  });
  app.get('/Profesor/Consultas/BuscaExamenes', async () => ({ data: [] }));
  app.get('/Profesor/ControlAsistencia/BuscaGruposProfesor', async (request, reply) => {
    const teacher = await authenticatedTeacher(request, options);
    return teacher ? { data: (await options.catalog.classesForTeacher(teacher.id)).map((item) => toTeacherGroup(item, options.env)) } : unauthorized(reply);
  });
  app.get('/Profesor/ControlAsistencia/BuscaSemanas', async (request, reply) => {
    const groupId = Number((request.query as Record<string, unknown>).Id_Grupo ?? (request.query as Record<string, unknown>).id_grupo);
    const item = await options.catalog.classByGroupId(groupId);
    if (!item) return reply.code(404).send({ exito: false, mensaje: 'Materia demo no encontrada.' });
    const { start, end } = currentWeek();
    return { data: [{ Id_Grupo: item.groupId, Fec_Ini: start, Fec_Fin: end, Semana: 1 }] };
  });
  app.get('/Profesor/ControlAsistencia/BuscaAsistenciaGrupo', async (request, reply) => {
    const groupId = Number((request.query as Record<string, unknown>).Id_Grupo ?? (request.query as Record<string, unknown>).id_grupo);
    const item = await options.catalog.classByGroupId(groupId);
    if (!item) return reply.code(404).send({ exito: false, mensaje: 'Materia demo no encontrada.' });
    return { data: item.students.map((student, index) => ({
      Id_Alumno: student.uatStudentId, Num_Lista: index + 1, Num_Matricula: student.matricula, Txt_Alumno: student.name,
    })) };
  });
  app.post('/Profesor/ControlAsistencia/GuardaAsistencias', async (request, reply) => {
    const form = formBody(request.body);
    const groupId = Number(form.get('Id_Grupo'));
    const weekStart = form.get('Fec_Ini') ?? '';
    let attendances: Array<{ id_alumno: number; num_dia: number; sn_asistencia: boolean }>;
    try { attendances = JSON.parse(form.get('Asistencia') ?? '[]') as typeof attendances; } catch { return reply.code(400).send({ exito: false, mensaje: 'Asistencia demo inválida.' }); }
    await options.catalog.recordAttendance({ groupId, weekStart, attendances });
    return { exito: true, mensaje: 'Asistencia guardada en el simulador.' };
  });
  app.get('/Home/CarrerasAlumno', async (request, reply) => {
    const student = await authenticatedStudent(request, options);
    return student ? { data: [toStudentCareer(student, options.env)] } : unauthorized(reply);
  });
  app.post('/Home/SeleccionarCarreraAlumno', async (request, reply) => {
    const student = await authenticatedStudent(request, options);
    if (!student) return unauthorized(reply);
    if (Number(formBody(request.body).get('Id_Plan_Estudio')) !== planId(student.matricula)) return reply.code(400).send({ exito: false, mensaje: 'Plan demo inválido.' });
    return { exito: true, parametros: {
      Id_Plan_Estudio_AlumnosUAT: planId(student.matricula), Num_Matricula_AlumnosUAT: student.matricula,
      Id_Ciclo_Escolar_Activo_AlumnosUAT: options.env.PRESENCIA_DEMO_CYCLE_ID,
      Id_DES_AlumnosUAT: options.env.PRESENCIA_DEMO_COORDINATION_ID,
    } };
  });
  app.get('/Alumno/Horario/SpuSelHorarioFichaAlumno', async (request, reply) => {
    const student = await authenticatedStudent(request, options);
    return student ? { data: (await options.catalog.classesForStudent(student.id)).map((item) => toStudentSchedule(item)) } : unauthorized(reply);
  });
  app.get('/Alumno/CalificacionesParciales/SPUSELCalificacionesParciales', async () => ({ exito: false, mensaje: 'Sin calificaciones demo', data: [] }));
  app.get('/Alumno/CalificacionesFinales/ConsultaEvaluaciones', async () => ({ exito: false, mensaje: 'Sin calificaciones demo', data: [] }));

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Demo portal request failed.');
    if (error instanceof DemoCatalogError) {
      const notFound = error.code.endsWith('_NOT_FOUND');
      const conflict = error.code.endsWith('_EXISTS') || error.code.endsWith('_IN_USE') || error.code.endsWith('_CONFLICT');
      return reply.code(notFound ? 404 : conflict ? 409 : 400).send({ error: error.code, message: error.message });
    }
    if (typeof error === 'object' && error !== null && 'issues' in error) return reply.code(400).send({ error: 'VALIDATION_ERROR' });
    return reply.code(500).send({ error: 'INTERNAL_SERVER_ERROR' });
  });
  return app;
}

function disabled(reply: FastifyReply) { return reply.code(404).send({ error: 'DEMO_MODE_DISABLED' }); }
function unauthorized(reply: FastifyReply) { return reply.code(401).send({ exito: false, mensaje: 'Sesión demo inválida.' }); }
function invalidLogin(reply: FastifyReply) { return reply.send({ exito: false, mensaje: 'Credenciales demo inválidas.' }); }
function formBody(value: unknown) { return new URLSearchParams(typeof value === 'string' ? value : ''); }

function sessionToken(kind: 'teacher' | 'student', id: string, secret: string) {
  const value = `${kind}.${id}`;
  return `${value}.${createHmac('sha256', secret).update(value).digest('base64url')}`;
}

function portalSession(request: FastifyRequest, secret: string): { kind: 'teacher' | 'student'; id: string } | null {
  const value = (request.headers.cookie ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith('.ASPXAUTH='))?.slice(10);
  if (!value) return null;
  const [kind, id, signature] = value.split('.');
  if ((kind !== 'teacher' && kind !== 'student') || !id || !signature) return null;
  const expected = createHmac('sha256', secret).update(`${kind}.${id}`).digest();
  const actual = Buffer.from(signature, 'base64url');
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? { kind, id } : null;
}

async function authenticatedTeacher(request: FastifyRequest, options: { env: DemoPortalEnv; catalog: DemoCatalogService }) {
  const session = portalSession(request, options.env.DEMO_SESSION_SECRET);
  return session?.kind === 'teacher' ? options.catalog.teacherById(session.id) : null;
}
async function authenticatedStudent(request: FastifyRequest, options: { env: DemoPortalEnv; catalog: DemoCatalogService }) {
  const session = portalSession(request, options.env.DEMO_SESSION_SECRET);
  return session?.kind === 'student' ? options.catalog.studentById(session.id) : null;
}

function toTeacherGroup(item: Awaited<ReturnType<DemoCatalogService['classesForTeacher']>>[number], env: DemoPortalEnv) {
  return {
    Id_Grupo: item.groupId, Id_Materia: item.code, Txt_Materia: item.name, Txt_Letra: item.groupLetter,
    Id_DES: env.PRESENCIA_DEMO_COORDINATION_ID, Id_Ciclo_Escolar: env.PRESENCIA_DEMO_CYCLE_ID, Ciclo: env.PRESENCIA_DEMO_CYCLE_NAME,
  };
}

function toTeacherSchedule(item: Awaited<ReturnType<DemoCatalogService['classesForTeacher']>>[number]) {
  return {
    Id_Grupo: item.groupId, Id_Materia: item.code, Txt_Materia: item.name, Txt_Espacio_Fisico: item.classroom,
    Num_Periodo: item.period, ...scheduleFields(item.schedule),
  };
}

function toStudentSchedule(item: Awaited<ReturnType<DemoCatalogService['classesForStudent']>>[number]) {
  return {
    ...toTeacherSchedule(item), Txt_Nombre_Profesor: item.professor?.name ?? 'Profesor Demo',
    Txt_Letra: item.groupLetter, Num_Creditos: 5,
  };
}

function scheduleFields(schedule: Partial<Record<string, Array<{ startTime: string; endTime: string }>>>) {
  const mapping: Record<string, string> = {
    monday: 'Txt_Lunes', tuesday: 'Txt_Martes', wednesday: 'Txt_Miercoles', thursday: 'Txt_Jueves',
    friday: 'Txt_Viernes', saturday: 'Txt_Sabado', sunday: 'Txt_Domingo',
  };
  return Object.fromEntries(Object.entries(mapping).map(([day, field]) => [
    field, (schedule[day] ?? []).map(({ startTime, endTime }) => `${startTime} - ${endTime}`).join('; '),
  ]));
}

function toStudentCareer(student: { matricula: string; careerName: string }, env: DemoPortalEnv) {
  return {
    Id_Plan_Estudio: planId(student.matricula), Num_Matricula: student.matricula,
    Txt_Programa_Academico: student.careerName, Id_Ciclo_Escolar: env.PRESENCIA_DEMO_CYCLE_ID,
    CicloActivo: env.PRESENCIA_DEMO_CYCLE_NAME, Id_DES: env.PRESENCIA_DEMO_COORDINATION_ID,
  };
}

function planId(matricula: string) {
  let value = 0;
  for (const character of matricula) value = (value * 31 + character.charCodeAt(0)) % 800_000;
  return 100_000 + value;
}

function currentWeek() {
  const today = new Date();
  const monday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() || 7) - 1));
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  return { start: latinDate(monday), end: latinDate(sunday) };
}
function latinDate(value: Date) { return `${String(value.getUTCDate()).padStart(2, '0')}/${String(value.getUTCMonth() + 1).padStart(2, '0')}/${value.getUTCFullYear()}`; }
