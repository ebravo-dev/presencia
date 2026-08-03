import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

export const MOCK_UAT = Object.freeze({
  teacherUsername: 'teacher-ci@uat.edu.mx',
  teacherPassword: 'teacher-ci-password',
  studentUsername: 'student-ci@alumnos.uat.edu.mx',
  studentPassword: 'student-ci-password',
  professorExternalId: '42',
  matricula: '9900000001',
  groupId: 947699,
});

export function createUatPortalMockServer() {
  const state = {
    teacherLogins: 0,
    studentLogins: 0,
    attendanceWriteAttempts: 0,
    attendanceFailures: 0,
    attendanceFaultsRemaining: 0,
    attendanceWrites: [],
  };
  const server = createServer((request, response) => {
    void handleRequest(request, response, state);
  });
  return { server, state };
}

async function handleRequest(request, response, state) {
  try {
    const url = new URL(request.url ?? '/', 'http://uat-portal-mock');
    if (request.method === 'GET' && url.pathname === '/health') {
      return json(response, 200, { status: 'ok', service: 'uat-portal-mock' });
    }
    if (request.method === 'GET' && url.pathname === '/__mock/state') {
      return json(response, 200, state);
    }
    if (request.method === 'POST' && url.pathname === '/__mock/faults/attendance') {
      return configureAttendanceFaults(response, await readBody(request), state);
    }
    if (request.method === 'GET' && url.pathname === '/') {
      response.setHeader('set-cookie', 'ASP.NET_SessionId=student-ci-session; Path=/; HttpOnly; SameSite=Lax');
      return html(response, 200, '<input name="__RequestVerificationToken" value="student-ci-csrf">');
    }
    if (request.method === 'GET' && url.pathname === '/Login') {
      response.setHeader('set-cookie', 'ASP.NET_SessionId=teacher-ci-session; Path=/; HttpOnly; SameSite=Lax');
      return html(response, 200, '<html><body>Login UAT CI</body></html>');
    }

    const body = await readBody(request);
    if (request.method === 'POST' && url.pathname === '/Login/Accesar_Dominio') {
      return login(response, new URLSearchParams(body), state);
    }
    if (request.method === 'GET' && url.pathname === '/Login/Validar') {
      return hasAuthCookie(request)
        ? html(response, 200, '<html><body>Sesion valida</body></html>')
        : html(response, 401, '<html><body>Login</body></html>');
    }
    if (!hasAuthCookie(request) || request.headers['x-requested-with'] !== 'XMLHttpRequest') {
      return json(response, 401, { exito: false, mensaje: 'Sesion UAT CI requerida.' });
    }

    const route = `${request.method} ${url.pathname}`;
    switch (route) {
      case 'POST /Genericos/BuscarNivelEducativo':
        return json(response, 200, { data: [{ Id_Nivel_Educativo: 1, Txt_Nivel_Educativo: 'Licenciatura' }] });
      case 'POST /Genericos/BuscarCampus':
        return json(response, 200, { data: [{ Id_CU: 1, Txt_CU: 'Campus CI' }] });
      case 'POST /Genericos/BuscarDES':
        return json(response, 200, { data: [{ Id_DES: 12, Txt_DES: 'Coordinacion CI', Txt_Nombre_Corto: 'CI' }] });
      case 'POST /Genericos/BuscarCicloEscolar':
        return json(response, 200, { data: [{ Id_Ciclo_Escolar: 150, Ciclo: currentAcademicCycle() }] });
      case 'GET /Profesor/Consultas/BuscaHorarios':
        return json(response, 200, { data: [teacherSchedule()] });
      case 'GET /Profesor/Consultas/BuscaExamenes':
        return json(response, 200, { data: [] });
      case 'GET /Profesor/ControlAsistencia/BuscaGruposProfesor':
        return json(response, 200, { data: [teacherGroup()] });
      case 'GET /Profesor/ControlAsistencia/BuscaSemanas':
        return json(response, 200, { data: [{ Id_Grupo: MOCK_UAT.groupId, Fec_Ini: '03/08/2026', Fec_Fin: '09/08/2026', Semana: 1 }] });
      case 'GET /Profesor/ControlAsistencia/BuscaAsistenciaGrupo':
        return json(response, 200, { data: [studentRosterEntry()] });
      case 'POST /Profesor/ControlAsistencia/GuardaAsistencias':
        return saveAttendance(response, body, state);
      case 'GET /Home/CarrerasAlumno':
        return json(response, 200, { data: [studentCareer()] });
      case 'POST /Home/SeleccionarCarreraAlumno':
        return selectStudentCareer(response, body);
      case 'GET /Alumno/Horario/SpuSelHorarioFichaAlumno':
        return json(response, 200, { data: [studentSchedule()] });
      case 'GET /Alumno/CalificacionesParciales/SPUSELCalificacionesParciales':
        return json(response, 200, { data: [{ Txt_Materia: 'Arquitectura de Software', Calificacion: 95 }] });
      case 'GET /Alumno/CalificacionesFinales/ConsultaEvaluaciones':
        return json(response, 200, { exito: false, mensaje: 'Sin calificaciones', data: [] });
      default:
        return json(response, 404, { error: 'MOCK_ROUTE_NOT_FOUND', route });
    }
  } catch (error) {
    return json(response, 500, {
      error: 'MOCK_UAT_FAILURE',
      message: error instanceof Error ? error.message : 'Unknown mock failure',
    });
  }
}

