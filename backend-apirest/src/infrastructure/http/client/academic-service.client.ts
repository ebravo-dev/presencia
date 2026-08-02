import { ApiError } from '../../../errors/api-error.js';
import type {
  AcademicSnapshotPublisher,
  ProfessorAcademicSnapshotInput,
  StudentAcademicSnapshotInput,
  StudentAcademicSnapshotPublisher,
} from '../../../application/ports/academic-snapshot.publisher.js';

export class AcademicServiceClient implements AcademicSnapshotPublisher, StudentAcademicSnapshotPublisher {
  constructor(
    private readonly baseUrl: string | undefined,
    private readonly internalToken: string,
    private readonly required: boolean,
    private readonly timeoutMs = 15_000,
  ) {}

  async publishProfessorSnapshot(snapshot: ProfessorAcademicSnapshotInput): Promise<void> {
    return this.publish('/internal/v1/academic/snapshots/professors', snapshot);
  }

  async publishStudentSnapshot(snapshot: StudentAcademicSnapshotInput): Promise<void> {
    return this.publish('/internal/v1/academic/snapshots/students', snapshot);
  }

  private async publish(
    path: string,
    snapshot: ProfessorAcademicSnapshotInput | StudentAcademicSnapshotInput,
  ): Promise<void> {
    if (!this.baseUrl) {
      if (this.required) throw new ApiError(503, 'ACADEMIC_SERVICE_REQUIRED', 'Academic Service no está configurado.');
      return;
    }
    let response: Response;
    try {
      response = await fetch(new URL(path, this.baseUrl), {
        method: 'POST',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-internal-service-token': this.internalToken,
          'x-correlation-id': snapshot.correlationId,
        },
        body: JSON.stringify(snapshot),
      });
    } catch (error) {
      throw new ApiError(503, 'ACADEMIC_SERVICE_UNAVAILABLE', 'Academic Service no está disponible.', {
        cause: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    if (!response.ok) {
      throw new ApiError(502, 'ACADEMIC_SERVICE_ERROR', `Academic Service respondió ${response.status}.`, {
        status: response.status,
      });
    }
  }
}
