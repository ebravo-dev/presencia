import type { FastifyRequest } from 'fastify';
import type { UatService } from '../../../application/services/uat.service.js';
import { consultaQuerySchema, parsePayload, snapshotSchema } from '../schemas/uat.schemas.js';

export class ConsultaController {
  constructor(private readonly uatService: UatService) {}

  horarios = async (request: FastifyRequest) => {
    const query = parsePayload(consultaQuerySchema, request.query);

    return this.uatService.getHorariosPorSesion(request.uatSession.id, query);
  };

  examenes = async (request: FastifyRequest) => {
    const query = parsePayload(consultaQuerySchema, request.query);

    return this.uatService.getExamenesPorSesion(request.uatSession.id, query);
  };

  snapshot = async (request: FastifyRequest) => {
    const body = parsePayload(snapshotSchema, request.body);
    const query = {
      Id_Ciclo_Escolar: body.Id_Ciclo_Escolar,
      Id_DES: body.Id_DES,
    };

    return this.uatService.getStatelessSnapshot(
      {
        username: body.username,
        password: body.password,
      },
      query,
      {
        includeExamenes: body.includeExamenes,
      },
    );
  };
}
