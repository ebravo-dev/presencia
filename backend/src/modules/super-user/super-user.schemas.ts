import { z } from 'zod';
import { beaconSchema, beaconUpdateSchema } from '../beacons/beacons.service.js';

export const superUserLoginSchema = z.object({
    password: z.string().min(1),
});

export const coordinatorCreateSchema = z.object({
    email: z.string().email(),
    name: z.string().min(1),
    password: z.string().min(8),
    role: z.enum(['COORDINATOR', 'READ_ONLY']),
});

export const coordinatorUpdateSchema = z.object({
    email: z.string().email().optional(),
    name: z.string().min(1).optional(),
    password: z.string().min(8).optional(),
    role: z.enum(['COORDINATOR', 'READ_ONLY']).optional(),
    disabled: z.boolean().optional(),
});

export const superUserBeaconSchema = beaconSchema;
export const superUserBeaconUpdateSchema = beaconUpdateSchema;

export type CoordinatorCreateInput = z.infer<typeof coordinatorCreateSchema>;
export type CoordinatorUpdateInput = z.infer<typeof coordinatorUpdateSchema>;
