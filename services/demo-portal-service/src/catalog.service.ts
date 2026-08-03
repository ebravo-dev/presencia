import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { DemoPortalEnv } from './config.js';
import {
  createDemoClassSchema, createDemoStudentSchema, createDemoTeacherSchema,
  type CreateDemoClassInput, type CreateDemoStudentInput, type CreateDemoTeacherInput,
  type DemoClass, type DemoPortalState, type DemoStudent, type DemoTeacher,
  type UpdateDemoClassInput, type UpdateDemoStudentInput, type UpdateDemoTeacherInput,
  updateDemoClassSchema, updateDemoStudentSchema, updateDemoTeacherSchema,
} from './model.js';
import type { DemoPortalRepository } from './repository.js';

const scrypt = promisify(scryptCallback);

export class DemoCatalogError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

export class DemoCatalogService {
  private mutation: Promise<unknown> = Promise.resolve();

  constructor(private readonly repository: DemoPortalRepository, private readonly env: DemoPortalEnv) {}

  async initialize(): Promise<void> {
    if (await this.repository.load()) return;
    await this.repository.save(this.env.PRESENCIA_DEMO_SEED ? await this.seededState() : emptyState());
  }

  async snapshot() {
    const state = await this.state();
    return publicState(state);
  }

  async createTeacher(input: CreateDemoTeacherInput) {
    const parsed = createDemoTeacherSchema.parse(input);
    return this.change(async (state) => {
      if (state.teachers.some(({ email }) => email === parsed.email)) throw new DemoCatalogError('DEMO_TEACHER_EXISTS', 'Ya existe un profesor demo con ese correo.');
      const now = new Date().toISOString();
      const teacher: DemoTeacher = {
        id: randomUUID(), externalId: String(state.nextTeacherExternalId++),
        email: parsed.email, name: parsed.name, passwordHash: await hashPassword(parsed.password), createdAt: now, updatedAt: now,
      };
      state.teachers.push(teacher);
      return publicTeacher(teacher);
    });
  }

  async updateTeacher(id: string, input: UpdateDemoTeacherInput) {
    const parsed = updateDemoTeacherSchema.parse(input);
    return this.change(async (state) => {
      const teacher = required(state.teachers.find((item) => item.id === id), 'DEMO_TEACHER_NOT_FOUND', 'Profesor demo no encontrado.');
      if (parsed.email && state.teachers.some((item) => item.id !== id && item.email === parsed.email)) throw new DemoCatalogError('DEMO_TEACHER_EXISTS', 'Ya existe un profesor demo con ese correo.');
      if (parsed.email) teacher.email = parsed.email;
      if (parsed.name) teacher.name = parsed.name;
      if (parsed.password) teacher.passwordHash = await hashPassword(parsed.password);
      teacher.updatedAt = new Date().toISOString();
      return publicTeacher(teacher);
    });
  }

  async deleteTeacher(id: string) {
    return this.change(async (state) => {
      if (state.classes.some(({ professorId }) => professorId === id)) throw new DemoCatalogError('DEMO_TEACHER_IN_USE', 'El profesor demo todavía tiene materias.');
      const index = state.teachers.findIndex((item) => item.id === id);
      if (index < 0) throw new DemoCatalogError('DEMO_TEACHER_NOT_FOUND', 'Profesor demo no encontrado.');
      state.teachers.splice(index, 1);
    });
  }

  async createStudent(input: CreateDemoStudentInput) {
    const parsed = createDemoStudentSchema.parse(input);
    return this.change(async (state) => {
      assertStudentAvailable(state, parsed.matricula, parsed.email);
      const now = new Date().toISOString();
      const student: DemoStudent = {
        id: randomUUID(), uatStudentId: state.nextStudentUatId++, matricula: parsed.matricula,
        email: parsed.email, name: parsed.name, passwordHash: await hashPassword(parsed.password),
        attendanceUuid: parsed.attendanceUuid ?? stableUuid(`student:${parsed.matricula}`),
        careerName: parsed.careerName, createdAt: now, updatedAt: now,
      };
      state.students.push(student);
      return publicStudent(student);
    });
  }

  async updateStudent(id: string, input: UpdateDemoStudentInput) {
    const parsed = updateDemoStudentSchema.parse(input);
    return this.change(async (state) => {
      const student = required(state.students.find((item) => item.id === id), 'DEMO_STUDENT_NOT_FOUND', 'Alumno demo no encontrado.');
      if (parsed.matricula || parsed.email) assertStudentAvailable(state, parsed.matricula ?? student.matricula, parsed.email ?? student.email, id);
      if (parsed.matricula) student.matricula = parsed.matricula;
      if (parsed.email) student.email = parsed.email;
      if (parsed.name) student.name = parsed.name;
      if (parsed.password) student.passwordHash = await hashPassword(parsed.password);
      if (parsed.attendanceUuid) student.attendanceUuid = parsed.attendanceUuid;
      if (parsed.careerName) student.careerName = parsed.careerName;
      student.updatedAt = new Date().toISOString();
      return publicStudent(student);
    });
  }

