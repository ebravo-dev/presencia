import { ApiError } from '../../errors/api-error.js';
import type { ICoordinationRepository } from '../../domain/repositories/coordination.repository.js';
import type { IGroupAssignmentRepository } from '../../domain/repositories/group-assignment.repository.js';
import type { ISubjectRepository } from '../../domain/repositories/subject.repository.js';
import type { ITeacherRepository, TeacherQuery } from '../../domain/repositories/teacher.repository.js';

export class CoordinationService {
  constructor(
    private readonly teacherRepository: ITeacherRepository,
    private readonly subjectRepository: ISubjectRepository,
    private readonly coordinationRepository: ICoordinationRepository,
    private readonly groupAssignmentRepository: IGroupAssignmentRepository,
  ) {}

  async getOverview() {
    const [teachers, subjects, coordinations, assignments, coordinationItems] = await Promise.all([
      this.teacherRepository.count(),
      this.subjectRepository.count(),
      this.coordinationRepository.count(),
      this.groupAssignmentRepository.count(),
      this.coordinationRepository.findAll(),
    ]);

    return {
      data: {
        counts: { teachers, subjects, coordinations, assignments },
        coordinations: coordinationItems,
      },
      meta: { generatedAt: new Date().toISOString() },
    };
  }

  async listCoordinations() {
    return {
      data: await this.coordinationRepository.findAll(),
      meta: { generatedAt: new Date().toISOString() },
    };
  }

  async listTeachers(query: TeacherQuery) {
    const result = await this.teacherRepository.findAll(query);
    return {
      data: result.items,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
      },
    };
  }

  async getTeacherAssignments(teacherId: string) {
    const teacher = await this.teacherRepository.findById(teacherId);
    if (!teacher) {
      throw new ApiError(404, 'TEACHER_NOT_FOUND', `No existe el profesor ${teacherId}.`);
    }

    return {
      data: {
        teacher,
        assignments: await this.groupAssignmentRepository.findByTeacherId(teacherId),
      },
      meta: { generatedAt: new Date().toISOString() },
    };
  }
}
