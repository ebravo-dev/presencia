export interface AttendanceUnbindCommand {
    matricula: string;
    actorIdentityId: string;
    actorRole: 'COORDINATOR' | 'SUPER_USER';
    reason: string;
    correlationId: string;
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
        const response = await this.fetcher(
            `${this.baseUrl}/internal/v1/attendance/device-bindings/${encodeURIComponent(command.matricula)}`,
            {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Internal-Service-Token': this.internalToken,
                    'X-Correlation-Id': command.correlationId,
                },
                body: JSON.stringify({
                    actorIdentityId: command.actorIdentityId,
                    actorRole: command.actorRole,
                    reason: command.reason,
                }),
            },
        ).catch((cause: unknown) => {
            throw Object.assign(new Error('Attendance Service no está disponible.'), { statusCode: 502, cause });
        });

        if (response.ok) return;
        const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
        throw Object.assign(
            new Error(typeof payload.message === 'string' ? payload.message : 'Attendance Service rechazó la desvinculación.'),
            { statusCode: response.status, payload },
        );
    }
}
