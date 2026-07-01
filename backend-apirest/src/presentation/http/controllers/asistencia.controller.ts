import type { FastifyRequest } from 'fastify';
import type { UatService } from '../../../application/services/uat.service.js';
import {
  asistenciaGrupoQuerySchema,
  gruposProfesorQuerySchema,
  parsePayload,
  registrarAsistenciasBodySchema,
  semanasGrupoQuerySchema,
} from '../schemas/uat.schemas.js';

export class AsistenciaController {
  constructor(private readonly uatService: UatService) {}

  gruposProfesor = async (request: FastifyRequest) => {
    const query = parsePayload(gruposProfesorQuerySchema, request.query);

    return this.uatService.getGruposProfesorPorSesion(request.uatSession.id, query);
  };

  semanasGrupo = async (request: FastifyRequest) => {
    const query = parsePayload(semanasGrupoQuerySchema, request.query);

    return this.uatService.getSemanasGrupoPorSesion(request.uatSession.id, query);
  };

  asistenciaGrupo = async (request: FastifyRequest) => {
    const query = parsePayload(asistenciaGrupoQuerySchema, request.query);

    return this.uatService.getAsistenciaGrupoPorSesion(request.uatSession.id, query);
  };

  guardar = async (request: FastifyRequest) => {
    const body = parsePayload(registrarAsistenciasBodySchema, request.body);

    return this.uatService.registrarAsistencias(
      request.uatSession.id,
      body.Id_Grupo,
      body.Fec_Ini,
      body.Asistencia,
    );
  };
}
