export interface AttendanceUnbindCommand {
    matricula: string;
    actorIdentityId: string;
    actorRole: 'COORDINATOR' | 'SUPER_USER';
    reason: string;
    correlationId: string;
}

export interface BeaconCommandActor {
    actorIdentityId: string;
    actorRole: 'COORDINATOR' | 'SUPER_USER';
    reason: string;
    correlationId: string;
}

export interface ClassroomBeaconResponse {
    id: string;
    uuid: string;
    classroom: string;
    classroomKey: string;
    createdAt: string;
    updatedAt: string;
}

type FetchPort = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class AttendanceServiceCommandClient {
    private readonly baseUrl: string;

    constructor(
        baseUrl: string,
        private readonly internalToken: string,
        private readonly fetcher: FetchPort = globalThis.fetch,
    ) {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
    }

    async unbindStudentDevice(command: AttendanceUnbindCommand): Promise<void> {
        await this.request(`/internal/v1/attendance/device-bindings/${encodeURIComponent(command.matricula)}`, {
            method: 'DELETE', correlationId: command.correlationId,
            body: actorBody(command),
        });
    }

    listClassroomBeacons(): Promise<{ data: ClassroomBeaconResponse[] }> {
        return this.request('/internal/v1/attendance/classroom-beacons', { method: 'GET' });
    }

    createClassroomBeacon(input: { uuid: string; classroom: string } & BeaconCommandActor): Promise<{ data: ClassroomBeaconResponse }> {
        return this.request('/internal/v1/attendance/classroom-beacons', {
            method: 'POST', correlationId: input.correlationId,
            body: { uuid: input.uuid, classroom: input.classroom, ...actorBody(input) },
        });
    }

    updateClassroomBeacon(id: string, input: Partial<{ uuid: string; classroom: string }> & BeaconCommandActor): Promise<{ data: ClassroomBeaconResponse }> {
        return this.request(`/internal/v1/attendance/classroom-beacons/${encodeURIComponent(id)}`, {
            method: 'PUT', correlationId: input.correlationId,
            body: {
                ...(input.uuid === undefined ? {} : { uuid: input.uuid }),
                ...(input.classroom === undefined ? {} : { classroom: input.classroom }),
                ...actorBody(input),
            },
        });
    }

    async deleteClassroomBeacon(id: string, actor: BeaconCommandActor): Promise<void> {
        await this.request(`/internal/v1/attendance/classroom-beacons/${encodeURIComponent(id)}`, {
            method: 'DELETE', correlationId: actor.correlationId, body: actorBody(actor),
        });
    }

    resolveClassroomBeacons(input: { professorEmail: string; classrooms: string[] }): Promise<{
        data: ClassroomBeaconResponse[];
        missing: string[];
    }> {
        return this.request('/internal/v1/attendance/classroom-beacons/resolve', {
            method: 'POST', body: input,
        });
    }

    resolveAuthorizedClassroomBeacons(classrooms: string[]): Promise<{
        data: ClassroomBeaconResponse[];
        missing: string[];
    }> {
        return this.request('/internal/v1/attendance/classroom-beacons/resolve-authorized', {
            method: 'POST', body: { classrooms },
        });
    }

    private async request<T = unknown>(
        path: string,
        options: { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; correlationId?: string },
    ): Promise<T> {
        const response = await this.fetcher(`${this.baseUrl}${path}`, {
            method: options.method,
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Service-Token': this.internalToken,
                ...(options.correlationId ? { 'X-Correlation-Id': options.correlationId } : {}),
            },
            ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        }).catch((cause: unknown) => {
            throw Object.assign(new Error('Attendance Service no está disponible.'), { statusCode: 502, cause });
        });

        if (response.ok) return (response.status === 204 ? undefined : await response.json()) as T;
        const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
        throw Object.assign(
            new Error(typeof payload.message === 'string' ? payload.message : 'Attendance Service rechazó la operación.'),
            { statusCode: response.status, code: payload.error, payload },
        );
    }
}

function actorBody(input: BeaconCommandActor | AttendanceUnbindCommand) {
    return { actorIdentityId: input.actorIdentityId, actorRole: input.actorRole, reason: input.reason };
}
