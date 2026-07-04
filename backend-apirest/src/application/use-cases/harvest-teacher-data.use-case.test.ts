import { describe, expect, it } from 'vitest';
import type { Coordination } from '../../domain/entities/coordination.js';
import type { Group } from '../../domain/entities/group.js';
import type { Subject } from '../../domain/entities/subject.js';
import type { Teacher } from '../../domain/entities/teacher.js';
import { TEACHER_AUTHENTICATED_EVENT, type TeacherAuthenticatedEvent } from '../../domain/events/teacher-authenticated.event.js';
import type { ICoordinationRepository } from '../../domain/repositories/coordination.repository.js';
import type { IGroupAssignmentRepository } from '../../domain/repositories/group-assignment.repository.js';
import type { ISubjectRepository } from '../../domain/repositories/subject.repository.js';
import type { ITeacherRepository } from '../../domain/repositories/teacher.repository.js';
import type { UatService } from '../services/uat.service.js';
import { HarvestTeacherDataUseCase } from './harvest-teacher-data.use-case.js';

describe('HarvestTeacherDataUseCase', () => {
  it('guarda grupos aunque la DES no incluya Txt_DES', async () => {
    const repositories = makeRepositories();

    const uatService = {
      getCiclosEscolaresPorSesion: async () => ({
        source: 'UAT',
        endpoint: 'BuscarCicloEscolar',
        query: {},
        data: [{ Id_Ciclo_Escolar: 150, Ciclo: '2026-1', Sn_Activo: true }],
        fetchedAt: new Date().toISOString(),
      }),
      getNivelesEducativosPorSesion: async () => ({
        source: 'UAT',
        endpoint: 'BuscarNivelEducativo',
        query: {},
        data: [{ Id_Nivel_Educativo: 1, Txt_Nivel_Educativo: 'Licenciatura' }],
        fetchedAt: new Date().toISOString(),
      }),
      getCampusPorSesion: async () => ({
        source: 'UAT',
        endpoint: 'BuscarCampus',
        query: {},
        data: [{ Id_CU: 1, Txt_CU: 'Tampico' }],
        fetchedAt: new Date().toISOString(),
      }),
      getDesPorSesion: async () => ({
        source: 'UAT',
        endpoint: 'BuscarDES',
        query: {},
        data: [{ Id_DES: 12, Txt_Nombre_Corto: 'FI' }],
        fetchedAt: new Date().toISOString(),
      }),
      getGruposProfesorPorSesion: async () => ({
        source: 'UAT',
        endpoint: 'BuscaGruposProfesor',
        query: {},
        data: [{ Id_Grupo: 947699, Txt_Materia: 'Calculo I', Txt_Letra: 'A' }],
        fetchedAt: new Date().toISOString(),
      }),
      getHorariosPorSesion: async () => ({
        source: 'UAT',
        endpoint: 'BuscaHorarios',
        query: {},
        data: [{ Id_Grupo: 947699, Txt_Espacio_Fisico: 'A1', Txt_Lunes: '7:00 - 8:00', Num_Periodo: 1 }],
        fetchedAt: new Date().toISOString(),
      }),
    } as unknown as UatService;

    const result = await new HarvestTeacherDataUseCase(
      uatService,
      repositories.teacherRepository,
      repositories.subjectRepository,
      repositories.coordinationRepository,
      repositories.groupAssignmentRepository,
    ).execute(makeEvent());

    expect(result).toMatchObject({ coordinationCount: 1, groupCount: 1, skipped: false });
    expect(repositories.wasHarvested()).toBe(true);
    expect(repositories.coordinations[0]).toMatchObject({ externalId: '12', name: 'FI', shortName: 'FI' });
    expect(repositories.subjects[0]).toMatchObject({ name: 'Calculo I', coordinationExternalId: '12' });
    expect(repositories.groups[0]).toMatchObject({
      externalGroupId: '947699',
      groupCode: 'A',
      classroom: 'A1',
      educationLevel: 'Licenciatura',
      coordinationExternalId: '12',
    });
    expect(repositories.groups[0]?.schedule.monday[0]).toEqual({
      raw: '7:00 - 8:00',
      startTime: '07:00',
      endTime: '08:00',
    });
  });

  it('continua con otras coordinaciones cuando una DES no tiene grupos asignados', async () => {
    const repositories = makeRepositories();
    const horariosConsultados: number[] = [];

    const uatService = {
      getCiclosEscolaresPorSesion: async () => ({
        source: 'UAT',
        endpoint: 'BuscarCicloEscolar',
        query: {},
        data: [{ Id_Ciclo_Escolar: 150, Ciclo: '2026-1', Sn_Activo: true }],
        fetchedAt: new Date().toISOString(),
      }),
      getNivelesEducativosPorSesion: async () => ({
        source: 'UAT',
        endpoint: 'BuscarNivelEducativo',
        query: {},
        data: [{ Id_Nivel_Educativo: 1, Txt_Nivel_Educativo: 'Licenciatura' }],
        fetchedAt: new Date().toISOString(),
      }),
      getCampusPorSesion: async () => ({
        source: 'UAT',
        endpoint: 'BuscarCampus',
        query: {},
        data: [{ Id_CU: 1, Txt_CU: 'Tampico' }],
        fetchedAt: new Date().toISOString(),
      }),
      getDesPorSesion: async () => ({
        source: 'UAT',
        endpoint: 'BuscarDES',
        query: {},
        data: [
          { Id_DES: 99, Txt_Nombre_Corto: 'SIN' },
          { Id_DES: 12, Txt_Nombre_Corto: 'FI' },
        ],
        fetchedAt: new Date().toISOString(),
      }),
      getGruposProfesorPorSesion: async (_sessionId: string, params: { Id_Des: number }) => ({
        source: 'UAT',
        endpoint: 'BuscaGruposProfesor',
        query: {},
        data: params.Id_Des === 99 ? [] : [{ Id_Grupo: 947699, Txt_Materia: 'Calculo I', Txt_Letra: 'A' }],
        fetchedAt: new Date().toISOString(),
      }),
      getHorariosPorSesion: async (_sessionId: string, params: { Id_DES: number }) => {
        horariosConsultados.push(params.Id_DES);
        return {
          source: 'UAT',
          endpoint: 'BuscaHorarios',
          query: {},
          data: [{ Id_Grupo: 947699, Txt_Espacio_Fisico: 'A1', Txt_Lunes: '7:00 - 8:00', Num_Periodo: 1 }],
          fetchedAt: new Date().toISOString(),
        };
      },
    } as unknown as UatService;

    const result = await new HarvestTeacherDataUseCase(
      uatService,
      repositories.teacherRepository,
      repositories.subjectRepository,
      repositories.coordinationRepository,
      repositories.groupAssignmentRepository,
    ).execute(makeEvent());

    expect(result).toMatchObject({ coordinationCount: 2, groupCount: 1, skipped: false });
    expect(repositories.groups[0]).toMatchObject({ externalGroupId: '947699', coordinationExternalId: '12' });
    expect(horariosConsultados).toEqual([12]);
  });

  it('prefiere el ciclo configurado sobre el ciclo activo del catalogo UAT', async () => {
    const repositories = makeRepositories();
    const ciclosConsultados: number[] = [];

    const uatService = {
      getCiclosEscolaresPorSesion: async () => ({
        source: 'UAT',
        endpoint: 'BuscarCicloEscolar',
        query: {},
        data: [
          { Id_Ciclo_Escolar: 151, Ciclo: '2026-2', Sn_Activo: true },
          { Id_Ciclo_Escolar: 150, Ciclo: '2026-1', Sn_Activo: false },
        ],
        fetchedAt: new Date().toISOString(),
      }),
      getNivelesEducativosPorSesion: async () => ({
        source: 'UAT',
        endpoint: 'BuscarNivelEducativo',
        query: {},
        data: [{ Id_Nivel_Educativo: 1, Txt_Nivel_Educativo: 'Licenciatura' }],
        fetchedAt: new Date().toISOString(),
      }),
      getCampusPorSesion: async () => ({
        source: 'UAT',
        endpoint: 'BuscarCampus',
        query: {},
        data: [{ Id_CU: 1, Txt_CU: 'Tampico' }],
        fetchedAt: new Date().toISOString(),
      }),
      getDesPorSesion: async () => ({
        source: 'UAT',
        endpoint: 'BuscarDES',
        query: {},
        data: [{ Id_DES: 12, Txt_Nombre_Corto: 'FI' }],
        fetchedAt: new Date().toISOString(),
      }),
      getGruposProfesorPorSesion: async (_sessionId: string, params: { Id_Ciclo: number }) => {
        ciclosConsultados.push(params.Id_Ciclo);
        return {
          source: 'UAT',
          endpoint: 'BuscaGruposProfesor',
          query: {},
          data: [{ Id_Grupo: 947699, Txt_Materia: 'Calculo I', Txt_Letra: 'A' }],
          fetchedAt: new Date().toISOString(),
        };
      },
      getHorariosPorSesion: async (_sessionId: string, params: { Id_Ciclo_Escolar: number }) => ({
        source: 'UAT',
        endpoint: 'BuscaHorarios',
        query: {},
        data: [{ Id_Grupo: 947699, Id_Ciclo_Escolar: params.Id_Ciclo_Escolar, Txt_Materia: 'Calculo I' }],
        fetchedAt: new Date().toISOString(),
      }),
    } as unknown as UatService;

    const result = await new HarvestTeacherDataUseCase(
      uatService,
      repositories.teacherRepository,
      repositories.subjectRepository,
      repositories.coordinationRepository,
      repositories.groupAssignmentRepository,
      { preferredCycleId: 150 },
    ).execute(makeEvent());

    expect(result.groupCount).toBe(1);
    expect(ciclosConsultados).toEqual([150]);
    expect(repositories.groups[0]?.schoolCycleExternalId).toBe('150');
    expect(repositories.groups[0]?.schoolCycleName).toBe('2026-1');
  });
});

