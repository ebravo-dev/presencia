import type { Coordination } from '../../domain/entities/coordination.js';
import type { Group } from '../../domain/entities/group.js';
import type { Subject } from '../../domain/entities/subject.js';
import type { AuthenticatedTeacherIdentity } from '../../domain/events/teacher-authenticated.event.js';
import type { JsonRecord, JsonValue, UatDesItem, UatProfesorGrupoItem } from '../../domain/types/uat.interfaces.js';

export interface MappedTeacherGroup {
  coordination: Coordination;
  subject: Subject;
  group: Group;
}

export class UatTeacherDataMapper {
  mapGroup(input: {
    raw: UatProfesorGrupoItem;
    teacher: AuthenticatedTeacherIdentity;
    des: UatDesItem;
    cycleExternalId: string;
    cycleName: string | null;
  }): MappedTeacherGroup {
    const coordinationExternalId = String(input.des.Id_DES);
    const coordinationName = clean(input.des.Txt_DES) ?? `Coordinacion ${coordinationExternalId}`;
    const subjectName = readString(input.raw, ['Txt_Materia', 'Materia', 'txt_materia']) ?? 'Materia sin nombre';
    const sourceSubjectId = readString(input.raw, [
      'Id_Materia',
      'id_materia',
      'Cve_Materia',
      'Clave_Materia',
      'Txt_Clave_Materia',
    ]);
    const subjectExternalId = `${coordinationExternalId}:${sourceSubjectId ?? `nombre:${slug(subjectName)}`}`;
    const externalGroupId = readString(input.raw, ['Id_Grupo', 'id_grupo', 'idGrupo']);

    if (!externalGroupId) {
      throw new Error('El grupo UAT no contiene un Id_Grupo estable.');
    }

    return {
      coordination: {
        externalId: coordinationExternalId,
        name: coordinationName,
        shortName: clean(input.des.Txt_Nombre_Corto),
      },
      subject: {
        externalId: subjectExternalId,
        code: sourceSubjectId,
        name: subjectName,
        coordinationExternalId,
      },
      group: {
        externalGroupId,
        groupCode: readString(input.raw, ['Txt_Letra', 'Grupo', 'txt_letra']),
        schoolCycleExternalId: input.cycleExternalId,
        schoolCycleName: readString(input.raw, ['Ciclo', 'Txt_Ciclo_Escolar']) ?? input.cycleName,
        teacherExternalId: input.teacher.externalId,
        subjectExternalId,
        coordinationExternalId,
        rawPayload: sanitizeRecord(input.raw),
      },
    };
  }
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

function clean(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function slug(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function sanitizeRecord(record: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, JsonValue] => entry[1] !== undefined),
  );
}
