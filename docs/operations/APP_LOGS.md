# Logs durables de las aplicaciones

## Objetivo y flujo

`app-log-service` recibe telemetría estructurada de `app-alumno` y
`app-profesor` en `POST /api/app-logs/batches`. El Gateway es el único punto
público. La consulta se realiza desde Super Usuario; el navegador conserva su
cookie `HttpOnly`, UAT Integration valida la sesión con Identity y consulta
`GET /internal/v1/app-logs` usando el token privado entre servicios.
El contrato público completo está versionado en
`docs/openapi/app-log-service.yaml`.

Cada evento contiene, como mínimo: UUID idempotente, secuencia local,
aplicación, severidad, nombre estable, mensaje, hora del dispositivo, versión y
build, instalación, sesión de ejecución, plataforma y versión del sistema. Si
están disponibles incluye usuario, modelo del dispositivo, locale, zona
horaria, red, correlation ID, error, stack trace y contexto JSON.

## Garantías de durabilidad

- Antes de intentar la red, cada app escribe el evento en una caja Hive
  independiente de la sesión del usuario.
- Cerrar sesión o limpiar datos funcionales no limpia la cola de diagnóstico.
- El envío comienza inmediatamente al escribir, se reintenta cada cinco
  segundos con backoff acotado a 30 segundos y se fuerza al volver al primer
  plano.
- Los lotes tienen hasta 50 eventos. El cliente sólo elimina los UUID que el
  backend confirmó individualmente después del commit PostgreSQL.
- Repetir un lote es seguro: el UUID del evento es clave primaria y el backend
  confirma duplicados sin crear registros nuevos (entrega *at least once* con
  persistencia efectiva *exactly once*).
- La tabla del backend es append-only. Los triggers de PostgreSQL rechazan
  `UPDATE`, `DELETE` y `TRUNCATE`; no existe endpoint de borrado y la base de
  logs queda fuera de la zona destructiva de Super Usuario.
- La verificación de backups incluye `presencia_app_logs` y compara conteos al
  restaurar en una base aislada.
- Una caída de este servicio no tumba autenticación ni asistencia: las
  readiness la reportan como dependencia no crítica y los móviles reintentan
  desde almacenamiento local.

Ninguna aplicación puede garantizar datos ante desinstalación, borrado del
almacenamiento por el sistema operativo, daño físico o agotamiento total del
disco antes del envío. Para cerrar ese riesgo operativo se requieren backups
fuera del host con retención inmutable y monitoreo de capacidad. Nunca se debe
usar la base primaria como único respaldo.

## Seguridad y privacidad

El cliente y el servidor redactan claves cuyo nombre sugiera contraseña,
token, cookie, autorización, credencial, sesión, secreto o llave privada.
También se redactan valores `Bearer` en texto. No se deben registrar
contraseñas, tokens, cuerpos completos de login, cookies, contenido académico
ni datos biométricos.

`APP_LOG_INGESTION_KEY` reduce tráfico casual no autorizado, pero una clave
incluida en una app móvil puede extraerse y no representa identidad fuerte.
Por eso la ingesta además limita tamaño, esquema, frecuencia y número de
eventos. El Gateway aplica el presupuesto distribuido mediante Redis y el
servicio repite el control localmente como defensa en profundidad. La consulta
nunca usa esa clave: requiere sesión vigente de Super
Usuario y la red privada.

La IP de origen se conserva para investigar abuso y conectividad. Debe
considerarse dato personal dentro de las políticas institucionales de acceso y
respaldo.

## Configuración

Genera valores aleatorios distintos de al menos 32 caracteres:

```env
APP_LOG_DB_NAME=presencia_app_logs
APP_LOG_DB_USER=presencia_app_logs
APP_LOG_DB_PASSWORD=...
APP_LOG_DATABASE_URL=postgresql://presencia_app_logs:...@postgres:5432/presencia_app_logs?schema=public
APP_LOG_INGESTION_KEY=...
APP_LOG_METRICS_TOKEN=...
APP_LOG_INGESTION_RATE_LIMIT_MAX=600
```

Las compilaciones móviles deben recibir exactamente la misma clave de ingesta
y su versión real:

```bash
flutter build apk --release \
  --dart-define=PRESENCIA_LOG_INGESTION_KEY="$APP_LOG_INGESTION_KEY" \
  --dart-define=PRESENCIA_APP_VERSION=1.2.0 \
  --dart-define=PRESENCIA_APP_BUILD_NUMBER=5
```

Usa secretos de CI/CD; no escribas el valor real en Git ni lo imprimas en
salida de compilación.

## Operación

1. Vigila `/health/ready`, espacio de PostgreSQL, crecimiento diario y éxito
   de backups. Escala réplicas HTTP de `app-log-service`, nunca el job de
   migración. Importa las alertas versionadas de error 5xx y latencia p95 desde
   `infra/observability/prometheus-alerts.yml`.
2. Ante un incidente, filtra primero `FATAL`/`ERROR`, aplicación y ventana de
   tiempo; la tarjeta de errores frecuentes agrupa los cinco `eventName` con
   más ocurrencias en las últimas 24 horas. Después usa instalación, usuario,
   sesión, secuencia y correlation ID para reconstruir el recorrido.
3. Una diferencia grande entre `occurredAt` y `receivedAt` indica tiempo sin
   conectividad o reloj incorrecto del dispositivo; no invalida el evento.
4. Si la ingesta falla, no pidas al usuario limpiar caché ni reinstalar: eso
   puede destruir los únicos eventos pendientes. Corrige red/servicio/clave y
   abre de nuevo la app para forzar el reenvío.
5. Define alertas de capacidad con margen para crecimiento sin retención
   automática. Para archivo de largo plazo, copia a almacenamiento con Object
   Lock/WORM, verifica checksums y sólo entonces evalúa una política formal;
   esta implementación no borra automáticamente.
