import type { FastifyRequest } from 'fastify';
import type { UatService } from '../../../application/services/uat.service.js';
import { campusQuerySchema, desQuerySchema, parsePayload } from '../schemas/uat.schemas.js';

export class CatalogoController {
  constructor(private readonly uatService: UatService) {}

  nivelesEducativos = async (request: FastifyRequest) => {
    return this.uatService.getNivelesEducativosPorSesion(request.uatSession.id);
  };

  campus = async (request: FastifyRequest) => {
    const query = parsePayload(campusQuerySchema, request.query);

    return this.uatService.getCampusPorSesion(request.uatSession.id, query.id_nivel_educativo);
  };

  des = async (request: FastifyRequest) => {
    const query = parsePayload(desQuerySchema, request.query);

    return this.uatService.getDesPorSesion(request.uatSession.id, query.id_nivel_educativo, query.id_cu);
  };

  ciclosEscolares = async (request: FastifyRequest) => {
    return this.uatService.getCiclosEscolaresPorSesion(request.uatSession.id);
  };
}
