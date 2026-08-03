import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CookieJar } from 'tough-cookie';
import { UatPortalClient } from './uat-client.js';
import { UatStudentPortalClient } from './uat-student-client.js';

describe('UAT ASP.NET portal clients', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    server = createServer(portalHandler);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it('preserves the teacher ASP.NET session across reads and attendance writes', async () => {
    const client = new UatPortalClient({ baseUrl, timeoutMs: 2_000, jar: new CookieJar() });
    const login = await client.authenticate({ username: 'teacher@uat.edu.mx', password: 'teacher-secret' });
    expect(login).toMatchObject({ exito: true, parametros: { Id_Plantilla_AdmonUAT: '42' } });
    expect(client.getCookieDiagnostics()).toMatchObject({ hasSessionCookie: true, hasAuthCookie: true });

    await expect(client.getHorarios({ Id_Ciclo_Escolar: 150, Id_DES: 12 })).resolves.toEqual([
      { Id_Grupo: 947699, Txt_Materia: 'Arquitectura' },
    ]);
    await expect(client.getGruposProfesor({ Id_Des: 12, Id_Ciclo: 150, Id_Plantilla: 42 })).resolves.toMatchObject([
      { Id_Grupo: 947699, Txt_Materia: 'Arquitectura', Txt_Letra: 'A' },
    ]);
    await expect(client.getAsistenciaGrupo({ Id_Grupo: 947699, fec_ini: '2026-08-03', fec_fin: '2026-08-08' })).resolves.toMatchObject({
      alumnos: [{ Id_Alumno: 515722, Num_Matricula: '2251330007', Txt_Alumno: 'Ana Alumna' }],
    });
    await expect(client.guardaAsistencias({
      Id_Grupo: 947699,
      Fec_Ini: '2026-08-03',
      Asistencia: JSON.stringify([{ id_alumno: 515722, num_pase_lista: 1, num_dia: 1, sn_asistencia: true }]),
    })).resolves.toMatchObject({ exito: true });
  });

  it('sends the student antiforgery token and keeps the selected career session', async () => {
    const client = new UatStudentPortalClient({ baseUrl, timeoutMs: 2_000, jar: new CookieJar() });
    await expect(client.authenticate({ username: 'student@uat.edu.mx', password: 'student-secret' })).resolves.toMatchObject({ exito: true });
    expect(client.getCookieDiagnostics()).toMatchObject({ hasSessionCookie: true, hasAuthCookie: true });

    await expect(client.getCareers()).resolves.toEqual([{ Id_Plan_Estudio: 3314, Num_Matricula: '2251330007' }]);
    await expect(client.selectCareer(3314)).resolves.toMatchObject({ parametros: { Num_Matricula_AlumnosUAT: '2251330007' } });
    await expect(client.getSchedule()).resolves.toEqual([{ Id_Grupo: 947699, Txt_Materia: 'Arquitectura' }]);
    await expect(client.getPartialGrades()).resolves.toEqual([{ Txt_Materia: 'Arquitectura', Calificacion: 95 }]);
    await expect(client.getFinalGrades()).resolves.toEqual([]);
  });
});

