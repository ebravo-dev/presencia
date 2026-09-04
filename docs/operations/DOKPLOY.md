# Despliegue de Presencia en Dokploy

## Configuración

- Tipo de despliegue: `Docker Compose`.
- Ruta Compose: `infra/compose/docker-compose.microservices.yml`.
- Directorio raíz: raíz de este repositorio.
- Dominio público: servicio `frontend-coord`, puerto `8080`.
- Red externa: `dokploy-network` (o el valor de `DOKPLOY_NETWORK_NAME`).
- Node.js de producción: línea 24 LTS, actualizada al reconstruir las imágenes.

Los proyectos Dokploy existentes que todavía apuntan a
`compose.coordination.yaml` pueden conservar esa ruta: el archivo raíz es una
entrada de compatibilidad que incluye el Compose canónico de microservicios.

Sólo `frontend-coord` y `api-gateway` comparten la red de Dokploy. PostgreSQL,
Redis, RabbitMQ y todos los servicios de dominio permanecen en la red privada
del Compose y no deben recibir dominios públicos. `uat-integration` también se
conecta a `uat-egress`, una red bridge sin puertos publicados que le permite
abrir HTTPS hacia los portales UAT; no debe agregarse a `dokploy-network`.

Los procesos de aplicación se ejecutan sin privilegios, con filesystem de sólo
lectura, todas las capacidades Linux retiradas y `no-new-privileges`. Los
únicos directorios temporales escribibles son `tmpfs`; en la web esto incluye
`/etc/nginx/conf.d`, donde el entrypoint genera la configuración a partir de la
variable `API_GATEWAY_UPSTREAM`.

Copiar `infra/compose/.env.dokploy.example`, sustituir todos los valores de
ejemplo y validar el archivo antes de cargarlo en Dokploy:

```bash
node infra/scripts/validate-dokploy-env.mjs infra/compose/.env.dokploy
```

Las contraseñas incluidas en URLs deben estar codificadas para URL. Cada JWT,
token interno, token de métricas y clave de cifrado debe ser aleatorio y
distinto. `RSA_PRIVATE_KEY` conserva el formato requerido únicamente por la
imagen histórica que ejecuta los jobs one-shot de migración e importación.

En el host de Docker, Redis necesita `vm.overcommit_memory=1` para que los
guardados en segundo plano y la replicación no fallen bajo presión de memoria.
Configúralo de forma persistente en el sistema operativo del nodo y verifícalo
antes del despliegue; el Compose no modifica parámetros globales del host.

## Orden de arranque

El Compose automatiza el orden:

1. PostgreSQL crea una base y usuario por servicio; Redis y RabbitMQ esperan
   hasta estar sanos.
2. Los contenedores `*-migrate` ejecutan las migraciones una sola vez.
3. Arrancan Identity, Academic y Attendance. Los jobs `beacon-import` y
   `shared-class-import` copian de forma idempotente la configuración legada de
   salones a Attendance y las clases compartidas a Academic. Cada permiso se
   propaga por RabbitMQ a Attendance antes de habilitar UAT Integration; si una
   importación falla, el despliegue se detiene sin modificar la fuente.
4. `staff-account-import` adopta una sola vez las cuentas coordinadoras legadas
   en Identity. Las ejecuciones posteriores no sobrescriben contraseñas, roles
   ni bloqueos administrados desde Identity.
5. Coordination Query crea su cola durable y reconstruye su modelo desde
   snapshots de Academic y Attendance.
6. El portal demo privado arranca con Redis. En producción permanece inactivo;
   en un proyecto demo sustituye ambos portales UAT sin publicar puertos.
7. UAT Integration arranca después de sus dependencias. El proceso HTTP del
   monolito ya no forma parte del runtime.
8. UAT Integration y el Gateway reportan App Log Service en sus dependencias,
   pero no bloquean el resto de la plataforma si éste falla: los móviles
   conservan la cola hasta su recuperación. PostgreSQL, Redis, RabbitMQ y los
   servicios funcionales sí condicionan el readiness.

