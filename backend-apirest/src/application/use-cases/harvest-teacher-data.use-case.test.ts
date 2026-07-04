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
    const coordinations: Coordination[] = [];
    const subjects: Subject[] = [];
    const groups: Group[] = [];
    let harvested = false;

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

    const result = await new HarvestTeacherDataUseCase(
      uatService,
      teacherRepository,
      subjectRepository,
      coordinationRepository,
      groupAssignmentRepository,
    ).execute(makeEvent());

    expect(result).toMatchObject({ coordinationCount: 1, groupCount: 1, skipped: false });
    expect(harvested).toBe(true);
    expect(coordinations[0]).toMatchObject({ externalId: '12', name: 'FI', shortName: 'FI' });
    expect(subjects[0]).toMatchObject({ name: 'Calculo I', coordinationExternalId: '12' });
    expect(groups[0]).toMatchObject({
      externalGroupId: '947699',
      groupCode: 'A',
      classroom: 'A1',
      educationLevel: 'Licenciatura',
      coordinationExternalId: '12',
    });
    expect(groups[0]?.schedule.monday[0]).toEqual({ raw: '7:00 - 8:00', startTime: '07:00', endTime: '08:00' });
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