function makeEvent(): TeacherAuthenticatedEvent {
  return {
    eventId: 'event-1',
    eventName: TEACHER_AUTHENTICATED_EVENT,
    occurredAt: new Date('2026-07-04T00:00:00.000Z'),
    sessionId: 'uat-session-1',
    teacher: {
      externalId: '308127',
      plantillaId: 308127,
      institutionalCode: '308127',
      name: 'Eder Jahir Gonzalez Bravo',
      email: 'ejgonzalez@uat.edu.mx',
    },
  };
}

function makeRepositories() {
  const coordinations: Coordination[] = [];
  const subjects: Subject[] = [];
  const groups: Group[] = [];
  let harvested = false;

  const teacherRepository: ITeacherRepository = {
    upsert: async (teacher: Teacher) => ({ ...teacher, id: 'teacher-1' }),
    markHarvested: async () => {
      harvested = true;
    },
    findAll: async () => ({ items: [], total: 0 }),
    findById: async () => null,
    count: async () => 1,
  };
  const coordinationRepository: ICoordinationRepository = {
    upsert: async (coordination: Coordination) => {
      coordinations.push(coordination);
      return { ...coordination, id: `coordination-${coordinations.length}` };
    },
    findAll: async () => [],
    count: async () => coordinations.length,
  };
  const subjectRepository: ISubjectRepository = {
    upsert: async (subject: Subject) => {
      subjects.push(subject);
      return { ...subject, id: `subject-${subjects.length}` };
    },
    count: async () => subjects.length,
  };
  const groupAssignmentRepository: IGroupAssignmentRepository = {
    upsert: async (group: Group) => {
      groups.push(group);
    },
    findByTeacherId: async () => [],
    count: async () => groups.length,
  };

  return {
    coordinations,
    subjects,
    groups,
    wasHarvested: () => harvested,
    teacherRepository,
    coordinationRepository,
    subjectRepository,
    groupAssignmentRepository,
  };
}