No se deben ejecutar migraciones dentro de réplicas HTTP. Para escalar, aumenta
réplicas únicamente de `api-gateway`, `uat-integration`, `identity-service`,
`academic-service`, `attendance-service`, `coordination-query-service` y
`app-log-service`. Los
jobs `*-migrate`, `*-import`, PostgreSQL, Redis y RabbitMQ permanecen únicos
salvo que se sustituyan por servicios administrados de alta disponibilidad.
`demo-portal-service` también permanece en una sola réplica y sólo almacena
catálogos ficticios del proyecto demo.
Nginx vuelve a resolver `api-gateway` mediante el DNS interno de Docker, por lo
que el frontend conserva servicio si una réplica desaparece.

## Verificación posterior

Para una ejecución manual o en CI con Compose 5, iniciar el stack en segundo
plano y dejar que el smoke espere readiness:

```bash
docker compose --env-file infra/compose/.env.dokploy \
  -f infra/compose/docker-compose.microservices.yml \
  up --build --detach \
  --scale api-gateway=2 \
  --scale uat-integration=2 \
  --scale identity-service=2 \
  --scale academic-service=2 \
  --scale attendance-service=2 \
  --scale coordination-query-service=2 \
  --scale app-log-service=2
PRESENCIA_BASE_URL=https://presencia.example.edu.mx \
  node infra/scripts/smoke-deployment.mjs
```

No se usa `docker compose up --wait`: Compose 5 puede devolver estado distinto
de cero cuando los jobs one-shot terminan correctamente. El smoke reintenta las
sondas durante el arranque y mantiene la verificación del estado observable.

Con el dominio ya enrutado por Traefik:

```bash
PRESENCIA_BASE_URL=https://presencia.example.edu.mx node infra/scripts/smoke-deployment.mjs
```

Nginx publica únicamente las rutas de cliente y las sondas del Gateway. Las
rutas `/internal/*` no se reenvían. El workflow `Backend platform` genera
secretos efímeros, construye todas las imágenes, levanta PostgreSQL, Redis,
RabbitMQ, migraciones, servicios y web, y ejecuta este mismo smoke test mediante
`docker-compose.ci.yml`. En esa superposición, un portal UAT aislado simula los
formularios ASP.NET de maestros y alumnos. El flujo inicia ambas sesiones por
el Gateway, conserva cookies, cosecha grupos/roster, obtiene y persiste el
horario del alumno, vincula su celular, registra telemetría BLE con tiempo del
servidor y finaliza la lista por la ruta pública del profesor. Antes del `202`
se crea el job PostgreSQL; el worker vuelve a autenticarse, escribe exactamente
una vez en el portal simulado y el dashboard recibe `COMPLETED` por RabbitMQ.
El simulador fuerza un reintento transitorio y un fallo terminal de cinco
intentos; al restaurarlo, el mismo comando completa sin una escritura duplicada.
El gate también comprueba una DLQ real, una clase compartida
autorizada/revocada con captura delegada `SKIPPED`, el failover de una réplica
del Gateway y la restauración aislada de PostgreSQL/Redis. Además analiza y
prueba ambas apps Flutter y las compila para Android e iOS; la compilación iOS
se realiza sin firma en un runner macOS. El simulador se ejecuta sin root, con
filesystem de sólo lectura y sin acceso a los portales reales; las cuentas UAT
autorizadas permanecen fuera de CI.

El login de coordinación y superusuario, sus sesiones revocables y las cuentas
del personal pertenecen a Identity. El BFF conserva `/api/coordinacion/auth/*`
y `/api/superUsuario/*`; delega beacons y vinculaciones a Attendance. El modo
demo nuevo se activa con `PRESENCIA_DEBUG_MODE=true` exclusivamente en un
proyecto aislado con `DEPLOYMENT_ENVIRONMENT=demo`. Las apps siguen autenticando
y consultando UAT, pero Attendance marca las capturas como `SKIPPED` y el BFF no
inicia el worker de subida. El panel conserva el catálogo ficticio y las
simulaciones controladas; consulta [MODO_DEMO.md](MODO_DEMO.md).