  async deleteStudent(id: string) {
    return this.change(async (state) => {
      const index = state.students.findIndex((item) => item.id === id);
      if (index < 0) throw new DemoCatalogError('DEMO_STUDENT_NOT_FOUND', 'Alumno demo no encontrado.');
      state.students.splice(index, 1);
      for (const item of state.classes) item.studentIds = item.studentIds.filter((studentId) => studentId !== id);
    });
  }

  async createClass(input: CreateDemoClassInput) {
    const parsed = createDemoClassSchema.parse(input);
    return this.change(async (state) => {
      let teacher = parsed.professorId ? state.teachers.find(({ id }) => id === parsed.professorId) : undefined;
      if (!teacher && parsed.professorEmail) teacher = state.teachers.find(({ email }) => email === parsed.professorEmail);
      if (!teacher && parsed.professorEmail) {
        const now = new Date().toISOString();
        teacher = {
          id: randomUUID(), externalId: String(state.nextTeacherExternalId++), email: parsed.professorEmail,
          name: parsed.professorName ?? parsed.professorEmail.split('@')[0]!,
          passwordHash: await hashPassword(this.env.PRESENCIA_DEMO_DEFAULT_PASSWORD), createdAt: now, updatedAt: now,
        };
        state.teachers.push(teacher);
      }
      teacher = required(teacher, 'DEMO_TEACHER_NOT_FOUND', 'Profesor demo no encontrado.');
      if (state.classes.some((item) => item.professorId === teacher!.id && item.code === parsed.code && item.groupLetter === parsed.groupLetter)) {
        throw new DemoCatalogError('DEMO_CLASS_EXISTS', 'La materia demo ya existe para ese profesor y grupo.');
      }
      for (const studentId of parsed.studentIds) required(state.students.find(({ id }) => id === studentId), 'DEMO_STUDENT_NOT_FOUND', 'Alumno demo no encontrado.');
      assertBeaconAssignmentAvailable(state, parsed.classroom, parsed.beaconUuid);
      const now = new Date().toISOString();
      const item: DemoClass = {
        id: randomUUID(), groupId: state.nextGroupId++, professorId: teacher.id,
        code: parsed.code, groupLetter: parsed.groupLetter, name: parsed.name, level: parsed.level,
        classroom: parsed.classroom, period: parsed.period, beaconUuid: parsed.beaconUuid,
        schedule: parsed.schedule, studentIds: [...new Set(parsed.studentIds)], createdAt: now, updatedAt: now,
      };
      state.classes.push(item);
      return publicClass(item, state);
    });
  }

  async updateClass(id: string, input: UpdateDemoClassInput) {
    const parsed = updateDemoClassSchema.parse(input);
    return this.change(async (state) => {
      const item = required(state.classes.find((candidate) => candidate.id === id), 'DEMO_CLASS_NOT_FOUND', 'Materia demo no encontrada.');
      if (parsed.studentIds) for (const studentId of parsed.studentIds) required(state.students.find((student) => student.id === studentId), 'DEMO_STUDENT_NOT_FOUND', 'Alumno demo no encontrado.');
      assertBeaconAssignmentAvailable(state, parsed.classroom ?? item.classroom, parsed.beaconUuid ?? item.beaconUuid, item.id);
      Object.assign(item, parsed, { ...(parsed.studentIds ? { studentIds: [...new Set(parsed.studentIds)] } : {}), updatedAt: new Date().toISOString() });
      return publicClass(item, state);
    });
  }

  async deleteClass(id: string) {
    return this.change(async (state) => {
      const index = state.classes.findIndex((item) => item.id === id);
      if (index < 0) throw new DemoCatalogError('DEMO_CLASS_NOT_FOUND', 'Materia demo no encontrada.');
      state.classes.splice(index, 1);
    });
  }

  async addStudentToClass(classId: string, studentId: string) {
    return this.change(async (state) => {
      const item = required(state.classes.find(({ id }) => id === classId), 'DEMO_CLASS_NOT_FOUND', 'Materia demo no encontrada.');
      required(state.students.find(({ id }) => id === studentId), 'DEMO_STUDENT_NOT_FOUND', 'Alumno demo no encontrado.');
      item.studentIds = [...new Set([...item.studentIds, studentId])];
      item.updatedAt = new Date().toISOString();
      return publicClass(item, state);
    });
  }

