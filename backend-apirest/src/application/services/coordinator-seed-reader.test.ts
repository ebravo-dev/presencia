import { describe, expect, it } from 'vitest';
import { readConfiguredCoordinators } from './coordinator-seed-reader.js';

describe('readConfiguredCoordinators', () => {
  it('normalizes and deduplicates configured accounts', () => {
    const accounts = readConfiguredCoordinators({
      COORDINATORS_JSON: JSON.stringify([
        { email: 'COORD@UAT.EDU.MX', name: 'Inicial', password: 'password-one', role: 'READ_ONLY' },
      ]),
      COORDINATOR_EMAIL: 'coord@uat.edu.mx',
      COORDINATOR_NAME: 'Final',
      COORDINATOR_PASSWORD: 'password-two',
    });
    expect(accounts).toEqual([{
      email: 'coord@uat.edu.mx', name: 'Final', password: 'password-two', role: 'COORDINATOR',
    }]);
  });

  it('rejects incomplete bootstrap credentials', () => {
    expect(() => readConfiguredCoordinators({ COORDINATOR_EMAIL: 'coord@uat.edu.mx' }))
      .toThrow('Coordinador 1 inválido');
  });
});
