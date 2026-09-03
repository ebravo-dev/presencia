import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../config/env.js', () => ({
  env: {
    PRESENCIA_DEBUG_MODE: true,
    PRESENCIA_APP_REVIEW_ENABLED: true,
    PRESENCIA_APP_REVIEW_TEACHER_USERNAME: 'appreview.profesor@uat.edu.mx',
    PRESENCIA_APP_REVIEW_STUDENT_USERNAME: 'appreview.alumno@alumnos.uat.edu.mx',
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

  it('routes only the configured App Review professor to the private compatibility portal', () => {
    const factory = new UatClientFactory();

    const review = factory.createFor(' APPREVIEW.PROFESOR@UAT.EDU.MX ');
    const institutional = factory.createFor('otra.persona@uat.edu.mx');

    expect(review.source).toBe('APP_REVIEW');
    expect((review.client as unknown as { baseUrl: string }).baseUrl).toBe('http://demo-portal-service:3900');
    expect(institutional.source).toBe('UAT');
    expect((institutional.client as unknown as { baseUrl: string }).baseUrl).toBe('https://administracionescolar.uat.edu.mx');
  });

  it('routes only the configured App Review student to the private compatibility portal', () => {
    const factory = new UatStudentClientFactory();

    const review = factory.createFor('APPREVIEW.ALUMNO@ALUMNOS.UAT.EDU.MX');
    const institutional = factory.createFor('otro.alumno@alumnos.uat.edu.mx');

    expect(review.source).toBe('APP_REVIEW');
    expect((review.client as unknown as { baseUrl: string }).baseUrl).toBe('http://demo-portal-service:3900');
    expect(institutional.source).toBe('UAT');
    expect((institutional.client as unknown as { baseUrl: string }).baseUrl).toBe('https://alumnossur.uat.edu.mx');
  });
});
