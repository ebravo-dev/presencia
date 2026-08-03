export const PUBLIC_API_VERSION = 'v1' as const;

export type GatewayTarget =
  | 'gateway'
  | 'legacy-backend'
  | 'uat-integration'
  | 'identity'
  | 'academic'
  | 'attendance'
  | 'coordination-query'
  | 'denied';

export interface GatewayRouteOverride {
  readonly prefix: string;
  readonly target: Exclude<GatewayTarget, 'gateway' | 'denied'>;
}

export interface PublicRouteContract {
  readonly prefix: string;
  readonly owner: string;
  readonly transitionalTarget: Exclude<GatewayTarget, 'gateway' | 'denied'>;
}

export const publicRouteContracts = [
  { prefix: '/api/uat', owner: 'uat-integration', transitionalTarget: 'uat-integration' },
  { prefix: '/api/coordinacion', owner: 'coordination-query', transitionalTarget: 'uat-integration' },
  { prefix: '/auth', owner: 'identity', transitionalTarget: 'legacy-backend' },
  { prefix: '/professors', owner: 'academic', transitionalTarget: 'legacy-backend' },
  { prefix: '/groups', owner: 'academic', transitionalTarget: 'legacy-backend' },
  { prefix: '/attendance', owner: 'attendance', transitionalTarget: 'legacy-backend' },
  { prefix: '/api/beacons', owner: 'attendance', transitionalTarget: 'legacy-backend' },
  { prefix: '/api/student-device-bindings', owner: 'attendance', transitionalTarget: 'attendance' },
  { prefix: '/api/student-attendance', owner: 'attendance', transitionalTarget: 'legacy-backend' },
  { prefix: '/api/superUsuario', owner: 'identity', transitionalTarget: 'uat-integration' },
] as const satisfies readonly PublicRouteContract[];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function resolveGatewayTarget(
  rawUrl: string,
  overrides: readonly GatewayRouteOverride[] = [],
): GatewayTarget {
  const pathname = new URL(rawUrl, 'http://gateway.internal').pathname;

  if (matchesPrefix(pathname, '/internal')) return 'denied';
  if (matchesPrefix(pathname, '/health') || pathname === '/metrics') return 'gateway';

  const override = [...overrides]
    .sort((left, right) => right.prefix.length - left.prefix.length)
    .find(({ prefix }) => matchesPrefix(pathname, prefix));
  if (override) return override.target;

  const contract = publicRouteContracts.find(({ prefix }) => matchesPrefix(pathname, prefix));
  return contract?.transitionalTarget ?? 'legacy-backend';
}
