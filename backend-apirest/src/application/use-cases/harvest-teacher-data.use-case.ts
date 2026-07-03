import type { Coordination } from '../../domain/entities/coordination.js';
import type { TeacherAuthenticatedEvent } from '../../domain/events/teacher-authenticated.event.js';
import type { ICoordinationRepository } from '../../domain/repositories/coordination.repository.js';
import type { IGroupAssignmentRepository } from '../../domain/repositories/group-assignment.repository.js';
import type { ISubjectRepository } from '../../domain/repositories/subject.repository.js';
import type { ITeacherRepository } from '../../domain/repositories/teacher.repository.js';
import type { UatCicloEscolarItem, UatDesItem } from '../../domain/types/uat.interfaces.js';
import type { UatService } from '../services/uat.service.js';
import { UatTeacherDataMapper } from '../mappers/uat-teacher-data.mapper.js';

export interface HarvestTeacherDataResult {
  teacherExternalId: string;
  coordinationCount: number;
  groupCount: number;
  skipped: boolean;
  skipReason?: string;
}

export class HarvestTeacherDataUseCase {
  constructor(
    private readonly uatService: UatService,
    private readonly teacherRepository: ITeacherRepository,
    private readonly subjectRepository: ISubjectRepository,
    private readonly coordinationRepository: ICoordinationRepository,
    private readonly groupAssignmentRepository: IGroupAssignmentRepository,
    private readonly mapper = new UatTeacherDataMapper(),
  ) {}

  async execute(event: TeacherAuthenticatedEvent): Promise<HarvestTeacherDataResult> {
    await this.teacherRepository.upsert({
      externalId: event.teacher.externalId,
      institutionalCode: event.teacher.institutionalCode,
      name: event.teacher.name,
      email: event.teacher.email,
      lastAuthenticatedAt: event.occurredAt,
      lastHarvestedAt: null,
    });

    if (!event.teacher.plantillaId) {
      return {
        teacherExternalId: event.teacher.externalId,
        coordinationCount: 0,
        groupCount: 0,
        skipped: true,
        skipReason: 'La respuesta de login no incluyo Id_Plantilla_AdmonUAT.',
      };
    }

    const cyclesResponse = await this.uatService.getCiclosEscolaresPorSesion(event.sessionId);
    const cycles = selectHarvestCycles(cyclesResponse.data);
    const desItems = await this.discoverCoordinations(event.sessionId);
    let groupCount = 0;

    for (const des of desItems) {
      await this.coordinationRepository.upsert(toCoordination(des));

      for (const cycle of cycles) {
        const cycleExternalId = String(cycle.Id_Ciclo_Escolar);
        const cycleName = cycle.Ciclo ?? cycle.Txt_Ciclo_Escolar ?? cycle.Txt_Nombre_Corto ?? null;
        const response = await this.uatService.getGruposProfesorPorSesion(event.sessionId, {
          Id_Des: des.Id_DES,
          Id_Ciclo: cycle.Id_Ciclo_Escolar,
          Id_Plantilla: event.teacher.plantillaId,
        });

        for (const raw of response.data) {
          const mapped = this.mapper.mapGroup({
            raw,
            teacher: event.teacher,
            des,
            cycleExternalId,
            cycleName,
          });

          await this.coordinationRepository.upsert(mapped.coordination);
          await this.subjectRepository.upsert(mapped.subject);
          await this.groupAssignmentRepository.upsert(mapped.group);
          groupCount += 1;
        }
      }
    }

    await this.teacherRepository.markHarvested(event.teacher.externalId, new Date());

    return {
      teacherExternalId: event.teacher.externalId,
      coordinationCount: desItems.length,
      groupCount,
      skipped: false,
    };
  }

  private async discoverCoordinations(sessionId: string): Promise<UatDesItem[]> {
    const levels = (await this.uatService.getNivelesEducativosPorSesion(sessionId)).data;
    const coordinations = new Map<number, UatDesItem>();

    for (const level of levels) {
      const campuses = (await this.uatService.getCampusPorSesion(sessionId, level.Id_Nivel_Educativo)).data;

      for (const campus of campuses) {
        const items = (await this.uatService.getDesPorSesion(sessionId, level.Id_Nivel_Educativo, campus.Id_CU)).data;
        for (const item of items) coordinations.set(item.Id_DES, item);
      }
    }

    return [...coordinations.values()];
  }
}

function toCoordination(item: UatDesItem): Coordination {
  return {
    externalId: String(item.Id_DES),
    name: item.Txt_DES.trim() || `Coordinacion ${item.Id_DES}`,
    shortName: item.Txt_Nombre_Corto?.trim() || null,
  };
}

function selectHarvestCycles(cycles: UatCicloEscolarItem[]): UatCicloEscolarItem[] {
  const active = cycles.filter((cycle) => isTruthyFlag(cycle.Sn_Activo));
  return active.length > 0 ? active : cycles;
}

function isTruthyFlag(value: boolean | string | number | undefined): boolean {
  if (value === true || value === 1) return true;
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'si', 'sí', 'activo'].includes(value.trim().toLowerCase());
}
