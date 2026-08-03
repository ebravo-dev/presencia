# SLO y respuesta a incidentes de Presencia

## Objetivos operativos iniciales

Estos objetivos deben recalibrarse después de medir al menos dos semanas en el
host Dokploy. La dependencia externa UAT se mide por separado para no ocultar
fallos propios ni atribuir a Presencia una caída institucional.

| Señal | Objetivo inicial | Ventana |
|---|---:|---:|
| Disponibilidad del Gateway para rutas propias | 99.9% | 30 días |
| Errores 5xx del Gateway | menor a 1% | 5 minutos |
| Lecturas REST propias, latencia p95 | menor a 750 ms | 5 minutos |
| Solicitudes que dependen del portal UAT, latencia p95 | menor a 2.5 s | 5 minutos |
| Aceptación durable de una captura de asistencia, p95 | menor a 1 s | 5 minutos |
| Convergencia del dashboard después de un evento, p95 | menor a 30 s | 15 minutos |
| Carga UAT completada con el portal disponible | 95% antes de 5 minutos | 24 horas |

`infra/scripts/verify-load.mjs` comprueba en CI el SLO de lectura con 200
solicitudes, concurrencia 20, dos réplicas por servicio y el portal UAT
simulado. Se niega a ejecutar sin `PRESENCIA_LOAD_TEST_ALLOW=ci`, usa sólo la
cuenta ficticia del simulador y nunca debe apuntarse al portal real.

Las reglas listas para importar en Prometheus están en
`infra/observability/prometheus-alerts.yml`. Los endpoints `/metrics` usan un
Bearer distinto por servicio y deben permanecer en la red privada. La
configuración del colector y su canal de notificación pertenecen al host; no se
versionan tokens reales.

Las imágenes también precargan OpenTelemetry y propagan W3C Trace Context entre
peticiones HTTP. Cuando `OTEL_TRACES_EXPORTER=otlp`, consulta el colector por
`service.name` y `trace_id`; conserva el `x-correlation-id` como clave de
investigación en logs. Si el colector falla, desactiva temporalmente el exporter
con `OTEL_TRACES_EXPORTER=none` sin retirar métricas ni health checks.

## Servicio no disponible

1. Confirma `/health/live` y `/health/ready` en la réplica afectada.
2. Revisa la dependencia marcada como degradada antes de reiniciar el proceso.
3. Comprueba que otra réplica siga atendiendo por el Gateway y que Nginx haya
   vuelto a resolver el DNS de Docker.
4. Si sólo una réplica está dañada, retírala y reconstruye esa imagen; no
   ejecutes migraciones dentro de la réplica HTTP.
5. Si todas fallan, conserva RabbitMQ/PostgreSQL/Redis, captura logs con el
   correlation ID y aplica el rollback documentado en `DOKPLOY.md`.

## Errores o latencia del Gateway

1. Separa 4xx de 5xx y agrupa por la etiqueta `route`; nunca uses la URL cruda
   con IDs como etiqueta.
2. Revisa saturación de CPU/memoria, conexiones Redis y latencia de cada
   readiness upstream.
3. Si una ruta concentra el error, identifica su propietario con
   `contracts-http`; evita aumentar réplicas de jobs o bases de datos.
4. Escala únicamente Gateway, UAT Integration, Identity, Academic, Attendance
   o Coordination Query. Mantén únicos los jobs `*-migrate` y `*-import`.

## Indisponibilidad del portal UAT

1. Confirma si el circuit breaker está abierto y si el portal institucional
   responde desde el egreso `uat-egress`.
2. No borres trabajos `PENDING`/`FAILED`, cookies cifradas ni mensajes de la
   DLQ. Attendance ya aceptó de forma durable la captura antes del `202`.
3. Cuando UAT regrese, reenvía el mismo `ClientRecordId`; la idempotencia debe
   completar el job existente sin duplicar la lista oficial.
4. Antes de reprocesar una DLQ en producción, exporta sus mensajes, identifica
   la causa y prueba un único evento. No purgues la cola como mecanismo de
   recuperación.
5. Una escritura manual en UAT exige grupo, fecha, lista y autorización
   explícitos; las sondas ordinarias son de sólo lectura.

## Dashboard sin convergencia

1. Compara el evento publicado con el inbox de Coordination Query mediante su
   correlation ID.
2. Ejecuta la reconciliación desde snapshots de Academic y Attendance.
3. Verifica que el modelo reconstruido produzca los mismos conteos antes de
   volver a habilitar reportes.
4. Si el lag supera 30 segundos de manera sostenida, revisa RabbitMQ y escala
   Coordination Query; no permitas lecturas cruzadas a otras bases.

## Recuperación de datos

1. Detén escrituras del servicio propietario y conserva una copia inmutable
   del respaldo original.
2. Restaura cada base en un destino nuevo, ejecuta su migración one-shot y
   compara conteos por tabla antes del cambio de tráfico.
3. Valida el RDB/AOF de Redis en un contenedor aislado y sin red.
4. Reconstruye Coordination Query desde las fuentes de Academic y Attendance.
5. Ejecuta smoke, flujo integral e idempotencia antes de abrir el dominio.

Los scripts de CI de restauración tienen una guarda destructiva y sólo crean
destinos efímeros. No sustituyen el cifrado, retención, réplica fuera del host
ni las alertas de backups de producción.
