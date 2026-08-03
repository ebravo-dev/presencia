import { env } from '../core/config/env.js';
import { prisma } from '../core/database/prisma.js';

async function main(): Promise<void> {
    if (!env.ATTENDANCE_SERVICE_URL) {
        throw new Error('ATTENDANCE_SERVICE_URL is required to import legacy beacons.');
    }
    const beacons = await prisma.beacon.findMany({
        select: { uuid: true, classroom: true },
        orderBy: { classroom: 'asc' },
    });
    const response = await fetch(new URL('/internal/v1/attendance/classroom-beacons/import', env.ATTENDANCE_SERVICE_URL), {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'x-internal-service-token': env.INTERNAL_API_TOKEN,
            'x-correlation-id': 'legacy-beacon-import',
        },
        body: JSON.stringify({
            beacons,
            actorIdentityId: 'migration:legacy-beacons',
            actorRole: 'SYSTEM',
            reason: 'Importación idempotente previa al corte de beacons.',
        }),
    });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) {
        throw new Error(`Attendance Service rejected beacon import (${response.status}): ${JSON.stringify(payload)}`);
    }
    process.stdout.write(`${JSON.stringify({ sourceCount: beacons.length, result: payload })}\n`);
}

void main()
    .catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
