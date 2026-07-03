import { prisma } from '../../core/database/prisma.js';
import { z } from 'zod';

export const beaconSchema = z.object({
    uuid: z.string().uuid('UUID inválido').transform((value) => value.trim().toLowerCase()),
    classroom: z.string().min(1, 'Salón es requerido').transform((value) => value.trim().toUpperCase()),
});

export const beaconUpdateSchema = beaconSchema.partial();

export const beaconResolveSchema = z.object({
    classrooms: z.array(
        z.string().min(1).transform((value) => value.trim().toUpperCase())
    ).min(1, 'Debes enviar al menos un salón'),
});

export type BeaconInput = z.infer<typeof beaconSchema>;
export type BeaconUpdateInput = z.infer<typeof beaconUpdateSchema>;
export type BeaconResolveInput = z.infer<typeof beaconResolveSchema>;

export async function listBeacons() {
    return prisma.beacon.findMany({
        orderBy: { classroom: 'asc' },
    });
}

export async function createBeacon(data: BeaconInput) {
    return prisma.beacon.create({ data });
}

export async function updateBeacon(id: string, data: BeaconUpdateInput) {
    return prisma.beacon.update({ where: { id }, data });
}

export async function deleteBeacon(id: string) {
    return prisma.beacon.delete({ where: { id } });
}

export async function findBeaconByClassroom(classroom: string, excludeId?: string) {
    return prisma.beacon.findFirst({
        where: {
            classroom: classroom.trim().toUpperCase(),
            ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
    });
}

export async function resolveBeaconsByClassrooms(classrooms: string[]) {
    const normalizedClassrooms = Array.from(
        new Set(classrooms.map((classroom) => classroom.trim().toUpperCase()).filter(Boolean))
    );

    return prisma.beacon.findMany({
        where: {
            classroom: { in: normalizedClassrooms },
        },
        orderBy: { classroom: 'asc' },
    });
}