  async removeStudentFromClass(classId: string, studentId: string) {
    return this.change(async (state) => {
      const item = required(state.classes.find(({ id }) => id === classId), 'DEMO_CLASS_NOT_FOUND', 'Materia demo no encontrada.');
      item.studentIds = item.studentIds.filter((id) => id !== studentId);
      item.updatedAt = new Date().toISOString();
      return publicClass(item, state);
    });
  }

  async updateSettings(input: { teacherAttendanceToleranceMinutes: number }) {
    return this.change(async (state) => {
      state.settings = { ...input };
      return state.settings;
    });
  }

  async authenticateTeacher(username: string, password: string) {
    const teacher = (await this.state()).teachers.find(({ email }) => email === username.trim().toLowerCase());
    return teacher && await verifyPassword(password, teacher.passwordHash) ? publicTeacher(teacher) : null;
  }

  async authenticateStudent(username: string, password: string) {
    const normalized = username.trim().toLowerCase();
    const student = (await this.state()).students.find(({ email, matricula }) => email === normalized || matricula.toLowerCase() === normalized);
    return student && await verifyPassword(password, student.passwordHash) ? publicStudent(student) : null;
  }

  async teacherById(id: string) { return (await this.state()).teachers.find((item) => item.id === id) ?? null; }
  async studentById(id: string) { return (await this.state()).students.find((item) => item.id === id) ?? null; }
  async classesForTeacher(id: string) { const state = await this.state(); return state.classes.filter(({ professorId }) => professorId === id).map((item) => publicClass(item, state)); }
  async classesForStudent(id: string) { const state = await this.state(); return state.classes.filter(({ studentIds }) => studentIds.includes(id)).map((item) => publicClass(item, state)); }
  async classByGroupId(groupId: number) { const state = await this.state(); const item = state.classes.find((candidate) => candidate.groupId === groupId); return item ? publicClass(item, state) : null; }

  async recordAttendance(input: { groupId: number; weekStart: string; attendances: Array<{ id_alumno: number; num_dia: number; sn_asistencia: boolean }> }) {
    return this.change(async (state) => {
      required(state.classes.find(({ groupId }) => groupId === input.groupId), 'DEMO_CLASS_NOT_FOUND', 'Materia demo no encontrada.');
      const duplicate = state.attendanceWrites.find((item) => item.groupId === input.groupId
        && item.weekStart === input.weekStart && JSON.stringify(item.attendances) === JSON.stringify(input.attendances));
      if (duplicate) return duplicate;
      const item = { id: randomUUID(), ...input, createdAt: new Date().toISOString() };
      state.attendanceWrites.push(item);
      return item;
    });
  }

