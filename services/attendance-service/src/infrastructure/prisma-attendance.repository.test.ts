import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/index.js';
import { PrismaAttendanceRepository } from './prisma-attendance.repository.js';

describe('PrismaAttendanceRepository roster transaction retry', () => {
  it('retries roster writes after serialization and unique races', async () => {
    const transaction = vi.fn()
      .mockRejectedValueOnce(prismaError('P2034'))
      .mockRejectedValueOnce(prismaError('P2002'))
      .mockResolvedValueOnce(undefined);
    const repository = new PrismaAttendanceRepository({ $transaction: transaction } as never);

    await expect(repository.applyRoster({} as never)).resolves.toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('does not retry a non-Prisma roster failure', async () => {
    const transaction = vi.fn().mockRejectedValueOnce(new Error('database unavailable'));
    const repository = new PrismaAttendanceRepository({ $transaction: transaction } as never);

    await expect(repository.applyRoster({} as never)).rejects.toThrow('database unavailable');
    expect(transaction).toHaveBeenCalledOnce();
  });
});

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('Concurrent transaction conflict', {
    code,
    clientVersion: '6.19.3',
  });
}
