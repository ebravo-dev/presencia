import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildDemoPortalApp } from './app.js';
import { DemoCatalogService } from './catalog.service.js';
import { demoPortalEnvSchema } from './config.js';
import { MemoryDemoPortalRepository } from './repository.js';

const env = demoPortalEnvSchema.parse({
  NODE_ENV: 'test', PRESENCIA_DEBUG_MODE: true, PRESENCIA_DEMO_SEED: true,
  INTERNAL_API_TOKEN: 'i'.repeat(32), DEMO_SESSION_SECRET: 's'.repeat(32),
  PRESENCIA_DEMO_DEFAULT_PASSWORD: 'demo-password',
});
let app: FastifyInstance | undefined;
afterEach(async () => { await app?.close(); app = undefined; });

describe('demo portal HTTP compatibility', () => {
  it('authenticates seeded teacher and student accounts and returns their configured class', async () => {
    const catalog = new DemoCatalogService(new MemoryDemoPortalRepository(), env);
    await catalog.initialize();
    app = await buildDemoPortalApp({ env, catalog, ready: async () => true });

    const teacherLogin = await app.inject({
      method: 'POST', url: '/Login/Accesar_Dominio', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ txtUsuario: 'profesor.demo@uat.edu.mx', txtContrasenia: 'demo-password' }).toString(),
    });
    expect(teacherLogin.json()).toMatchObject({ exito: true });
    const teacherCookie = teacherLogin.headers['set-cookie'];
    const groups = await app.inject({ method: 'GET', url: '/Profesor/ControlAsistencia/BuscaGruposProfesor', headers: { cookie: teacherCookie!, 'x-requested-with': 'XMLHttpRequest' } });
    expect(groups.json().data).toHaveLength(1);

    const studentLogin = await app.inject({
      method: 'POST', url: '/Login/Accesar_Dominio', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ __RequestVerificationToken: 'presencia-demo-csrf', txtUsuario: 'alumno.demo@alumnos.uat.edu.mx', txtContrasenia: 'demo-password' }).toString(),
    });
    const studentCookie = studentLogin.headers['set-cookie'];
    const schedule = await app.inject({ method: 'GET', url: '/Alumno/Horario/SpuSelHorarioFichaAlumno', headers: { cookie: studentCookie!, 'x-requested-with': 'XMLHttpRequest' } });
    expect(schedule.json().data).toMatchObject([{ Txt_Materia: 'Materia de demostración' }]);
  });

  it('hides the catalog when debug mode is disabled', async () => {
    const disabledEnv = { ...env, PRESENCIA_DEBUG_MODE: false };
    const catalog = new DemoCatalogService(new MemoryDemoPortalRepository(), disabledEnv);
    await catalog.initialize();
    app = await buildDemoPortalApp({ env: disabledEnv, catalog, ready: async () => true });
    expect((await app.inject({ method: 'GET', url: '/internal/v1/demo/catalog', headers: { 'x-internal-service-token': env.INTERNAL_API_TOKEN } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/Login' })).statusCode).toBe(404);
  });

  it('serves isolated App Review accounts without exposing or persisting them in the demo catalog', async () => {
    const reviewEnv = demoPortalEnvSchema.parse({
      ...env,
      PRESENCIA_DEBUG_MODE: false,
      PRESENCIA_DEMO_SEED: false,
      PRESENCIA_APP_REVIEW_ENABLED: true,
      PRESENCIA_APP_REVIEW_TEACHER_PASSWORD: 'teacher-review-password',
      PRESENCIA_APP_REVIEW_STUDENT_PASSWORD: 'student-review-password',
    });
    const catalog = new DemoCatalogService(new MemoryDemoPortalRepository(), reviewEnv);
    await catalog.initialize();
    app = await buildDemoPortalApp({ env: reviewEnv, catalog, ready: async () => true });

    expect((await app.inject({
      method: 'GET',
      url: '/internal/v1/demo/catalog',
      headers: { 'x-internal-service-token': reviewEnv.INTERNAL_API_TOKEN },
    })).statusCode).toBe(404);

    const teacherLogin = await app.inject({
      method: 'POST', url: '/Login/Accesar_Dominio', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        txtUsuario: reviewEnv.PRESENCIA_APP_REVIEW_TEACHER_USERNAME,
        txtContrasenia: reviewEnv.PRESENCIA_APP_REVIEW_TEACHER_PASSWORD,
      }).toString(),
    });
    expect(teacherLogin.json()).toMatchObject({ exito: true });
    const teacherCookie = teacherLogin.headers['set-cookie'];
    const groups = await app.inject({
      method: 'GET', url: '/Profesor/ControlAsistencia/BuscaGruposProfesor',
      headers: { cookie: teacherCookie!, 'x-requested-with': 'XMLHttpRequest' },
    });
    expect(groups.json().data).toMatchObject([{ Id_Grupo: 999901, Txt_Materia: 'Materia de demostración' }]);

    const attendance = await app.inject({
      method: 'POST', url: '/Profesor/ControlAsistencia/GuardaAsistencias',
      headers: {
        cookie: teacherCookie!, 'x-requested-with': 'XMLHttpRequest',
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: new URLSearchParams({
        Id_Grupo: '999901', Fec_Ini: '31/08/2026',
        Asistencia: JSON.stringify([{ id_alumno: 999902, num_dia: 3, sn_asistencia: true }]),
      }).toString(),
    });
    expect(attendance.json()).toMatchObject({ exito: true });
    const unauthorizedGroup = await app.inject({
      method: 'POST', url: '/Profesor/ControlAsistencia/GuardaAsistencias',
      headers: {
        cookie: teacherCookie!, 'x-requested-with': 'XMLHttpRequest',
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: new URLSearchParams({
        Id_Grupo: '123456', Fec_Ini: '31/08/2026', Asistencia: '[]',
      }).toString(),
    });
    expect(unauthorizedGroup.statusCode).toBe(404);
    expect(await catalog.snapshot()).toMatchObject({
      teachers: [], students: [], classes: [], attendanceWrites: [],
    });

    const studentLogin = await app.inject({
      method: 'POST', url: '/Login/Accesar_Dominio', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        __RequestVerificationToken: 'presencia-demo-csrf',
        txtUsuario: reviewEnv.PRESENCIA_APP_REVIEW_STUDENT_USERNAME,
        txtContrasenia: reviewEnv.PRESENCIA_APP_REVIEW_STUDENT_PASSWORD,
      }).toString(),
    });
    expect(studentLogin.json()).toMatchObject({ exito: true });
    const schedule = await app.inject({
      method: 'GET', url: '/Alumno/Horario/SpuSelHorarioFichaAlumno',
      headers: { cookie: studentLogin.headers['set-cookie']!, 'x-requested-with': 'XMLHttpRequest' },
    });
    expect(schedule.json().data).toMatchObject([{ Id_Grupo: 999901, Txt_Materia: 'Materia de demostración' }]);
  });

  it('clears the demo catalog only through the authenticated internal route', async () => {
    const catalog = new DemoCatalogService(new MemoryDemoPortalRepository(), env);
    await catalog.initialize();
    app = await buildDemoPortalApp({ env, catalog, ready: async () => true });

    expect((await app.inject({ method: 'DELETE', url: '/internal/v1/demo/data' })).statusCode).toBe(404);
    const response = await app.inject({
      method: 'DELETE', url: '/internal/v1/demo/data',
      headers: { 'x-internal-service-token': env.INTERNAL_API_TOKEN },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.deleted).toMatchObject({ teachers: 1, students: 1, classes: 1 });
    expect(await catalog.snapshot()).toMatchObject({ teachers: [], students: [], classes: [], attendanceWrites: [] });
  });

  it('adds a registered student to an existing demo class through the private API', async () => {
    const catalog = new DemoCatalogService(new MemoryDemoPortalRepository(), env);
    await catalog.initialize();
    app = await buildDemoPortalApp({ env, catalog, ready: async () => true });
    const item = (await catalog.snapshot()).classes[0]!;

    const response = await app.inject({
      method: 'POST', url: `/internal/v1/demo/classes/${item.id}/registered-students`,
      headers: { 'x-internal-service-token': env.INTERNAL_API_TOKEN },
      payload: { matricula: '2251330008', email: null, name: 'Alumno Registrado' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data.students).toEqual(expect.arrayContaining([
      expect.objectContaining({ matricula: '2251330008', name: 'Alumno Registrado' }),
    ]));
  });
});
