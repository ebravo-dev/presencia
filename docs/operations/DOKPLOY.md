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
distinto. `RSA_PRIVATE_KEY` conserva el formato requerido por el backend
legado durante la migración reversible.

## Orden de arranque

El Compose automatiza el orden:

1. PostgreSQL crea una base y usuario por servicio; Redis y RabbitMQ esperan
   hasta estar sanos.
2. Los contenedores `*-migrate` ejecutan las migraciones una sola vez.
3. Arrancan Identity, Academic y Attendance. El job `beacon-import` copia de
   forma idempotente la configuración legada de salones a Attendance antes de
   habilitar el backend de compatibilidad; si detecta UUIDs o salones
   ambiguos, el despliegue se detiene sin modificar la fuente.
4. Coordination Query crea su cola durable y reconstruye su modelo desde
   snapshots de Academic y Attendance.
5. UAT Integration y el backend de compatibilidad arrancan después de sus
   dependencias.
6. El Gateway sólo queda listo cuando todos los upstreams requeridos responden
   en readiness; después arranca la web.

No se deben ejecutar migraciones dentro de réplicas HTTP. Para escalar, aumenta
réplicas únicamente de `api-gateway`, `uat-integration`, `identity-service`,
`academic-service`, `attendance-service` y `coordination-query-service`. Los
jobs `*-migrate`, `*-provision`, PostgreSQL, Redis y RabbitMQ permanecen únicos
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
celular, la captura idempotente y la proyección del reporte a través de
RabbitMQ. El gate también analiza y prueba ambas apps
Flutter. Las cuentas y portales UAT reales permanecen fuera de CI.

El dashboard divide el shell en chunks cacheables y carga los exportadores de
Excel/PDF sólo cuando se solicitan, reduciendo el JavaScript inicial servido por
Nginx.

Después ejecutar con cuentas UAT de prueba autorizadas:

1. login de profesor, descarga de grupos y roster;
2. login de alumno, horario y vinculación del celular;
3. captura de asistencia con UAT temporalmente inaccesible;
4. confirmación de estado local `PENDING`;
5. restauración de UAT y confirmación de `COMPLETED` en el dashboard;
6. desvinculación desde coordinación y revinculación en el siguiente login UAT.

Las credenciales reales no deben guardarse en fixtures, variables de CI ni
logs. La prueba contra los portales sólo se ejecuta con autorización UAT.

## Rollback

Los contratos públicos no cambian. `ROUTE_TARGET_OVERRIDES` permite revertir
una ruta al destino transitorio sin reinstalar las apps móviles. Antes de un
rollback de esquema, restaura la imagen anterior y conserva las columnas
nuevas; las migraciones Prisma de esta entrega son aditivas. La ruta instalada
`/api/beacons/resolve` permanece como fachada durante la actualización gradual
de móviles, pero su configuración se lee de Attendance Service.

## Backup y restauración

Programar backups independientes para las bases:

- `presencia_attendance` (compatibilidad);
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
