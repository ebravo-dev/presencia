import type { Coordination } from '../../domain/entities/coordination.js';
import type { TeacherAuthenticatedEvent } from '../../domain/events/teacher-authenticated.event.js';
import type { ICoordinationRepository } from '../../domain/repositories/coordination.repository.js';
import type { IGroupAssignmentRepository } from '../../domain/repositories/group-assignment.repository.js';
import type { ISubjectRepository } from '../../domain/repositories/subject.repository.js';
import type { ITeacherRepository } from '../../domain/repositories/teacher.repository.js';
import type { JsonRecord, UatCicloEscolarItem, UatDesItem, UatNivelEducativoItem } from '../../domain/types/uat.interfaces.js';
import type { UatService } from '../services/uat.service.js';
import { UatTeacherDataMapper } from '../mappers/uat-teacher-data.mapper.js';

export interface HarvestTeacherDataResult {
  teacherExternalId: string;
  coordinationCount: number;
  groupCount: number;
  skipped: boolean;
  skipReason?: string;
}

export interface HarvestTeacherDataOptions {
  preferredCycleId?: number;
}

export class HarvestTeacherDataUseCase {
  constructor(
    private readonly uatService: UatService,
    private readonly teacherRepository: ITeacherRepository,
    private readonly subjectRepository: ISubjectRepository,
    private readonly coordinationRepository: ICoordinationRepository,
    private readonly groupAssignmentRepository: IGroupAssignmentRepository,
    private readonly options: HarvestTeacherDataOptions = {},
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
    const cycles = selectHarvestCycles(cyclesResponse.data, this.options.preferredCycleId);
    const desItems = await this.discoverCoordinations(event.sessionId);
    let groupCount = 0;

    for (const context of desItems) {
      const { des } = context;
      await this.coordinationRepository.upsert(toCoordination(des));

      for (const cycle of cycles) {
        const cycleExternalId = String(cycle.Id_Ciclo_Escolar);
        const cycleName = cycle.Ciclo ?? cycle.Txt_Ciclo_Escolar ?? cycle.Txt_Nombre_Corto ?? null;
        const response = await this.uatService.getGruposProfesorPorSesion(event.sessionId, {
          Id_Des: des.Id_DES,
          Id_Ciclo: cycle.Id_Ciclo_Escolar,
          Id_Plantilla: event.teacher.plantillaId,
        });
        if (response.data.length === 0) continue;

        const schedules = await this.uatService.getHorariosPorSesion(event.sessionId, {
          Id_Ciclo_Escolar: cycle.Id_Ciclo_Escolar,
          Id_DES: des.Id_DES,
        });
        const scheduleByGroup = new Map(schedules.data.map((item) => [String(item.Id_Grupo), item]));

        for (const raw of response.data) {
          const mapped = this.mapper.mapGroup({
            raw,
            teacher: event.teacher,
            des,
            cycleExternalId,
            cycleName,
            educationLevel: context.level.Txt_Nivel_Educativo || context.level.Txt_Nombre_Corto || null,
            schedule: scheduleByGroup.get(String(raw.Id_Grupo)),
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

  private async discoverCoordinations(
    sessionId: string,
  ): Promise<Array<{ des: UatDesItem; level: UatNivelEducativoItem }>> {
    const levels = (await this.uatService.getNivelesEducativosPorSesion(sessionId)).data;
    const coordinations = new Map<number, { des: UatDesItem; level: UatNivelEducativoItem }>();

    for (const level of levels) {
      const campuses = (await this.uatService.getCampusPorSesion(sessionId, level.Id_Nivel_Educativo)).data;

      for (const campus of campuses) {
        const items = (await this.uatService.getDesPorSesion(sessionId, level.Id_Nivel_Educativo, campus.Id_CU)).data;
        for (const item of items) {
          const normalized = normalizeDesItem(item);
          if (normalized) coordinations.set(normalized.Id_DES, { des: normalized, level });
        }
      }
    }

    return [...coordinations.values()];
  }
}

function toCoordination(item: UatDesItem): Coordination {
  const name =
    readString(item, ['Txt_DES', 'txt_des', 'DES', 'Txt_Nombre', 'Nombre', 'Txt_Nombre_Corto']) ??
    `Coordinacion ${item.Id_DES}`;

  return {
    externalId: String(item.Id_DES),
    name,
    shortName: readString(item, ['Txt_Nombre_Corto', 'txt_nombre_corto', 'Nombre_Corto', 'shortName']),
  };
}

function normalizeDesItem(item: UatDesItem): UatDesItem | null {
  const id = readNumber(item, ['Id_DES', 'Id_Des', 'id_des', 'idDes']);
  if (id == null) return null;
  return { ...item, Id_DES: id };
}

function readString(record: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' || typeof value === 'number') {
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
  }
  return null;
}

function readNumber(record: JsonRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function selectHarvestCycles(cycles: UatCicloEscolarItem[], preferredCycleId?: number): UatCicloEscolarItem[] {
  if (preferredCycleId) {
    const preferred = cycles.find((cycle) => cycle.Id_Ciclo_Escolar === preferredCycleId);
    return [preferred ?? { Id_Ciclo_Escolar: preferredCycleId, Ciclo: String(preferredCycleId) }];
  }

  const active = cycles.filter((cycle) => isTruthyFlag(cycle.Sn_Activo));
  return active.length > 0 ? active : cycles;
}

function isTruthyFlag(value: boolean | string | number | undefined): boolean {
  if (value === true || value === 1) return true;
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'si', 'sí', 'activo'].includes(value.trim().toLowerCase());
}
