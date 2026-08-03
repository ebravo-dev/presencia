import { describe, expect, it } from 'vitest';
import { attendanceUploadIdentity, latestJobsByClientRecordId } from './prisma-attendance-upload.repository.js';

describe('attendance upload result identity', () => {
  it('keeps the mobile record id separate from the Attendance aggregate identity', () => {
    expect(attendanceUploadIdentity({
      clientRecordId: '947699_2026-08-02',
      attendanceSessionId: 'attendance-1',
      attendanceVersion: 3,
    })).toEqual({ attendanceSessionId: 'attendance-1', version: 3 });
  });

  it('can still publish results for jobs created before the migration', () => {
    expect(attendanceUploadIdentity({
      clientRecordId: 'attendance-legacy:v2',
      attendanceSessionId: null,
      attendanceVersion: null,
    })).toEqual({ attendanceSessionId: 'attendance-legacy', version: 2 });
  });

  it('returns the newest status when multiple corrections share the local record id', () => {
    const newest = { clientRecordId: '947699_2026-08-02', status: 'PENDING' };
    const older = { clientRecordId: '947699_2026-08-02', status: 'COMPLETED' };
    expect(latestJobsByClientRecordId([newest, older])).toEqual([newest]);
  });
});
