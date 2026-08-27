import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../config/env.js', () => ({
  env: {
    PRESENCIA_DEBUG_MODE: true,
    PRESENCIA_DEMO_PORTAL_URL: 'http://demo-portal-service:3900',
    UAT_BASE_URL: 'https://administracionescolar.uat.edu.mx',
    UAT_ALUMNOS_BASE_URL: 'https://alumnossur.uat.edu.mx',
    UAT_HTTP_TIMEOUT_MS: 30_000,
    UAT_CIRCUIT_FAILURE_THRESHOLD: 5,
    UAT_CIRCUIT_OPEN_MS: 30_000,
  },
}));

import { UatClientFactory } from './uat-client.factory.js';
import { UatStudentClientFactory } from './uat-student-client.factory.js';

describe('UAT client factories in demo mode', () => {
  it('keeps teacher authentication on the institutional portal', () => {
    const client = new UatClientFactory().create() as unknown as { baseUrl: string };

    expect(client.baseUrl).toBe('https://administracionescolar.uat.edu.mx');
  });

  it('keeps student authentication on the institutional portal', () => {
    const client = new UatStudentClientFactory().create() as unknown as { baseUrl: string };

    expect(client.baseUrl).toBe('https://alumnossur.uat.edu.mx');
  });
});
