import { describe, expect, it } from 'vitest';
import { AttendanceServiceCommandClient } from './attendance-service-command.client.js';

const command = {
    matricula: '2251330007',
    actorIdentityId: 'super-user:dashboard',
    actorRole: 'SUPER_USER' as const,
    reason: 'Cambio autorizado desde el dashboard de coordinación.',
    correlationId: 'request-1',
};

describe('AttendanceServiceCommandClient', () => {
    it('sends an auditable, authenticated unbind command', async () => {
        let receivedUrl: string | URL | Request | undefined;
        let receivedInit: RequestInit | undefined;
        const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
            receivedUrl = input;
            receivedInit = init;
            return new Response(null, { status: 204 });
        };
        const client = new AttendanceServiceCommandClient('http://attendance-service:3400/', 'internal-token', fetcher);

        await client.unbindStudentDevice(command);

        expect(receivedUrl).toBe('http://attendance-service:3400/internal/v1/attendance/device-bindings/2251330007');
        expect(receivedInit).toMatchObject({
            method: 'DELETE',
            headers: {
                'X-Internal-Service-Token': 'internal-token',
                'X-Correlation-Id': 'request-1',
            },
        });
        expect(JSON.parse(String(receivedInit?.body))).toMatchObject({ actorRole: 'SUPER_USER', reason: command.reason });
    });

    it('propagates a rejected command without hiding the cause', async () => {
        const fetcher = async () => new Response(JSON.stringify({ message: 'motivo requerido' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
        const client = new AttendanceServiceCommandClient('http://attendance-service:3400', 'internal-token', fetcher);

        await expect(client.unbindStudentDevice(command)).rejects.toMatchObject({ statusCode: 400, message: 'motivo requerido' });
    });

    it('routes beacon administration to the authoritative service with audit context', async () => {
        let receivedUrl: string | URL | Request | undefined;
        let receivedInit: RequestInit | undefined;
        const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
            receivedUrl = input;
            receivedInit = init;
            return new Response(JSON.stringify({ data: { id: 'beacon-1' } }), {
                status: 201, headers: { 'Content-Type': 'application/json' },
            });
        };
        const client = new AttendanceServiceCommandClient('http://attendance-service:3400', 'internal-token', fetcher);
        await client.createClassroomBeacon({
            uuid: '12345678-1234-4234-9234-123456789abc', classroom: 'AULA 101',
            actorIdentityId: 'super-user:dashboard', actorRole: 'SUPER_USER',
            reason: 'Alta desde super usuario.', correlationId: 'beacon-request-1',
        });

        expect(receivedUrl).toBe('http://attendance-service:3400/internal/v1/attendance/classroom-beacons');
        expect(receivedInit).toMatchObject({ method: 'POST', headers: { 'X-Correlation-Id': 'beacon-request-1' } });
        expect(JSON.parse(String(receivedInit?.body))).toMatchObject({ actorRole: 'SUPER_USER', classroom: 'AULA 101' });
    });

    it('resolves classrooms already authorized by the compatibility facade', async () => {
        let receivedUrl: string | URL | Request | undefined;
        const fetcher = async (input: string | URL | Request) => {
            receivedUrl = input;
            return new Response(JSON.stringify({ data: [], missing: [] }), {
                status: 200, headers: { 'Content-Type': 'application/json' },
            });
        };
        const client = new AttendanceServiceCommandClient('http://attendance-service:3400', 'internal-token', fetcher);
        await client.resolveAuthorizedClassroomBeacons(['AULA SUSTITUCIÓN']);
        expect(receivedUrl).toBe(
            'http://attendance-service:3400/internal/v1/attendance/classroom-beacons/resolve-authorized',
        );
    });

    it('marks legacy presence commands as pre-authorized by the compatibility facade', async () => {
        let receivedUrl: string | URL | Request | undefined;
        let receivedInit: RequestInit | undefined;
        const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
            receivedUrl = input;
            receivedInit = init;
            return new Response(JSON.stringify({ data: { attendanceSessionId: 'session-1' } }), {
                status: 201, headers: { 'Content-Type': 'application/json' },
            });
        };
        const client = new AttendanceServiceCommandClient('http://attendance-service:3400', 'internal-token', fetcher);
        await client.observeStudentPresence({
            professorExternalId: 'legacy:professor-1', externalGroupId: '947699',
            detections: [{ beaconUuid: '12345678-1234-4234-9234-123456789abc' }], correlationId: 'presence-1',
        });

        expect(receivedUrl).toBe('http://attendance-service:3400/internal/v1/attendance/presence/student-detections');
        expect(receivedInit?.headers).toMatchObject({ 'X-Correlation-Id': 'presence-1' });
        expect(JSON.parse(String(receivedInit?.body))).toMatchObject({
            professorExternalId: 'legacy:professor-1', externalGroupId: '947699',
            trustedGroupAuthorization: true,
        });
    });
});
