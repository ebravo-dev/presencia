# Despliegue de Presencia en Dokploy

## Configuración

- Tipo de despliegue: `Docker Compose`.
- Ruta Compose: `infra/compose/docker-compose.microservices.yml`.
- Directorio raíz: raíz de este repositorio.
- Dominio público: servicio `frontend-coord`, puerto `8080`.
- Red externa: `dokploy-network` (o el valor de `DOKPLOY_NETWORK_NAME`).
- Node.js de producción: 24 LTS, fijado en las imágenes.

Sólo `frontend-coord` y `api-gateway` comparten la red de Dokploy. PostgreSQL,
Redis, RabbitMQ y todos los servicios de dominio permanecen en la red privada
del Compose y no deben recibir dominios públicos. `uat-integration` también se
conecta a `uat-egress`, una red bridge sin puertos publicados que le permite
abrir HTTPS hacia los portales UAT; no debe agregarse a `dokploy-network`.

Copiar `infra/compose/.env.dokploy.example`, sustituir todos los valores de
ejemplo y validar el archivo antes de cargarlo en Dokploy:

```bash
node infra/scripts/validate-dokploy-env.mjs infra/compose/.env.dokploy
```

Las contraseñas incluidas en URLs deben estar codificadas para URL. Cada JWT,
token interno, token de métricas y clave de cifrado debe ser aleatorio y
distinto. `RSA_PRIVATE_KEY` conserva el formato requerido únicamente por la
imagen histórica que ejecuta los jobs one-shot de migración e importación.

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
6. UAT Integration arranca después de sus dependencias. El proceso HTTP del
   monolito ya no forma parte del runtime.
7. UAT Integration comprueba PostgreSQL, Redis, RabbitMQ, Identity, Academic,
   Attendance y Coordination Query en su readiness. El Gateway también exige
   readiness de todos sus upstreams antes de que arranque la web.

No se deben ejecutar migraciones dentro de réplicas HTTP. Para escalar, aumenta
réplicas únicamente de `api-gateway`, `uat-integration`, `identity-service`,
`academic-service`, `attendance-service` y `coordination-query-service`. Los
jobs `*-migrate`, `*-import`, PostgreSQL, Redis y RabbitMQ permanecen únicos
salvo que se sustituyan por servicios administrados de alta disponibilidad.

## Verificación posterior

Con el dominio ya enrutado por Traefik:

```bash
PRESENCIA_BASE_URL=https://presencia.example.edu.mx node infra/scripts/smoke-deployment.mjs
```

Nginx publica únicamente las rutas de cliente y las sondas del Gateway. Las
rutas `/internal/*` no se reenvían. El workflow `Backend platform` genera
secretos efímeros, construye todas las imágenes, levanta PostgreSQL, Redis,
RabbitMQ, migraciones, servicios y web, y ejecuta este mismo smoke test mediante
`docker-compose.ci.yml`. Después inserta snapshots de profesor y alumno,
comprueba importación y resolución de beacons por roster, la vinculación del
celular, la telemetría BLE con tiempo del servidor y estado `DRAFT`, la captura
idempotente `PENDING`, y una clase compartida autorizada/revocada con captura
delegada `SKIPPED` sin usar credenciales ajenas. También comprueba la proyección
del reporte a través de RabbitMQ y analiza/prueba ambas apps
Flutter. Las cuentas y portales UAT reales permanecen fuera de CI.

El login de coordinación y superusuario, sus sesiones revocables y las cuentas
del personal pertenecen a Identity. El BFF conserva `/api/coordinacion/auth/*`
y `/api/superUsuario/*`; delega beacons y vinculaciones a Attendance. Las
herramientas debug heredadas están retiradas: el panel conserva una vista de
estado, las lecturas devuelven colecciones vacías y toda mutación responde
`410 LEGACY_DEBUG_RETIRED`.

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
