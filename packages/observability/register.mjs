import { register } from 'node:module';

const exporterName = process.env.OTEL_TRACES_EXPORTER || 'none';
const enabled = process.env.OTEL_SDK_DISABLED !== 'true' && exporterName !== 'none';

if (enabled) {
  if (!['otlp', 'console'].includes(exporterName)) {
    throw new Error(`Unsupported OTEL_TRACES_EXPORTER: ${exporterName}`);
  }

  register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);
  const [
    { NodeTracerProvider, BatchSpanProcessor, ConsoleSpanExporter },
    { OTLPTraceExporter },
    { detectResources, envDetector, hostDetector, osDetector, processDetector, serviceInstanceIdDetector },
    { registerInstrumentations },
    { HttpInstrumentation },
    { UndiciInstrumentation },
    { AmqplibInstrumentation },
    { IORedisInstrumentation },
  ] = await Promise.all([
    import('@opentelemetry/sdk-trace-node'),
    import('@opentelemetry/exporter-trace-otlp-proto'),
    import('@opentelemetry/resources'),
    import('@opentelemetry/instrumentation'),
    import('@opentelemetry/instrumentation-http'),
    import('@opentelemetry/instrumentation-undici'),
    import('@opentelemetry/instrumentation-amqplib'),
    import('@opentelemetry/instrumentation-ioredis'),
  ]);
  const exporter = exporterName === 'console' ? new ConsoleSpanExporter() : new OTLPTraceExporter();
  const provider = new NodeTracerProvider({
    resource: detectResources({
      detectors: [envDetector, serviceInstanceIdDetector, hostDetector, osDetector, processDetector],
    }),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });
  provider.register();
  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation({ ignoreIncomingRequestHook: isOperationalProbe }),
      new UndiciInstrumentation(),
      new AmqplibInstrumentation(),
      new IORedisInstrumentation(),
    ],
  });
  process.once('beforeExit', () => { void provider.shutdown(); });
}

function isOperationalProbe(request) {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname;
  return pathname === '/health' || pathname.startsWith('/health/') || pathname === '/metrics';
}
