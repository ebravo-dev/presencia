import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import { createUatPortalMockServer, MOCK_UAT } from './uat-portal-mock.mjs';

let server;
let baseUrl;

before(async () => {
  ({ server } = createUatPortalMockServer());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Mock UAT did not expose a TCP address.');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  server.close();
  await once(server, 'close');
});

test('teacher ASP.NET login and attendance write retain their session', async () => {
  const loginPage = await fetch(`${baseUrl}/Login`);
  const sessionCookie = cookiePair(loginPage.headers.get('set-cookie'));
  const login = await fetch(`${baseUrl}/Login/Accesar_Dominio`, {
    method: 'POST',
    headers: { cookie: sessionCookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ txtUsuario: MOCK_UAT.teacherUsername, txtContrasenia: MOCK_UAT.teacherPassword }),
  });
  const authCookie = cookiePair(login.headers.get('set-cookie'));
  assert.equal(login.status, 200);
  assert.equal((await login.json()).parametros.Id_Plantilla_AdmonUAT, MOCK_UAT.professorExternalId);

  const save = await fetch(`${baseUrl}/Profesor/ControlAsistencia/GuardaAsistencias`, {
    method: 'POST',
    headers: {
      cookie: `${sessionCookie}; ${authCookie}`,
      'content-type': 'application/x-www-form-urlencoded',
      'x-requested-with': 'XMLHttpRequest',
    },
    body: new URLSearchParams({
      Id_Grupo: String(MOCK_UAT.groupId),
      Fec_Ini: '03/08/2026',
      Asistencia: JSON.stringify([{ id_alumno: 515722, num_pase_lista: 1, num_dia: 1, sn_asistencia: true }]),
    }),
  });
  assert.deepEqual(await save.json(), { exito: true, mensaje: 'Guardado' });
  const state = await (await fetch(`${baseUrl}/__mock/state`)).json();
  assert.equal(state.teacherLogins, 1);
  assert.equal(state.attendanceWrites.length, 1);
});

test('attendance writes can fail deterministically and recover without recording a false success', async () => {
  const initialState = await (await fetch(`${baseUrl}/__mock/state`)).json();
  const configured = await fetch(`${baseUrl}/__mock/faults/attendance`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ failures: 1 }),
  });
  assert.deepEqual(await configured.json(), { attendanceFaultsRemaining: 1 });

  const { sessionCookie, authCookie } = await teacherSession();
  const first = await saveAttendance(sessionCookie, authCookie);
  assert.equal(first.status, 503);
  assert.equal((await first.json()).exito, false);
  const recovered = await saveAttendance(sessionCookie, authCookie);
  assert.deepEqual(await recovered.json(), { exito: true, mensaje: 'Guardado' });

  const state = await (await fetch(`${baseUrl}/__mock/state`)).json();
  assert.equal(state.attendanceWriteAttempts, initialState.attendanceWriteAttempts + 2);
  assert.equal(state.attendanceFailures, initialState.attendanceFailures + 1);
  assert.equal(state.attendanceWrites.length, initialState.attendanceWrites.length + 1);
  assert.equal(state.attendanceFaultsRemaining, 0);
});

test('student ASP.NET login exposes career and schedule data', async () => {
  const loginPage = await fetch(baseUrl);
  const csrf = (await loginPage.text()).match(/value="([^"]+)"/)?.[1];
  const sessionCookie = cookiePair(loginPage.headers.get('set-cookie'));
  const login = await fetch(`${baseUrl}/Login/Accesar_Dominio`, {
    method: 'POST',
    headers: { cookie: sessionCookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      __RequestVerificationToken: csrf ?? '',
      txtUsuario: MOCK_UAT.studentUsername,
      txtContrasenia: MOCK_UAT.studentPassword,
    }),
  });
  const authCookie = cookiePair(login.headers.get('set-cookie'));
  assert.equal((await login.json()).exito, true);

  const careers = await fetch(`${baseUrl}/Home/CarrerasAlumno`, {
    headers: { cookie: `${sessionCookie}; ${authCookie}`, 'x-requested-with': 'XMLHttpRequest' },
  });
  const payload = await careers.json();
  assert.equal(payload.data[0].Num_Matricula, MOCK_UAT.matricula);
});

function cookiePair(value) {
  assert.ok(value, 'Expected Set-Cookie response header.');
  return value.split(';', 1)[0];
}

async function teacherSession() {
  const loginPage = await fetch(`${baseUrl}/Login`);
  const sessionCookie = cookiePair(loginPage.headers.get('set-cookie'));
  const login = await fetch(`${baseUrl}/Login/Accesar_Dominio`, {
    method: 'POST',
    headers: { cookie: sessionCookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ txtUsuario: MOCK_UAT.teacherUsername, txtContrasenia: MOCK_UAT.teacherPassword }),
  });
  return { sessionCookie, authCookie: cookiePair(login.headers.get('set-cookie')) };
}

function saveAttendance(sessionCookie, authCookie) {
  return fetch(`${baseUrl}/Profesor/ControlAsistencia/GuardaAsistencias`, {
    method: 'POST',
    headers: {
      cookie: `${sessionCookie}; ${authCookie}`,
      'content-type': 'application/x-www-form-urlencoded',
      'x-requested-with': 'XMLHttpRequest',
    },
    body: new URLSearchParams({
      Id_Grupo: String(MOCK_UAT.groupId),
      Fec_Ini: '03/08/2026',
      Asistencia: JSON.stringify([{ id_alumno: 515722, num_pase_lista: 1, num_dia: 1, sn_asistencia: true }]),
    }),
  });
}
