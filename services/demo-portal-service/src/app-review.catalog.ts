import { createHash, timingSafeEqual } from 'node:crypto';
import type { DemoPortalEnv } from './config.js';

export interface AppReviewTeacher {
  id: string;
  externalId: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppReviewStudent {
  id: string;
  uatStudentId: number;
  matricula: string;
  email: string;
  name: string;
  attendanceUuid: string;
  careerName: string;
  origin: 'APP_REVIEW';
  createdAt: string;
  updatedAt: string;
}

export interface AppReviewClass {
  id: string;
  groupId: number;
  professorId: string;
  code: string;
  groupLetter: string;
  name: string;
  level: string;
  classroom: string;
  period: string;
  beaconUuid: string;
  schedule: Record<string, Array<{ startTime: string; endTime: string }>>;
  studentIds: string[];
  professor: AppReviewTeacher;
  students: AppReviewStudent[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Fixed, non-persistent identities used only by App Review. They deliberately
 * live outside DemoCatalogService so its dashboard/catalog can never list
 * them and no review activity survives a process restart.
 */
export class AppReviewCatalog {
  private readonly teacher: AppReviewTeacher;
  private readonly student: AppReviewStudent;
  private readonly reviewClass: AppReviewClass;

  constructor(private readonly env: DemoPortalEnv) {
    const timestamp = '2026-01-01T00:00:00.000Z';
    this.teacher = {
      id: 'app-review-teacher',
      externalId: '999900',
      email: env.PRESENCIA_APP_REVIEW_TEACHER_USERNAME,
      name: 'Profesor de Revisión',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.student = {
      id: 'app-review-student',
      uatStudentId: 999902,
      matricula: 'APPREVIEW01',
      email: env.PRESENCIA_APP_REVIEW_STUDENT_USERNAME,
      name: 'Alumno de Revisión',
      attendanceUuid: '00000000-0000-4000-8000-000000000903',
      careerName: 'Ingeniería de Demostración',
      origin: 'APP_REVIEW',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.reviewClass = {
      id: '00000000-0000-4000-8000-000000000901',
      groupId: 999901,
      professorId: this.teacher.id,
      code: 'REVIEW-101',
      groupLetter: 'A',
      name: 'Materia de demostración',
      level: 'APP_REVIEW',
      classroom: 'REVIEW-101',
      period: env.PRESENCIA_DEMO_CYCLE_NAME,
      beaconUuid: '00000000-0000-4000-8000-000000000902',
      schedule: everyDaySchedule(),
      studentIds: [this.student.id],
      professor: this.teacher,
      students: [this.student],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  get enabled(): boolean { return this.env.PRESENCIA_APP_REVIEW_ENABLED; }

  async authenticateTeacher(username: string, password: string): Promise<AppReviewTeacher | null> {
    return this.enabled
      && normalize(username) === this.teacher.email
      && secretEquals(password, this.env.PRESENCIA_APP_REVIEW_TEACHER_PASSWORD)
      ? this.teacher
      : null;
  }

  async authenticateStudent(username: string, password: string): Promise<AppReviewStudent | null> {
    const identity = normalize(username);
    return this.enabled
      && identity === this.student.email
      && secretEquals(password, this.env.PRESENCIA_APP_REVIEW_STUDENT_PASSWORD)
      ? this.student
      : null;
  }

  teacherById(id: string): AppReviewTeacher | null {
    return this.enabled && id === this.teacher.id ? this.teacher : null;
  }

  studentById(id: string): AppReviewStudent | null {
    return this.enabled && id === this.student.id ? this.student : null;
  }

  classesForTeacher(id: string): AppReviewClass[] {
    return this.teacherById(id) ? [this.reviewClass] : [];
  }

  classesForStudent(id: string): AppReviewClass[] {
    return this.studentById(id) ? [this.reviewClass] : [];
  }

  classByGroupId(groupId: number): AppReviewClass | null {
    return this.enabled && groupId === this.reviewClass.groupId ? this.reviewClass : null;
  }

  snapshot() {
    return {
      enabled: this.enabled,
      settings: { teacherAttendanceToleranceMinutes: 10 },
      teachers: this.enabled ? [this.teacher] : [],
      students: this.enabled ? [this.student] : [],
      classes: this.enabled ? [this.reviewClass] : [],
      attendanceWrites: [],
      updatedAt: this.reviewClass.updatedAt,
    };
  }
}

function normalize(value: string): string { return value.trim().toLowerCase(); }

function secretEquals(left: string, right: string): boolean {
  const leftHash = createHash('sha256').update(left).digest();
  const rightHash = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function everyDaySchedule(): Record<string, Array<{ startTime: string; endTime: string }>> {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  return Object.fromEntries(days.map((day) => [day, [{ startTime: '00:00', endTime: '23:59' }]]));
}
