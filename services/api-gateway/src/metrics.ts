import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export interface GatewayMetrics {
  readonly registry: Registry;
  observe(method: string, route: string, statusCode: number, durationSeconds: number): void;
}

export function createGatewayMetrics(): GatewayMetrics {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: 'presencia_gateway_' });

  const requests = new Counter({
    name: 'presencia_gateway_http_requests_total',
    help: 'Total de solicitudes HTTP procesadas por el gateway.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [registry],
  });
  const duration = new Histogram({
    name: 'presencia_gateway_http_request_duration_seconds',
    help: 'Duración de solicitudes HTTP procesadas por el gateway.',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    registers: [registry],
  });

  return {
    registry,
    observe(method, route, statusCode, durationSeconds) {
      const labels = { method, route, status_code: String(statusCode) };
      requests.inc(labels);
      duration.observe(labels, durationSeconds);
    },
  };
}
