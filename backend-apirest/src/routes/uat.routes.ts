import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../errors/api-error.js';
import { UatPortalClient } from '../uat/uat-client.js';
import { uatSessionStore, type StoredUatSession } from '../uat/uat-session-store.js';
import type { UatLoginResponse, UatProfesorConsultaParams } from '../uat/uat.types.js';

const credentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const consultaQuerySchema = z.object({
  Id_Ciclo_Escolar: z.coerce.number().int().positive(),
  Id_DES: z.coerce.number().int().positive(),
});

const snapshotSchema = credentialsSchema.extend({
  Id_Ciclo_Escolar: z.coerce.number().int().positive(),
  Id_DES: z.coerce.number().int().positive(),
  includeExamenes: z.boolean().optional().default(true),
});

const campusQuerySchema = z.object({
  id_nivel_educativo: z.coerce.number().int().positive(),
});

const desQuerySchema = campusQuerySchema.extend({
  id_cu: z.coerce.number().int().positive(),
});

export async function uatRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/uat/sessions', async (request, reply) => {
    const credentials = parseBody(credentialsSchema, request.body);
    const session = await uatSessionStore.create(credentials);

    return reply.code(201).send(toSessionResponse(session));
  });

  fastify.delete('/api/uat/sessions/:sessionId', async (request, reply) => {
    const { sessionId } = parseParams(z.object({ sessionId: z.string().uuid() }), request.params);
    const deleted = uatSessionStore.delete(sessionId);

    return reply.send({
      deleted,
      sessionId,
    });
  });

  fastify.get('/api/uat/profesor/consultas/horarios', async (request) => {
    const query = parseQuery(consultaQuerySchema, request.query);
    const session = getSessionFromHeader(request);
    const data = await session.client.getHorarios(query);

    return toUatDataResponse('BuscaHorarios', query, data);
  });

  fastify.get('/api/uat/profesor/consultas/examenes', async (request) => {
    const query = parseQuery(consultaQuerySchema, request.query);
    const session = getSessionFromHeader(request);
    const data = await session.client.getExamenes(query);

    return toUatDataResponse('BuscaExamenes', query, data);
  });

  fastify.post('/api/uat/profesor/consultas/snapshot', async (request) => {
    const body = parseBody(snapshotSchema, request.body);
    const query: UatProfesorConsultaParams = {
      Id_Ciclo_Escolar: body.Id_Ciclo_Escolar,
      Id_DES: body.Id_DES,
    };
    const client = new UatPortalClient();
    const login = await client.authenticate({
      username: body.username,
      password: body.password,
    });
    const horarios = await client.getHorarios(query);
    const examenes = body.includeExamenes ? await client.getExamenes(query) : undefined;

    return {
      source: 'UAT',
      authenticated: true,
      login: toSafeLogin(login),
      query,
      horarios,
      ...(body.includeExamenes ? { examenes } : {}),
      fetchedAt: new Date().toISOString(),
    };
  });

  fastify.get('/api/uat/catalogos/niveles-educativos', async (request) => {
    const session = getSessionFromHeader(request);
    const data = await session.client.getNivelesEducativos();

    return toUatDataResponse('BuscarNivelEducativo', {}, data);
  });

  fastify.get('/api/uat/catalogos/campus', async (request) => {
    const query = parseQuery(campusQuerySchema, request.query);
    const session = getSessionFromHeader(request);
    const data = await session.client.getCampus(query.id_nivel_educativo);

    return toUatDataResponse('BuscarCampus', query, data);
  });

  fastify.get('/api/uat/catalogos/des', async (request) => {
    const query = parseQuery(desQuerySchema, request.query);
    const session = getSessionFromHeader(request);
    const data = await session.client.getDes(query.id_nivel_educativo, query.id_cu);

    return toUatDataResponse('BuscarDES', query, data);
  });

  fastify.get('/api/uat/catalogos/ciclos-escolares', async (request) => {
    const session = getSessionFromHeader(request);
    const data = await session.client.getCiclosEscolares();

    return toUatDataResponse('BuscarCicloEscolar', {}, data);
  });
}

function getSessionFromHeader(request: FastifyRequest): StoredUatSession {
  const rawHeader = request.headers['x-uat-session-id'];
  const sessionId = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

  if (!sessionId) {
    throw new ApiError(401, 'UAT_SESSION_REQUIRED', 'Envia el header X-UAT-Session-Id.');
  }

  return uatSessionStore.get(sessionId);
}

function parseBody<T>(schema: z.ZodType<T>, value: unknown): T {
  return parsePayload(schema, value);
}

function parseQuery<T>(schema: z.ZodType<T>, value: unknown): T {
  return parsePayload(schema, value);
}

function parseParams<T>(schema: z.ZodType<T>, value: unknown): T {
  return parsePayload(schema, value);
}

function parsePayload<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Solicitud invalida.', result.error.flatten());
  }

  return result.data;
}

function toSessionResponse(session: StoredUatSession) {
  return {
    sessionId: session.id,
    authenticated: true,
    login: toSafeLogin(session.login),
    createdAt: session.createdAt.toISOString(),
    lastUsedAt: session.lastUsedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    activeSessions: uatSessionStore.size(),
    cookieDiagnostics: session.client.getCookieDiagnostics(),
  };
}

function toSafeLogin(login: UatLoginResponse) {
  return {
    exito: login.exito,
    cambiaPass: login.cambiaPass,
    mensaje: login.mensaje,
    parametros: login.parametros,
  };
}

function toUatDataResponse(endpoint: string, query: unknown, data: unknown) {
  return {
    source: 'UAT',
    endpoint,
    query,
    data,
    fetchedAt: new Date().toISOString(),
  };
}
