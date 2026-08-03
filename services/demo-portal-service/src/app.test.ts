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
});
