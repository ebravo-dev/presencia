import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/index.js';
import { PrismaAcademicRepository } from './prisma-academic.repository.js';

describe('PrismaAcademicRepository transaction retry', () => {
  it('retries serializable snapshot conflicts', async () => {
    const expected = {
      snapshotId: 'snapshot-1', duplicate: false, activeGroups: 1, activeEnrollments: 2, deactivatedGroups: 0,
    };
    const transaction = vi.fn()
      .mockRejectedValueOnce(prismaError('P2034'))
      .mockRejectedValueOnce(prismaError('P2002'))
      .mockResolvedValueOnce(expected);
    const repository = new PrismaAcademicRepository({ $transaction: transaction } as never);

    await expect(repository.applySnapshot({} as never)).resolves.toEqual(expected);
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-transaction failures', async () => {
    const transaction = vi.fn().mockRejectedValueOnce(new Error('database unavailable'));
    const repository = new PrismaAcademicRepository({ $transaction: transaction } as never);

    await expect(repository.applyStudentSnapshot({} as never)).rejects.toThrow('database unavailable');
    expect(transaction).toHaveBeenCalledOnce();
  });
});

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('Concurrent transaction conflict', {
    code,
    clientVersion: '6.19.3',
  });
}
