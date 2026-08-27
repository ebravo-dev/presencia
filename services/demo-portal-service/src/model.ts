import { z } from 'zod';

export const scheduleSlotSchema = z.object({
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
}).refine(({ startTime, endTime }) => endTime > startTime, { message: 'endTime must be after startTime' });

const scheduleSlots = z.array(scheduleSlotSchema).max(8).optional();
export const demoScheduleSchema = z.object({
  monday: scheduleSlots,
  tuesday: scheduleSlots,
  wednesday: scheduleSlots,
  thursday: scheduleSlots,
  friday: scheduleSlots,
  saturday: scheduleSlots,
  sunday: scheduleSlots,
}).default({});

export const createDemoTeacherSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  name: z.string().trim().min(1).max(240),
  password: z.string().min(8).max(128),
});

export const updateDemoTeacherSchema = createDemoTeacherSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one teacher field is required' },
);

export const createDemoStudentSchema = z.object({
  matricula: z.string().trim().min(1).max(40).transform((value) => value.toUpperCase()),
  email: z.email().transform((value) => value.trim().toLowerCase()),
  name: z.string().trim().min(1).max(240),
  password: z.string().min(8).max(128),
  attendanceUuid: z.uuid().optional(),
  careerName: z.string().trim().min(1).max(240).default('Ingeniería Demo'),
});

export const updateDemoStudentSchema = createDemoStudentSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one student field is required' },
);

const demoClassSchemaBase = z.object({
  professorId: z.string().uuid().optional(),
  professorEmail: z.email().transform((value) => value.trim().toLowerCase()).optional(),
  professorName: z.string().trim().min(1).max(240).optional(),
  code: z.string().trim().min(1).max(80),
  groupLetter: z.string().trim().max(40).default('DBG'),
  name: z.string().trim().min(1).max(240),
  level: z.string().trim().min(1).max(160).default('DEBUG'),
  classroom: z.string().trim().min(1).max(160),
  period: z.string().trim().min(1).max(80),
  beaconUuid: z.uuid(),
  schedule: demoScheduleSchema,
  studentIds: z.array(z.string().uuid()).max(1_000).default([]),
});

export const createDemoClassSchema = demoClassSchemaBase.refine((value) => Boolean(value.professorId || value.professorEmail), {
  message: 'professorId or professorEmail is required',
});

export const updateDemoClassSchema = demoClassSchemaBase.omit({ professorId: true, professorEmail: true, professorName: true }).partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one class field is required' },
);

export const classStudentSchema = z.object({ studentId: z.string().uuid() });

export const registeredStudentMembershipSchema = z.object({
  matricula: z.string().trim().min(1).max(40).transform((value) => value.toUpperCase()),
  email: z.email().nullable().optional(),
  name: z.string().trim().min(1).max(240),
}).strict();

export const simulateAttendanceSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entries: z.array(z.object({
    studentId: z.string().uuid(),
    status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
  })).min(1).max(1_000),
});

export const updateDemoSettingsSchema = z.object({
  teacherAttendanceToleranceMinutes: z.number().int().min(0).max(120),
});

export interface DemoTeacher {
  id: string;
  externalId: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface DemoStudent {
  id: string;
  uatStudentId: number;
  matricula: string;
  email: string;
  name: string;
  passwordHash: string;
  attendanceUuid: string;
  careerName: string;
  origin?: 'DEMO' | 'REGISTERED';
  createdAt: string;
  updatedAt: string;
}

export type DemoSchedule = z.infer<typeof demoScheduleSchema>;

export interface DemoClass {
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
  schedule: DemoSchedule;
  studentIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DemoAttendanceWrite {
  id: string;
  groupId: number;
  weekStart: string;
  attendances: Array<{
    id_alumno: number;
    num_dia: number;
    sn_asistencia: boolean;
    status?: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
  }>;
  createdAt: string;
}

export interface DemoPortalState {
  version: 1;
  nextTeacherExternalId: number;
  nextStudentUatId: number;
  nextGroupId: number;
  settings: { teacherAttendanceToleranceMinutes: number };
  teachers: DemoTeacher[];
  students: DemoStudent[];
  classes: DemoClass[];
  attendanceWrites: DemoAttendanceWrite[];
  updatedAt: string;
}

export type CreateDemoTeacherInput = z.input<typeof createDemoTeacherSchema>;
export type UpdateDemoTeacherInput = z.input<typeof updateDemoTeacherSchema>;
export type CreateDemoStudentInput = z.input<typeof createDemoStudentSchema>;
export type UpdateDemoStudentInput = z.input<typeof updateDemoStudentSchema>;
export type CreateDemoClassInput = z.input<typeof createDemoClassSchema>;
export type UpdateDemoClassInput = z.input<typeof updateDemoClassSchema>;
export type RegisteredStudentMembershipInput = z.input<typeof registeredStudentMembershipSchema>;
