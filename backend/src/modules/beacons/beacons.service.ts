import { prisma } from '../../core/database/prisma.js';
import { z } from 'zod';

export function normalizeClassroomDisplay(value: string) {
    return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function normalizeClassroomKey(value: string) {
    return normalizeClassroomDisplay(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9]/g, '');
}

export function serializeBeacon<T extends { classroom: string }>(beacon: T) {
    return {
        ...beacon,
        classroomKey: normalizeClassroomKey(beacon.classroom),
    };
}

export const beaconSchema = z.object({
    uuid: z.string().uuid('UUID inválido').transform((value) => value.trim().toLowerCase()),
    classroom: z.string().min(1, 'Salón es requerido').transform(normalizeClassroomDisplay),
});

export const beaconUpdateSchema = beaconSchema.partial();

export const beaconResolveSchema = z.object({
    classrooms: z.array(
        z.string().min(1).transform(normalizeClassroomDisplay)
    ).min(1, 'Debes enviar al menos un salón'),
});

export type BeaconInput = z.infer<typeof beaconSchema>;
export type BeaconUpdateInput = z.infer<typeof beaconUpdateSchema>;
export type BeaconResolveInput = z.infer<typeof beaconResolveSchema>;

export async function listBeacons() {
    const beacons = await prisma.beacon.findMany({
        orderBy: { classroom: 'asc' },
    });
    return beacons.map(serializeBeacon);
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
    const classroomKey = normalizeClassroomKey(classroom);
    if (!classroomKey) return null;

    const beacons = await prisma.beacon.findMany({
        where: {
            ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
        orderBy: { classroom: 'asc' },
    });

    return beacons.find((beacon) => normalizeClassroomKey(beacon.classroom) === classroomKey) ?? null;
}

export async function resolveBeaconsByClassrooms(classrooms: string[]) {
    const normalizedClassrooms = Array.from(
        new Set(classrooms.map(normalizeClassroomKey).filter(Boolean))
    );
    const requested = new Set(normalizedClassrooms);

    const beacons = await prisma.beacon.findMany({
        orderBy: { classroom: 'asc' },
    });

    return beacons
        .filter((beacon) => requested.has(normalizeClassroomKey(beacon.classroom)))
        .map(serializeBeacon);
}