  async simulateAttendance(classId: string, input: {
    date: string;
    entries: Array<{ studentId: string; status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' }>;
  }) {
    return this.change(async (state) => {
      const item = required(state.classes.find(({ id }) => id === classId), 'DEMO_CLASS_NOT_FOUND', 'Materia demo no encontrada.');
      const students = new Map(state.students.map((student) => [student.id, student]));
      const seen = new Set<string>();
      const attendances = input.entries.map((entry) => {
        if (seen.has(entry.studentId)) throw new DemoCatalogError('DEMO_ATTENDANCE_DUPLICATE_STUDENT', 'Un alumno demo sólo puede aparecer una vez en la simulación.');
        seen.add(entry.studentId);
        if (!item.studentIds.includes(entry.studentId)) throw new DemoCatalogError('DEMO_STUDENT_NOT_IN_CLASS', 'El alumno demo no pertenece a la materia.');
        const student = required(students.get(entry.studentId), 'DEMO_STUDENT_NOT_FOUND', 'Alumno demo no encontrado.');
        return {
          id_alumno: student.uatStudentId,
          num_dia: 1,
          sn_asistencia: entry.status === 'PRESENT' || entry.status === 'LATE',
          status: entry.status,
        };
      });
      const write = {
        id: randomUUID(), groupId: item.groupId, weekStart: input.date,
        attendances, createdAt: new Date().toISOString(),
      };
      state.attendanceWrites.push(write);
      return write;
    });
  }

  private async seededState(): Promise<DemoPortalState> {
    const state = emptyState();
    const now = new Date().toISOString();
    const teacher: DemoTeacher = {
      id: randomUUID(), externalId: String(state.nextTeacherExternalId++), email: 'profesor.demo@uat.edu.mx',
      name: 'Profesor Demo', passwordHash: await hashPassword(this.env.PRESENCIA_DEMO_DEFAULT_PASSWORD), createdAt: now, updatedAt: now,
    };
    const student: DemoStudent = {
      id: randomUUID(), uatStudentId: state.nextStudentUatId++, matricula: 'DEMO0001',
      email: 'alumno.demo@alumnos.uat.edu.mx', name: 'Alumno Demo',
      passwordHash: await hashPassword(this.env.PRESENCIA_DEMO_DEFAULT_PASSWORD),
      attendanceUuid: stableUuid('student:DEMO0001'), careerName: 'Ingeniería Demo', createdAt: now, updatedAt: now,
    };
    state.teachers.push(teacher);
    state.students.push(student);
    state.classes.push({
      id: randomUUID(), groupId: state.nextGroupId++, professorId: teacher.id, code: 'DEMO-101', groupLetter: 'A',
      name: 'Materia de demostración', level: 'DEBUG', classroom: 'DEMO-101', period: this.env.PRESENCIA_DEMO_CYCLE_NAME,
      beaconUuid: stableUuid('classroom:DEMO-101'), schedule: { monday: [{ startTime: '08:00', endTime: '10:00' }] },
      studentIds: [student.id], createdAt: now, updatedAt: now,
    });
    return state;
  }

  private async state(): Promise<DemoPortalState> {
    return required(await this.repository.load(), 'DEMO_STATE_NOT_INITIALIZED', 'El catálogo demo no está inicializado.');
  }

  private change<T>(operation: (state: DemoPortalState) => Promise<T>): Promise<T> {
    const current = this.mutation.then(async () => {
      const state = await this.state();
      const result = await operation(state);
      state.updatedAt = new Date().toISOString();
      await this.repository.save(state);
      return result;
    });
    this.mutation = current.catch(() => undefined);
    return current;
  }
}

function emptyState(): DemoPortalState {
  return {
    version: 1, nextTeacherExternalId: 90_000, nextStudentUatId: 500_000, nextGroupId: 990_000,
    settings: { teacherAttendanceToleranceMinutes: 10 }, teachers: [], students: [], classes: [], attendanceWrites: [],
    updatedAt: new Date().toISOString(),
  };
}

function publicState(state: DemoPortalState) {
  return {
    enabled: true, settings: state.settings,
    teachers: state.teachers.map(publicTeacher), students: state.students.map(publicStudent),
    classes: state.classes.map((item) => publicClass(item, state)), attendanceWrites: state.attendanceWrites,
    updatedAt: state.updatedAt,
  };
}

function publicTeacher({ passwordHash: _, ...teacher }: DemoTeacher) { return teacher; }
function publicStudent({ passwordHash: _, ...student }: DemoStudent) { return student; }
function publicClass(item: DemoClass, state: DemoPortalState) {
  return {
    ...item,
    professor: state.teachers.find(({ id }) => id === item.professorId) ? publicTeacher(state.teachers.find(({ id }) => id === item.professorId)!) : null,
    students: state.students.filter(({ id }) => item.studentIds.includes(id)).map(publicStudent),
  };
}

function assertStudentAvailable(state: DemoPortalState, matricula: string, email: string, exceptId?: string) {
  if (state.students.some((item) => item.id !== exceptId && (item.matricula === matricula || item.email === email))) {
    throw new DemoCatalogError('DEMO_STUDENT_EXISTS', 'Ya existe un alumno demo con esa matrícula o correo.');
  }
}

function assertBeaconAssignmentAvailable(state: DemoPortalState, classroom: string, uuid: string, exceptClassId?: string) {
  const classroomKey = classroom.trim().toUpperCase();
  const uuidKey = uuid.toLowerCase();
  const conflict = state.classes.find((item) => item.id !== exceptClassId && (
    (item.classroom.trim().toUpperCase() === classroomKey && item.beaconUuid.toLowerCase() !== uuidKey)
    || (item.beaconUuid.toLowerCase() === uuidKey && item.classroom.trim().toUpperCase() !== classroomKey)
  ));
  if (conflict) {
    throw new DemoCatalogError(
      'DEMO_BEACON_ASSIGNMENT_CONFLICT',
      'Cada salón demo debe usar un único beacon UUID y cada UUID debe pertenecer a un solo salón.',
    );
  }
}

function required<T>(value: T | null | undefined, code: string, message: string): T {
  if (value === null || value === undefined) throw new DemoCatalogError(code, message);
  return value;
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt.toString('base64url')}:${derived.toString('base64url')}`;
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, saltValue, hashValue] = encoded.split(':');
  if (algorithm !== 'scrypt' || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, 'base64url');
  const actual = await scrypt(password, Buffer.from(saltValue, 'base64url'), expected.length) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function stableUuid(value: string): string {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
