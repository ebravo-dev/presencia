import { createHash } from 'node:crypto';
import type { Coordination } from '../../domain/entities/coordination.js';
import type { Group, WeeklySchedule } from '../../domain/entities/group.js';
import type { Subject } from '../../domain/entities/subject.js';
import type { TeacherAuthenticatedEvent } from '../../domain/events/teacher-authenticated.event.js';
import type { ICoordinationRepository } from '../../domain/repositories/coordination.repository.js';
import type { IGroupAssignmentRepository } from '../../domain/repositories/group-assignment.repository.js';
import type { ISubjectRepository } from '../../domain/repositories/subject.repository.js';
import type { ITeacherRepository } from '../../domain/repositories/teacher.repository.js';
import type { JsonRecord, UatCicloEscolarItem, UatDesItem, UatNivelEducativoItem } from '../../domain/types/uat.interfaces.js';
import type { UatService } from '../services/uat.service.js';
import { MappedTeacherGroup, UatTeacherDataMapper } from '../mappers/uat-teacher-data.mapper.js';
import type {
  AcademicSnapshotPublisher,
  AcademicSnapshotStudent,
  ProfessorAcademicSnapshotInput,
} from '../ports/academic-snapshot.publisher.js';

export interface HarvestTeacherDataResult {
  teacherExternalId: string;
  coordinationCount: number;
  groupCount: number;
  debugSyntheticTeacherCount?: number;
  debugSyntheticGroupCount?: number;
  skipped: boolean;
  skipReason?: string;
}

export interface HarvestTeacherDataOptions {
  preferredCycleId?: number;
  debug?: HarvestDebugOptions;
}

export interface HarvestDebugOptions {
  enabled: boolean;
  cycleId: number;
  cycleName: string;
  extraProfessorCount: number;
  extraProfessors?: DebugProfessorInput[];
  verboseLogs: boolean;
}

export interface DebugProfessorInput {
  externalId?: string;
  institutionalCode?: string | null;
  name?: string;
  email?: string | null;
}

export interface HarvestLogger {
  debug(bindings: object, message: string): void;
  info(bindings: object, message: string): void;
  warn(bindings: object, message: string): void;
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
    private readonly logger?: HarvestLogger,
    private readonly academicSnapshotPublisher?: AcademicSnapshotPublisher,
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
      if (this.options.debug?.enabled) {
        this.logger?.warn({
          teacherExternalId: event.teacher.externalId,
          debugMode: true,
        }, 'Modo debug activo: login sin Id_Plantilla_AdmonUAT, se sembraran fixtures sinteticos.');
        const debugSeed = await this.seedDebugProfessors(event, [], []);
        await this.teacherRepository.markHarvested(event.teacher.externalId, new Date());

        return {
          teacherExternalId: event.teacher.externalId,
          coordinationCount: 0,
          groupCount: 0,
          debugSyntheticTeacherCount: debugSeed.teacherCount,
          debugSyntheticGroupCount: debugSeed.groupCount,
          skipped: false,
        };
      }

