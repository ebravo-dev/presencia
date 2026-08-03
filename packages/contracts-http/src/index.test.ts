import { describe, expect, it } from 'vitest';
import { resolveGatewayTarget } from './index.js';

describe('resolveGatewayTarget', () => {
  it.each([
    ['/api/uat/alumnos/horario?dia=1', 'uat-integration'],
    ['/api/coordinacion/resumen', 'uat-integration'],
    ['/attendance/sessions', 'legacy-backend'],
    ['/api/student-device-bindings', 'attendance'],
    ['/api/student-device-bindings/resolve', 'attendance'],
    ['/api/beacons/resolve', 'legacy-backend'],
    ['/health/ready', 'gateway'],
  ])('routes %s to %s', (url, target) => {
    expect(resolveGatewayTarget(url)).toBe(target);
  });

  it.each(['/internal', '/internal/coordination/beacons'])('never exposes %s', (url) => {
    expect(resolveGatewayTarget(url)).toBe('denied');
  });

  it('does not confuse a similarly named public path with an internal route', () => {
    expect(resolveGatewayTarget('/internal-tools')).toBe('legacy-backend');
  });

  it('supports reversible longest-prefix cutovers without changing the public URL', () => {
    const overrides = [
      { prefix: '/professors', target: 'academic' as const },
      { prefix: '/professors/login', target: 'identity' as const },
    ];
    expect(resolveGatewayTarget('/professors/login', overrides)).toBe('identity');
    expect(resolveGatewayTarget('/professors/me/groups', overrides)).toBe('academic');
  });

  it('does not allow an override to expose internal routes', () => {
    expect(resolveGatewayTarget('/internal/secret', [
      { prefix: '/internal', target: 'uat-integration' },
    ])).toBe('denied');
  });
});
