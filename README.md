# Presencia

Monorepo del proyecto de asistencia UAT.

## Estructura

```txt
presencia/
|- app-alumno/
|- app-profesor/
|- backend/
|- backend-apirest/
|- frontend-coord/
|- packages/
|- services/
`- infra/
```

## Arquitectura

- [Plan de migración a microservicios](docs/architecture/PLAN_MIGRACION_MICROSERVICIOS.md)
- [Auditoría de finalización y evidencia](docs/architecture/AUDITORIA_FINALIZACION_2026-08-03.md)

## backend-apirest

`backend-apirest` es el backend puente/ACL entre `app-profesor` y el portal
UAT. No reemplaza al sistema escolar original; consume por HTTP la API/sitio de
`https://administracionescolar.uat.edu.mx` usando sesion ASP.NET basada en
cookies.

## Arquitectura implementada

El punto público único es `api-gateway`. La migración conserva las rutas de las
apps y separa datos en bases PostgreSQL independientes:

- `identity-service`: identidades y sesiones revocables;
- `academic-service`: profesores, alumnos, horarios, grupos y roster;
- `attendance-service`: asistencia y vinculación matrícula/celular/UUID;
- `coordination-query-service`: dashboard y reportes reconstruibles;
- `backend-apirest`: integración y anticorrupción con los portales UAT;
- RabbitMQ: eventos durables con reintentos/DLQ;
- Redis: sesiones UAT compartidas, rate limiting y caché efímera.

UAT Integration conserva salida HTTPS mediante una red de egreso dedicada,
sin publicar puertos. La red privada de datos continúa aislada de Internet.

Los backends anteriores permanecen como fachadas de compatibilidad sólo donde
los clientes aún necesitan el contrato histórico. Los nuevos servicios son los
propietarios de los flujos críticos y la migración de rutas es reversible.

## Despliegue en Dokploy

El Compose integral está en
`infra/compose/docker-compose.microservices.yml`.

Configuracion recomendada:

```txt
Build Type: Docker Compose
Compose Path: infra/compose/docker-compose.microservices.yml
Root Directory / Base Directory: raiz del repositorio
```

Asigna el dominio web únicamente a `frontend-coord`, puerto `8080`; Nginx envía
`/api` al Gateway. No asignes dominios a servicios internos.

Ambos contenedores se conectan a la red externa `dokploy-network`, necesaria
para que Traefik enrute los dominios y para alcanzar servicios administrados
por Dokploy, como PostgreSQL, mediante su hostname interno.

Copia y sustituye `infra/compose/.env.dokploy.example`. La guía completa,
validación de secretos, smoke test, rollback y backups está en
[docs/operations/DOKPLOY.md](docs/operations/DOKPLOY.md).

Para el primer coordinador usa:

```env
COORDINATOR_EMAIL=coordinacion@uat.edu.mx
COORDINATOR_NAME=Coordinacion Academica
COORDINATOR_PASSWORD=una-clave-segura-de-al-menos-12-caracteres
```

Para varios coordinadores usa `COORDINATORS_JSON`; cada despliegue realiza UPSERT
por correo, por lo que permite agregar usuarios o rotar contraseñas sin
duplicados.

## Verificación local

```bash
npm ci
npm run verify
npm run typecheck --prefix backend-apirest
npm test --prefix backend-apirest
npm run typecheck --prefix backend
npm test --prefix backend -- --run
npm run typecheck --prefix frontend-coord
npm test --prefix frontend-coord
cd app-alumno && flutter analyze && flutter test
cd ../app-profesor && flutter analyze && flutter test
```

El workflow de CI también levanta el Compose completo con secretos efímeros y
ejecuta las sondas públicas a través del mismo Nginx usado en Dokploy. Antes de
levantar el stack valida también ambos clientes Flutter.

La app del profesor no persiste la contraseña UAT: elimina la clave heredada de
Hive y sólo mantiene una copia efímera en memoria durante el proceso activo.
Los identificadores de sesión se guardan en el almacén seguro nativo
(Android Keystore/iOS Keychain) y las instalaciones existentes migran y eliminan
automáticamente los tokens heredados de Hive.

## Integraciones

- `app-profesor` y `app-alumno` consumen el dominio público del Gateway.
- UAT Integration consume los portales de maestros y alumnos de la UAT.

## Referencias

- `backend-apirest/README.md`
- `backend-apirest/docs/openapi.yaml`
- `docs/operations/DOKPLOY.md`