      return {
        teacherExternalId: event.teacher.externalId,
        coordinationCount: 0,
        groupCount: 0,
        skipped: true,
        skipReason: 'La respuesta de login no incluyo Id_Plantilla_AdmonUAT.',
      };
    }

    const cycleOverride = this.options.debug?.enabled ? this.options.debug.cycleId : this.options.preferredCycleId;
    const cyclesResponse = await this.uatService.getCiclosEscolaresPorSesion(event.sessionId);
    const cycles = selectHarvestCycles(cyclesResponse.data, cycleOverride, this.options.debug);
    const desItems = await this.discoverCoordinations(event.sessionId);
    let groupCount = 0;
    const harvestedGroups: MappedTeacherGroup[] = [];
    const academicGroups: Array<{
      mapped: MappedTeacherGroup;
      rosterAuthoritative: boolean;
      students: AcademicSnapshotStudent[];
    }> = [];

    this.logDebug({
      teacherExternalId: event.teacher.externalId,
      debugMode: this.options.debug?.enabled ?? false,
      preferredCycleId: this.options.preferredCycleId ?? null,
      cycleOverride: cycleOverride ?? null,
      selectedCycles: cycles.map((cycle) => ({
        id: cycle.Id_Ciclo_Escolar,
        name: cycle.Ciclo ?? cycle.Txt_Ciclo_Escolar ?? cycle.Txt_Nombre_Corto ?? null,
      })),
      discoveredCoordinations: desItems.map((context) => ({
        id: context.des.Id_DES,
        name: readString(context.des, ['Txt_DES', 'txt_des', 'DES', 'Txt_Nombre', 'Nombre', 'Txt_Nombre_Corto']),
        level: context.level.Txt_Nivel_Educativo ?? context.level.Txt_Nombre_Corto ?? null,
      })),
    }, 'Debug cosecha: contexto UAT seleccionado.');

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
        this.logDebug({
          teacherExternalId: event.teacher.externalId,
          desId: des.Id_DES,
          cycleId: cycle.Id_Ciclo_Escolar,
          groupResponseCount: response.data.length,
        }, 'Debug cosecha: grupos UAT recibidos.');
        if (response.data.length === 0) continue;

        const schedules = await this.uatService.getHorariosPorSesion(event.sessionId, {
          Id_Ciclo_Escolar: cycle.Id_Ciclo_Escolar,
          Id_DES: des.Id_DES,
        });
        const scheduleByGroup = new Map(schedules.data.map((item) => [String(item.Id_Grupo), item]));
        this.logDebug({
          teacherExternalId: event.teacher.externalId,
          desId: des.Id_DES,
          cycleId: cycle.Id_Ciclo_Escolar,
          scheduleResponseCount: schedules.data.length,
          scheduleGroupIds: schedules.data.map((item) => item.Id_Grupo).slice(0, 25),
        }, 'Debug cosecha: horarios UAT recibidos.');

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
          harvestedGroups.push(mapped);
          if (this.academicSnapshotPublisher) {
            const roster = await this.loadGroupRoster(event.sessionId, mapped.group.externalGroupId);
            academicGroups.push({ mapped, ...roster });
          }
          groupCount += 1;
        }
      }
    }

    if (this.academicSnapshotPublisher) {
      for (const cycle of cycles) {
        const cycleExternalId = String(cycle.Id_Ciclo_Escolar);
        const cycleName = cycle.Ciclo ?? cycle.Txt_Ciclo_Escolar ?? cycle.Txt_Nombre_Corto ?? cycleExternalId;
        const groups = academicGroups.filter(({ mapped }) => mapped.group.schoolCycleExternalId === cycleExternalId);
        await this.academicSnapshotPublisher.publishProfessorSnapshot(
          toAcademicSnapshot(event, cycleExternalId, cycleName, groups),
        );
      }
    }

    const debugSeed = this.options.debug?.enabled
      ? await this.seedDebugProfessors(event, harvestedGroups, desItems)
      : { teacherCount: 0, groupCount: 0 };

    await this.teacherRepository.markHarvested(event.teacher.externalId, new Date());

    return {
      teacherExternalId: event.teacher.externalId,
      coordinationCount: desItems.length,
      groupCount,
      debugSyntheticTeacherCount: debugSeed.teacherCount,
      debugSyntheticGroupCount: debugSeed.groupCount,
      skipped: false,
    };
  }

  private async loadGroupRoster(
    sessionId: string,
    externalGroupId: string,
  ): Promise<{ rosterAuthoritative: boolean; students: AcademicSnapshotStudent[] }> {
    const groupId = Number(externalGroupId);
    if (!Number.isSafeInteger(groupId) || groupId <= 0) {
      this.logger?.warn({ externalGroupId }, 'No se consulto el roster: Id_Grupo UAT invalido.');
      return { rosterAuthoritative: false, students: [] };
    }

    try {
      const weeks = (await this.uatService.getSemanasGrupoPorSesion(sessionId, { Id_Grupo: groupId })).data;
      const week = weeks.find((item) => {
        const start = readString(item, ['Fec_Ini', 'fec_ini']);
        const end = readString(item, ['Fec_Fin', 'fec_fin']);
        return Boolean(start && end);
      });
      const start = week ? readString(week, ['Fec_Ini', 'fec_ini']) : null;
      const end = week ? readString(week, ['Fec_Fin', 'fec_fin']) : null;
      if (!start || !end) {
        this.logger?.warn({ externalGroupId }, 'La UAT no devolvio una semana valida; se conserva el roster previo.');
        return { rosterAuthoritative: false, students: [] };
      }

      const response = (await this.uatService.getAsistenciaGrupoPorSesion(sessionId, {
        Id_Grupo: groupId,
        fec_ini: start,
        fec_fin: end,
      })).data;
      if (response.exito === false) {
        this.logger?.warn({ externalGroupId, message: response.mensaje ?? null }, 'La UAT rechazo la consulta del roster.');
        return { rosterAuthoritative: false, students: [] };
      }
      const rawStudents = response.alumnos ?? response.Alumnos ?? response.data;
      if (!Array.isArray(rawStudents)) {
        this.logger?.warn({ externalGroupId }, 'La respuesta UAT no incluyo una lista de alumnos; se conserva el roster previo.');
        return { rosterAuthoritative: false, students: [] };
      }

      const students = new Map<string, AcademicSnapshotStudent>();
      for (const item of rawStudents) {
        const matricula = readString(item, ['Num_Matricula', 'num_matricula', 'Matricula', 'Id_Alumno', 'id_alumno']);
        if (!matricula) continue;
        students.set(matricula.toUpperCase(), {
          matricula: matricula.toUpperCase(),
          name: readString(item, ['Txt_Alumno', 'txt_alumno', 'Nombre', 'Alumno']) ?? matricula,
          uatStudentId: readNumber(item, ['Id_Alumno', 'id_alumno']),
          listNumber: readNumber(item, ['Num_Lista', 'num_lista']),
        });
      }
      return { rosterAuthoritative: true, students: [...students.values()] };
    } catch (error) {
      this.logger?.warn({
        externalGroupId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'No se pudo consultar el roster UAT; se conserva el roster previo.');
      return { rosterAuthoritative: false, students: [] };
    }
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

  private async seedDebugProfessors(
    event: TeacherAuthenticatedEvent,
    harvestedGroups: MappedTeacherGroup[],
    desItems: Array<{ des: UatDesItem; level: UatNivelEducativoItem }>,
  ): Promise<{ teacherCount: number; groupCount: number }> {
    const debug = this.options.debug;
    if (!debug?.enabled || debug.extraProfessorCount <= 0) return { teacherCount: 0, groupCount: 0 };

    const professors = buildDebugProfessors(debug);
    const sourceGroups = harvestedGroups.length > 0
      ? harvestedGroups
      : buildFallbackDebugGroups(event, debug, desItems);
    let groupCount = 0;

    this.logger?.info({
      teacherExternalId: event.teacher.externalId,
      debugCycleId: debug.cycleId,
      debugCycleName: debug.cycleName,
      syntheticTeacherCount: professors.length,
      sourceGroupCount: harvestedGroups.length,
      fallbackFixtures: harvestedGroups.length === 0,
    }, 'Modo debug activo: sembrando profesores sinteticos para coordinacion.');

    for (const professor of professors) {
      await this.teacherRepository.upsert({
        externalId: professor.externalId,
        institutionalCode: professor.institutionalCode,
        name: professor.name,
        email: professor.email,
        lastAuthenticatedAt: event.occurredAt,
        lastHarvestedAt: new Date(),
      });

      for (const source of sourceGroups) {
        await this.coordinationRepository.upsert(source.coordination);
        await this.subjectRepository.upsert(source.subject);
        await this.groupAssignmentRepository.upsert(cloneDebugGroup(source.group, professor.externalId, debug));
        groupCount += 1;
      }

      this.logDebug({
        syntheticTeacherExternalId: professor.externalId,
        syntheticTeacherName: professor.name,
        clonedGroupCount: sourceGroups.length,
      }, 'Debug cosecha: profesor sintetico sembrado.');
    }

    return { teacherCount: professors.length, groupCount };
  }

  private logDebug(bindings: object, message: string): void {
    if (!this.options.debug?.enabled || !this.options.debug.verboseLogs) return;
    this.logger?.debug(bindings, message);
  }
}

function toAcademicSnapshot(
  event: TeacherAuthenticatedEvent,
  cycleExternalId: string,
  cycleName: string,
  groups: Array<{
    mapped: MappedTeacherGroup;
    rosterAuthoritative: boolean;
    students: AcademicSnapshotStudent[];
  }>,
): ProfessorAcademicSnapshotInput {
  return {
    snapshotId: stableSnapshotId(event.eventId, cycleExternalId),
    correlationId: event.correlationId,
    causationId: event.eventId,
    teacher: {
      externalId: event.teacher.externalId,
      institutionalCode: event.teacher.institutionalCode,
      name: event.teacher.name,
      email: event.teacher.email,
      authenticatedAt: event.occurredAt.toISOString(),
    },
    cycle: { externalId: cycleExternalId, name: cycleName },
    groups: groups.map(({ mapped, rosterAuthoritative, students }) => ({
      externalGroupId: mapped.group.externalGroupId,
      code: mapped.group.externalGroupId,
      groupLetter: mapped.group.groupCode ?? '',
      name: mapped.subject.name,
      level: mapped.group.educationLevel,
      classroom: mapped.group.classroom,
      schedule: Object.fromEntries(Object.entries(mapped.group.schedule)),
      subject: {
        externalId: mapped.subject.externalId,
        code: mapped.subject.code,
        name: mapped.subject.name,
      },
      coordination: {
        externalId: mapped.coordination.externalId,
        name: mapped.coordination.name,
        shortName: mapped.coordination.shortName,
      },
      rosterAuthoritative,
      students,
    })),
  };
}

function stableSnapshotId(eventId: string, cycleExternalId: string): string {
  const bytes = createHash('sha256').update(`${eventId}:${cycleExternalId}`).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const value = bytes.toString('hex');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
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

function selectHarvestCycles(
  cycles: UatCicloEscolarItem[],
  preferredCycleId?: number,
  debug?: HarvestDebugOptions,
): UatCicloEscolarItem[] {
  if (preferredCycleId) {
    const preferred = cycles.find((cycle) => cycle.Id_Ciclo_Escolar === preferredCycleId);
    return [preferred ?? {
      Id_Ciclo_Escolar: preferredCycleId,
      Ciclo: debug?.enabled ? debug.cycleName : String(preferredCycleId),
      Txt_Ciclo_Escolar: debug?.enabled ? debug.cycleName : String(preferredCycleId),
    }];
  }

  const active = cycles.filter((cycle) => isTruthyFlag(cycle.Sn_Activo));
  return active.length > 0 ? active : cycles;
}

function buildDebugProfessors(debug: HarvestDebugOptions) {
  const configured = debug.extraProfessors?.slice(0, debug.extraProfessorCount) ?? [];
  const result = configured.map((professor, index) => normalizeDebugProfessor(professor, index + 1));

  for (let index = result.length + 1; index <= debug.extraProfessorCount; index += 1) {
    result.push(normalizeDebugProfessor({}, index));
  }

  return result;
}

function normalizeDebugProfessor(input: DebugProfessorInput, index: number) {
  const suffix = String(index).padStart(2, '0');
  return {
    externalId: input.externalId?.trim() || `debug-profesor-${suffix}`,
    institutionalCode: input.institutionalCode === undefined ? `DBG${suffix}` : input.institutionalCode,
    name: input.name?.trim() || `Profesor Debug ${suffix}`,
    email: input.email === undefined ? `profesor.debug.${suffix}@example.test` : input.email,
  };
}

function cloneDebugGroup(group: Group, teacherExternalId: string, debug: HarvestDebugOptions): Group {
  const groupSuffix = slug(`${teacherExternalId}-${group.externalGroupId}`);
  return {
    ...group,
    externalGroupId: `debug:${groupSuffix}`,
    groupCode: group.groupCode ?? teacherExternalId.replace(/^debug-profesor-/, 'D').toUpperCase(),
    schoolCycleExternalId: String(debug.cycleId),
    schoolCycleName: debug.cycleName,
    teacherExternalId,
    rawPayload: {
      ...group.rawPayload,
      __debug: true,
      __debugTeacherExternalId: teacherExternalId,
      __debugSourceGroupId: group.externalGroupId,
    },
  };
}

function buildFallbackDebugGroups(
  event: TeacherAuthenticatedEvent,
  debug: HarvestDebugOptions,
  desItems: Array<{ des: UatDesItem; level: UatNivelEducativoItem }>,
): MappedTeacherGroup[] {
  const fallbackDes = desItems[0]?.des ?? { Id_DES: 12, Txt_DES: 'Facultad de Ingenieria Tampico', Txt_Nombre_Corto: 'FI' };
  const coordination = toCoordination(fallbackDes);
  const educationLevel = desItems[0]?.level.Txt_Nivel_Educativo ?? desItems[0]?.level.Txt_Nombre_Corto ?? 'Licenciatura';

  return [
    fallbackMappedGroup({
      index: 1,
      teacherExternalId: event.teacher.externalId,
      coordination,
      educationLevel,
      debug,
      subject: { externalId: `${coordination.externalId}:debug-calculo`, code: 'DBG-CAL', name: 'Calculo Diferencial Debug', coordinationExternalId: coordination.externalId },
      classroom: 'AULA DEBUG 101',
      monday: '07:00 - 09:00',
      wednesday: '07:00 - 09:00',
    }),
    fallbackMappedGroup({
      index: 2,
      teacherExternalId: event.teacher.externalId,
      coordination,
      educationLevel,
      debug,
      subject: { externalId: `${coordination.externalId}:debug-programacion`, code: 'DBG-PRG', name: 'Programacion Debug', coordinationExternalId: coordination.externalId },
      classroom: 'LAB DEBUG 202',
      tuesday: '10:00 - 12:00',
      thursday: '10:00 - 12:00',
    }),
  ];
}

function fallbackMappedGroup(input: {
  index: number;
  teacherExternalId: string;
  coordination: Coordination;
  educationLevel: string | null;
  debug: HarvestDebugOptions;
  subject: Subject;
  classroom: string;
  monday?: string;
  tuesday?: string;
  wednesday?: string;
  thursday?: string;
}): MappedTeacherGroup {
  return {
    coordination: input.coordination,
    subject: input.subject,
    group: {
      externalGroupId: `debug:fixture-source:${input.index}`,
      groupCode: `D${input.index}`,
      schoolCycleExternalId: String(input.debug.cycleId),
      schoolCycleName: input.debug.cycleName,
      classroom: input.classroom,
      educationLevel: input.educationLevel,
      period: input.debug.cycleName,
      schedule: weeklySchedule({
        monday: input.monday,
        tuesday: input.tuesday,
        wednesday: input.wednesday,
        thursday: input.thursday,
      }),
      teacherExternalId: input.teacherExternalId,
      subjectExternalId: input.subject.externalId,
      coordinationExternalId: input.coordination.externalId,
      rawPayload: { __debug: true, __debugFixture: true, index: input.index },
    },
  };
}

function weeklySchedule(input: Partial<Record<keyof WeeklySchedule, string>>): WeeklySchedule {
  return {
    monday: input.monday ? [slot(input.monday)] : [],
    tuesday: input.tuesday ? [slot(input.tuesday)] : [],
    wednesday: input.wednesday ? [slot(input.wednesday)] : [],
    thursday: input.thursday ? [slot(input.thursday)] : [],
    friday: input.friday ? [slot(input.friday)] : [],
    saturday: input.saturday ? [slot(input.saturday)] : [],
    sunday: input.sunday ? [slot(input.sunday)] : [],
  };
}

function slot(raw: string) {
  const match = raw.match(/\b(\d{1,2}:\d{2})\s*(?:-|a)\s*(\d{1,2}:\d{2})\b/i);
  return {
    raw,
    startTime: match?.[1] ? match[1].padStart(5, '0') : null,
    endTime: match?.[2] ? match[2].padStart(5, '0') : null,
  };
}

function slug(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function isTruthyFlag(value: boolean | string | number | undefined): boolean {
  if (value === true || value === 1) return true;
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'si', 'sí', 'activo'].includes(value.trim().toLowerCase());
}
