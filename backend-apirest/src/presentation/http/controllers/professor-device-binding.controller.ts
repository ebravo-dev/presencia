import type { FastifyRequest } from 'fastify';
import type { AttendanceServiceCommandClient } from '../../../infrastructure/http/client/attendance-service-command.client.js';
import type { DemoPortalClient } from '../../../infrastructure/http/client/demo-portal.client.js';
import { ApiError } from '../../../errors/api-error.js';
import {
  parsePayload,
  professorBeaconResolveSchema,
  professorDeviceBindingCreateSchema,
  professorDeviceBindingResolveSchema,
} from '../schemas/uat.schemas.js';

export class ProfessorDeviceBindingController {
  constructor(
    private readonly attendance: AttendanceServiceCommandClient | undefined,
    private readonly appReview?: DemoPortalClient,
  ) {}

  listBeacons = async (request?: FastifyRequest) => {
    if (request && isAppReview(request)) return this.reviewBeacons();
    if (!this.attendance) {
      throw new ApiError(503, 'ATTENDANCE_SERVICE_REQUIRED', 'Attendance Service no está disponible.');
    }
    return this.attendance.listClassroomBeacons();
  };

  resolve = async (request: FastifyRequest) => {
    if (isAppReview(request)) {
      const body = parsePayload(professorDeviceBindingResolveSchema, request.body);
      const catalog = await this.reviewCatalog();
      const requested = new Set(body.matriculas.map((value) => value.trim().toUpperCase()));
      const data = catalog.students
        .filter((student) => requested.has(student.matricula.trim().toUpperCase()))
        .map((student) => ({
          matricula: student.matricula,
          attendanceUuid: student.attendanceUuid,
          deviceBindingId: null,
          platform: 'ios',
          bindingVersion: 1,
        }));
      const found = new Set(data.map(({ matricula }) => matricula.trim().toUpperCase()));
      return { data, missing: [...requested].filter((matricula) => !found.has(matricula)) };
    }
    if (!this.attendance) {
      throw new ApiError(503, 'ATTENDANCE_SERVICE_REQUIRED', 'Attendance Service no está disponible.');
    }
    const body = parsePayload(professorDeviceBindingResolveSchema, request.body);
    return this.attendance.resolveStudentDeviceBindings({
      professorExternalId: professorExternalId(request), matriculas: body.matriculas,
    });
  };

  bind = async (request: FastifyRequest) => {
    if (isAppReview(request)) {
      const body = parsePayload(professorDeviceBindingCreateSchema, request.body);
      return {
        data: {
          id: `app-review-${body.matricula.trim().toLowerCase()}`,
          matricula: body.matricula.trim().toUpperCase(),
          attendanceUuid: body.attendanceUuid.trim().toLowerCase(),
          deviceBindingId: null,
          platform: 'ios',
          deviceInfo: 'Vínculo efímero de App Review.',
          bindingVersion: 1,
          active: true,
          updatedAt: new Date().toISOString(),
        },
      };
    }
    if (!this.attendance) {
      throw new ApiError(503, 'ATTENDANCE_SERVICE_REQUIRED', 'Attendance Service no está disponible.');
    }
    const body = parsePayload(professorDeviceBindingCreateSchema, request.body);
    const professorId = professorExternalId(request);
    return this.attendance.bindStudentDeviceByProfessor({
      externalGroupId: body.externalGroupId,
      professorExternalId: professorId,
      matricula: body.matricula.trim().toUpperCase(),
      attendanceUuid: body.attendanceUuid.trim().toLowerCase(),
      deviceBindingId: null,
      platform: 'ios',
      deviceInfo: 'Beacon iOS registrado manualmente por el profesor desde su lista de alumnos.',
      actorIdentityId: request.uatSession.identitySession?.identityId ?? `professor:${professorId}`,
      actorRole: 'PROFESSOR',
      reason: 'Alta manual de beacon iOS por el profesor responsable del grupo.',
      correlationId: request.id,
    });
  };

  resolveBeacons = async (request: FastifyRequest) => {
    if (isAppReview(request)) {
      const body = parsePayload(professorBeaconResolveSchema, request.body);
      const requested = new Set(body.classrooms.map(classroomKey));
      const all = (await this.reviewBeacons()).data;
      const data = all.filter((beacon) => requested.has(beacon.classroomKey));
      const found = new Set(data.map(({ classroomKey: key }) => key));
      return { data, missing: [...requested].filter((key) => !found.has(key)) };
    }
    if (!this.attendance) {
      throw new ApiError(503, 'ATTENDANCE_SERVICE_REQUIRED', 'Attendance Service no está disponible.');
    }
    const body = parsePayload(professorBeaconResolveSchema, request.body);
    return this.attendance.resolveClassroomBeacons({
      professorExternalId: professorExternalId(request),
      professorEmail: request.uatSession.username,
      classrooms: body.classrooms,
    });
  };

  private async reviewBeacons() {
    const catalog = await this.reviewCatalog();
    return {
      data: catalog.classes.map((item) => ({
        id: `app-review-beacon-${item.groupId}`,
        uuid: item.beaconUuid,
        classroom: item.classroom,
        classroomKey: classroomKey(item.classroom),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    };
  }

  private async reviewCatalog() {
    if (!this.appReview) {
      throw new ApiError(503, 'APP_REVIEW_SERVICE_REQUIRED', 'El entorno de revisión no está disponible.');
    }
    return (await this.appReview.appReviewCatalog()).data;
  }
}

function isAppReview(request: FastifyRequest): boolean {
  return request.uatSession.source === 'APP_REVIEW';
}

function classroomKey(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ');
}

function professorExternalId(request: FastifyRequest): string {
  return request.uatSession.login.parametros?.Id_Plantilla_AdmonUAT?.toString().trim()
    || request.uatSession.login.parametros?.Cve_Usuario_AdmonUAT?.toString().trim()
    || request.uatSession.username;
}
