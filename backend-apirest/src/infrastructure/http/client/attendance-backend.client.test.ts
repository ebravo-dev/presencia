import { describe, expect, it } from 'vitest';
import { MirroredAttendanceBindingClient } from './attendance-backend.client.js';

describe('MirroredAttendanceBindingClient', () => {
  it('writes the new owner first and returns the legacy compatibility token', async () => {
    const order: string[] = [];
    const client = new MirroredAttendanceBindingClient(
      { createStudentDeviceBinding: async () => { order.push('attendance-service'); return { data: { bindingToken: 'new' } }; } },
      { createStudentDeviceBinding: async () => { order.push('legacy-projection'); return { data: { bindingToken: 'legacy' } }; } },
    );
    await expect(client.createStudentDeviceBinding({
      matricula: '2251330007', attendanceUuid: '12345678-1234-4234-9234-123456789abc',
    })).resolves.toEqual({ data: { bindingToken: 'legacy' } });
    expect(order).toEqual(['attendance-service', 'legacy-projection']);
  });
});
