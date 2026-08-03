import { describe, expect, it } from 'vitest';
import { SharedClassController } from './shared-class.controller.js';

describe('SharedClassController', () => {
  it('queries Academic Service using only the authenticated teacher identity and requested cycle', async () => {
    let received: unknown;
    const controller = new SharedClassController({
      listSharedClassesForTeacher: async (input: unknown) => {
        received = input;
        return { source: 'SHARED_CLASSES', data: [] };
      },
    } as never);

    const result = await controller.forAuthenticatedTeacher({
      query: { year: '2026', term: '2' },
      uatSession: { username: 'profesor@uat.edu.mx' },
    } as never, replyStub() as never);

    expect(received).toEqual({ identity: 'profesor@uat.edu.mx', year: 2026, term: 2 });
    expect(result).toMatchObject({ source: 'SHARED_CLASSES', data: [] });
  });
});

function replyStub() {
  return { send(value: unknown) { return value; } };
}