El dashboard divide el shell en chunks cacheables y carga los exportadores de
Excel/PDF sólo cuando se solicitan, reduciendo el JavaScript inicial servido por
Nginx.

Después ejecutar con cuentas UAT de prueba autorizadas:

1. login de profesor, descarga de grupos y roster;
2. login de alumno, horario y vinculación del celular;
3. captura de asistencia con UAT temporalmente inaccesible;
4. confirmación de telemetría `DRAFT` antes de finalizar, estado `PENDING` para
   el titular y `SKIPPED` para una captura delegada;
5. restauración de UAT y confirmación de `COMPLETED` en el dashboard;
6. desvinculación desde coordinación y revinculación en el siguiente login UAT.

Las credenciales reales no deben guardarse en fixtures, variables de CI ni
logs. La prueba contra los portales sólo se ejecuta con autorización UAT.

## Rollback

`ROUTE_TARGET_OVERRIDES` sólo puede cambiar el destino de prefijos que siguen
en la lista pública. No puede reactivar `/auth`, `/professors`, `/groups`,
`/attendance`, `/api/beacons` ni `/api/student-attendance`; restaurar esos
contratos exige volver a desplegar una imagen anterior del Gateway junto con
la versión móvil correspondiente. Conserva las columnas y los valores
`DRAFT`/`SKIPPED`: las migraciones de base son forward-only y no eliminan datos.

## Backup y restauración

Programar backups independientes para las bases:

- `presencia_attendance` (fuente histórica de los imports one-shot, hasta
  validar y cerrar la migración);
- `presencia_uat`;
- `presencia_identity`;
- `presencia_academic`;
- `presencia_attendance_service`;
- `presencia_coordination_query`.

Respaldar también el volumen AOF de Redis. Coordination Query es reconstruible,
pero su backup reduce el tiempo de recuperación. RabbitMQ debe conservar sus
volúmenes mientras existan mensajes pendientes o en DLQ.

La restauración se valida en un entorno aislado: restaurar bases, ejecutar los
jobs de migración, iniciar servicios fuente y comprobar que Coordination Query
reconcilia antes de habilitar el dominio público.

El workflow ejecuta `verify-postgres-backup-restore.sh` para las seis bases y
`verify-redis-backup-restore.sh` para un RDB de Redis. Ambos scripts requieren
`PRESENCIA_BACKUP_VERIFY_ALLOW=ci`; crean únicamente destinos efímeros y los
eliminan al terminar. Esta prueba valida el procedimiento, pero no sustituye la
programación, cifrado, retención externa ni alertas de los backups de producción.

Los SLO iniciales, las reglas Prometheus y los procedimientos de respuesta se
documentan en `RUNBOOK_INCIDENTES.md`. El gate de carga usa exclusivamente el
portal simulado y se ejecuta con dos réplicas por servicio; nunca debe apuntarse
a las plataformas UAT reales.

## Trazas distribuidas

Las seis imágenes HTTP del producto y el portal auxiliar de demo precargan
OpenTelemetry antes del código de aplicación.
La exportación está desactivada por defecto para que la ausencia de un colector
no afecte disponibilidad. Para activarla en Dokploy, conecta un OpenTelemetry
Collector a la red privada del proyecto y configura:

```env
OTEL_TRACES_EXPORTER=otlp
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_LOG_LEVEL=warn
DEPLOYMENT_ENVIRONMENT=production
```

No publiques el puerto OTLP ni insertes credenciales en la URL. Si el proveedor
requiere autenticación, configura sus headers como secretos directamente en
Dokploy. Prometheus continúa leyendo `/metrics`; `OTEL_METRICS_EXPORTER` y
`OTEL_LOGS_EXPORTER` permanecen en `none` para evitar duplicación y volumen
accidental de logs.