function login(response, form, state) {
  const student = form.has('__RequestVerificationToken');
  const expectedUsername = student ? MOCK_UAT.studentUsername : MOCK_UAT.teacherUsername;
  const expectedPassword = student ? MOCK_UAT.studentPassword : MOCK_UAT.teacherPassword;
  const validToken = !student || form.get('__RequestVerificationToken') === 'student-ci-csrf';
  if (!validToken || form.get('txtUsuario') !== expectedUsername || form.get('txtContrasenia') !== expectedPassword) {
    return json(response, 200, { exito: false, mensaje: 'Credenciales UAT CI invalidas.' });
  }

  if (student) state.studentLogins += 1;
  else state.teacherLogins += 1;
  response.setHeader('set-cookie', `.ASPXAUTH=${student ? 'student' : 'teacher'}-ci-auth; Path=/; HttpOnly; SameSite=Lax`);
  return json(response, 200, {
    exito: true,
    mensaje: 'Acceso correcto',
    parametros: student
      ? { Txt_Nombre_Alumno: 'Ana Alumna' }
      : {
          Id_Plantilla_AdmonUAT: MOCK_UAT.professorExternalId,
          Cve_Usuario_AdmonUAT: 'teacher-ci',
          Txt_Usuario_AdmonUAT: 'Profesor CI',
        },
  });
}

function selectStudentCareer(response, body) {
  const form = new URLSearchParams(body);
  if (form.get('Id_Plan_Estudio') !== '3314') {
    return json(response, 400, { exito: false, mensaje: 'Plan de estudios CI invalido.' });
  }
  return json(response, 200, {
    exito: true,
    parametros: {
      Id_Plan_Estudio_AlumnosUAT: 3314,
      Num_Matricula_AlumnosUAT: MOCK_UAT.matricula,
      Id_Ciclo_Escolar_Activo_AlumnosUAT: 150,
      Id_DES_AlumnosUAT: 12,
    },
  });
}

function saveAttendance(response, body, state) {
  const form = new URLSearchParams(body);
  const attendances = JSON.parse(form.get('Asistencia') ?? '[]');
  if (form.get('Id_Grupo') !== String(MOCK_UAT.groupId) || !Array.isArray(attendances) || attendances.length !== 1) {
    return json(response, 400, { exito: false, mensaje: 'Lista de asistencia CI invalida.' });
  }
  state.attendanceWriteAttempts += 1;
  if (state.attendanceFaultsRemaining > 0) {
    state.attendanceFaultsRemaining -= 1;
    state.attendanceFailures += 1;
    return json(response, 503, { exito: false, mensaje: 'Falla UAT transitoria simulada.' });
  }
  state.attendanceWrites.push({
    idGrupo: Number(form.get('Id_Grupo')),
    fechaInicio: form.get('Fec_Ini'),
    attendances,
  });
  return json(response, 200, { exito: true, mensaje: 'Guardado' });
}

function configureAttendanceFaults(response, body, state) {
  let input;
  try {
    input = JSON.parse(body);
  } catch {
    return json(response, 400, { error: 'INVALID_FAULT_CONFIGURATION' });
  }
  const failures = input?.failures;
  if (!Number.isInteger(failures) || failures < 0 || failures > 20) {
    return json(response, 400, { error: 'INVALID_FAULT_CONFIGURATION' });
  }
  state.attendanceFaultsRemaining = failures;
  return json(response, 200, { attendanceFaultsRemaining: failures });
}

function teacherGroup() {
  return {
    Id_Grupo: MOCK_UAT.groupId,
    Id_Materia: 'SW-101',
    Txt_Materia: 'Arquitectura de Software',
    Txt_Letra: 'A',
    Id_DES: 12,
    Id_Ciclo_Escolar: 150,
    Ciclo: currentAcademicCycle(),
  };
}

function teacherSchedule() {
  return {
    Id_Grupo: MOCK_UAT.groupId,
    Txt_Materia: 'Arquitectura de Software',
    Txt_Espacio_Fisico: 'AULA CI 101',
    Num_Periodo: 1,
    Txt_Lunes: '07:00 - 09:00',
  };
}

function studentCareer() {
  return {
    Id_Plan_Estudio: 3314,
    Num_Matricula: MOCK_UAT.matricula,
    Txt_Programa_Academico: 'Ingenieria de Software',
    Id_Ciclo_Escolar: 150,
    CicloActivo: currentAcademicCycle(),
    Id_DES: 12,
  };
}

function studentSchedule() {
  return {
    ...teacherSchedule(),
    Txt_Nombre_Profesor: 'Profesor CI',
    Txt_Letra: 'A',
    Num_Creditos: 5,
  };
}

function studentRosterEntry() {
  return {
    Id_Alumno: 515722,
    Num_Lista: 1,
    Num_Matricula: MOCK_UAT.matricula,
    Txt_Alumno: 'Ana Alumna',
  };
}

function currentAcademicCycle() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Monterrey', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localDate = `${values.year}-${values.month}-${values.day}`;
  const monday = new Date(`${localDate}T12:00:00.000Z`);
  const day = monday.getUTCDay() || 7;
  monday.setUTCDate(monday.getUTCDate() - day + 1);
  const month = monday.getUTCMonth() + 1;
  const term = month <= 5 ? 1 : month <= 7 || (month === 8 && monday.getUTCDate() <= 7) ? 2 : 3;
  return `${monday.getUTCFullYear()}-${term}`;
}

function hasAuthCookie(request) {
  return (request.headers.cookie ?? '').includes('.ASPXAUTH=');
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function json(response, status, payload) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

function html(response, status, payload) {
  response.statusCode = status;
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end(payload);
}

async function main() {
  const port = Number(process.env.MOCK_UAT_PORT ?? 3900);
  const { server } = createUatPortalMockServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', resolve);
  });
  process.stdout.write(`UAT portal mock listening on ${port}.\n`);
  const shutdown = () => server.close(() => process.exit(0));
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