async function portalHandler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const url = new URL(request.url ?? '/', 'http://portal.test');
    const body = await readBody(request);
    const cookies = request.headers.cookie ?? '';

    if (request.method === 'GET' && url.pathname === '/') {
      response.setHeader('set-cookie', 'ASP.NET_SessionId=student-session; Path=/; HttpOnly');
      return html(response, '<input name="__RequestVerificationToken" value="student-csrf-token">');
    }
    if (request.method === 'GET' && url.pathname === '/Login') {
      response.setHeader('set-cookie', 'ASP.NET_SessionId=teacher-session; Path=/; HttpOnly');
      return html(response, '<html><body>Login UAT</body></html>');
    }
    if (request.method === 'POST' && url.pathname === '/Login/Accesar_Dominio') {
      const form = new URLSearchParams(body);
      const student = form.has('__RequestVerificationToken');
      if (student) {
        expect(form.get('__RequestVerificationToken')).toBe('student-csrf-token');
        expect(form.get('txtUsuario')).toBe('student@uat.edu.mx');
        expect(cookies).toContain('ASP.NET_SessionId=student-session');
      } else {
        expect(form.get('txtUsuario')).toBe('teacher@uat.edu.mx');
        expect(cookies).toContain('ASP.NET_SessionId=teacher-session');
      }
      response.setHeader('set-cookie', `.ASPXAUTH=${student ? 'student' : 'teacher'}-auth; Path=/; HttpOnly`);
      return json(response, {
        exito: true,
        mensaje: 'Acceso correcto',
        parametros: student ? {} : { Id_Plantilla_AdmonUAT: '42', Txt_Usuario_AdmonUAT: 'Profesor UAT' },
      });
    }
    if (request.method === 'GET' && url.pathname === '/Login/Validar') {
      expect(cookies).toContain('.ASPXAUTH=');
      return html(response, '<html><body>Validado</body></html>');
    }

    expect(cookies).toContain('.ASPXAUTH=');
    expect(request.headers['x-requested-with']).toBe('XMLHttpRequest');
    if (request.method === 'GET' && url.pathname === '/Profesor/Consultas/BuscaHorarios') {
      expect(url.searchParams.get('Id_Ciclo_Escolar')).toBe('150');
      return json(response, { data: [{ Id_Grupo: 947699, Txt_Materia: 'Arquitectura' }] });
    }
    if (request.method === 'GET' && url.pathname === '/Profesor/ControlAsistencia/BuscaGruposProfesor') {
      return json(response, { data: [{ id_grupo: 947699, txt_materia: 'Arquitectura', txt_letra: 'A' }] });
    }
    if (request.method === 'GET' && url.pathname === '/Profesor/ControlAsistencia/BuscaAsistenciaGrupo') {
      return json(response, { data: [{ id_alumno: 515722, num_lista: 1, num_matricula: '2251330007', txt_alumno: 'Ana Alumna' }] });
    }
    if (request.method === 'POST' && url.pathname === '/Profesor/ControlAsistencia/GuardaAsistencias') {
      const form = new URLSearchParams(body);
      expect(form.get('Id_Grupo')).toBe('947699');
      expect(JSON.parse(form.get('Asistencia') ?? '[]')).toHaveLength(1);
      return json(response, { exito: true, mensaje: 'Guardado' });
    }
    if (request.method === 'GET' && url.pathname === '/Home/CarrerasAlumno') {
      return json(response, { data: [{ Id_Plan_Estudio: 3314, Num_Matricula: '2251330007' }] });
    }
    if (request.method === 'POST' && url.pathname === '/Home/SeleccionarCarreraAlumno') {
      expect(new URLSearchParams(body).get('Id_Plan_Estudio')).toBe('3314');
      return json(response, { parametros: { Num_Matricula_AlumnosUAT: '2251330007' } });
    }
    if (request.method === 'GET' && url.pathname === '/Alumno/Horario/SpuSelHorarioFichaAlumno') {
      return json(response, { data: [{ Id_Grupo: 947699, Txt_Materia: 'Arquitectura' }] });
    }
    if (request.method === 'GET' && url.pathname === '/Alumno/CalificacionesParciales/SPUSELCalificacionesParciales') {
      return json(response, { data: [{ Txt_Materia: 'Arquitectura', Calificacion: 95 }] });
    }
    if (request.method === 'GET' && url.pathname === '/Alumno/CalificacionesFinales/ConsultaEvaluaciones') {
      return json(response, { exito: false, mensaje: 'Sin calificaciones' });
    }
    response.statusCode = 404;
    response.end('Not found');
  } catch (error) {
    response.statusCode = 500;
    response.end(error instanceof Error ? error.message : 'Mock portal failure');
  }
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function json(response: ServerResponse, payload: unknown): void {
  response.statusCode = 200;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

function html(response: ServerResponse, payload: string): void {
  response.statusCode = 200;
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end(payload);
}
