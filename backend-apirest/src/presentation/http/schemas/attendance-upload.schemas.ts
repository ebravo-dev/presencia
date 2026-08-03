import { z } from 'zod';

export const attendanceRecordStatusesSchema = z.object({
  clientRecordIds: z.array(z.string().min(1).max(160)).min(1).max(200),
});
