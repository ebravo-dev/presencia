import { describe, expect, it } from 'vitest';
import { resolveGatewayTarget } from './index.js';

describe('resolveGatewayTarget', () => {
  it.each([
    ['/api/uat/alumnos/horario?dia=1', 'uat-integration'],
    ['/api/coordinacion/resumen', 'uat-integration'],
    ['/api/student-device-bindings', 'attendance'],
    ['/api/student-device-bindings/resolve', 'attendance'],
    ['/api/superUsuario/auth/me', 'uat-integration'],
    ['/health/ready', 'gateway'],
  ])('routes %s to %s', (url, target) => {
    expect(resolveGatewayTarget(url)).toBe(target);
  });

  it.each(['/internal', '/internal/coordination/beacons'])('never exposes %s', (url) => {
    expect(resolveGatewayTarget(url)).toBe('denied');
  });

  it('does not confuse a similarly named public path with an internal route', () => {
    expect(resolveGatewayTarget('/internal-tools')).toBe('denied');
  });

  it.each([
    '/auth/login',
    '/professors/login',
    '/groups',
    '/attendance/record',
    '/api/beacons/resolve',
    '/api/student-attendance',
    '/unknown',
  ])('denies retired or unknown public route %s', (url) => {
    expect(resolveGatewayTarget(url)).toBe('denied');
  });

  it('supports reversible longest-prefix cutovers without changing the public URL', () => {
    const overrides = [
      { prefix: '/api/uat', target: 'academic' as const },
      { prefix: '/api/uat/profesor', target: 'identity' as const },
    ];
    expect(resolveGatewayTarget('/api/uat/profesor/sync', overrides)).toBe('identity');
    expect(resolveGatewayTarget('/api/uat/alumnos/horario', overrides)).toBe('academic');
  });

  it('cannot revive a retired route through an override', () => {
    expect(resolveGatewayTarget('/professors/login', [
      { prefix: '/professors', target: 'identity' },
    ])).toBe('denied');
  });

  it('does not allow an override to expose internal routes', () => {
    expect(resolveGatewayTarget('/internal/secret', [
      { prefix: '/internal', target: 'uat-integration' },
    ])).toBe('denied');
  });
});
