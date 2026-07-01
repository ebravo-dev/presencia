import type { FastifyPluginAsync } from 'fastify';
import type { UatService } from '../../../application/services/uat.service.js';
import { CatalogoController } from '../controllers/catalogo.controller.js';
import { ConsultaController } from '../controllers/consulta.controller.js';
import { SessionController } from '../controllers/session.controller.js';
import { buildAuthUatHook } from '../hooks/auth-uat.hook.js';

export interface UatRoutesOptions {
  uatService: UatService;
}

export const uatRoutes: FastifyPluginAsync<UatRoutesOptions> = async (fastify, { uatService }) => {
  const authUat = buildAuthUatHook(uatService);
  const sessionController = new SessionController(uatService);
  const consultaController = new ConsultaController(uatService);
  const catalogoController = new CatalogoController(uatService);

  fastify.post('/api/uat/sessions', sessionController.create);
  fastify.delete('/api/uat/sessions/:sessionId', sessionController.delete);

  fastify.get('/api/uat/profesor/consultas/horarios', { preHandler: authUat }, consultaController.horarios);
  fastify.get('/api/uat/profesor/consultas/examenes', { preHandler: authUat }, consultaController.examenes);
  fastify.post('/api/uat/profesor/consultas/snapshot', consultaController.snapshot);

  fastify.get('/api/uat/catalogos/niveles-educativos', { preHandler: authUat }, catalogoController.nivelesEducativos);
  fastify.get('/api/uat/catalogos/campus', { preHandler: authUat }, catalogoController.campus);
  fastify.get('/api/uat/catalogos/des', { preHandler: authUat }, catalogoController.des);
  fastify.get('/api/uat/catalogos/ciclos-escolares', { preHandler: authUat }, catalogoController.ciclosEscolares);
};
