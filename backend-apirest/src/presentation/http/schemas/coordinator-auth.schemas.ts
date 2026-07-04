import { z } from 'zod';

export const coordinatorLoginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(256),
}).strict();
