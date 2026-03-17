import { prisma } from '../../core/database/prisma.js';
import { z } from 'zod';

export const beaconSchema = z.object({
    uuid: z.string().min(1, 'UUID es requerido'),
    classroom: z.string().min(1, 'Salón es requerido'),
});

export const beaconUpdateSchema = beaconSchema.partial();

export async function listBeacons() {
    return prisma.beacon.findMany({
        orderBy: { classroom: 'asc' },
    });
}

export async function createBeacon(data: z.infer<typeof beaconSchema>) {
    return prisma.beacon.create({ data });
}

export async function updateBeacon(id: string, data: z.infer<typeof beaconUpdateSchema>) {
    return prisma.beacon.update({ where: { id }, data });
}

export async function deleteBeacon(id: string) {
    return prisma.beacon.delete({ where: { id } });
}
