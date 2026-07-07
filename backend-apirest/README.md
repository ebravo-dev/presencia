# backend-apirest

API REST aislada para consumir endpoints internos del Sistema Administrativo
Escolar UAT usando autenticacion ASP.NET por cookies. No usa Bearer token:
cada login crea un `CookieJar` persistente en memoria y conserva `.ASPXAUTH`,
`ASP.NET_SessionId` cuando el portal la emite, y las cookies adicionales que
entregue el sitio.

## Instalacion

```bash
cd backend-apirest
npm install
cp .env.example .env
npm run dev
```

Por defecto escucha en `http://localhost:3100`.

## Despliegue en Dokploy

El despliegue recomendado crea la API y el frontend en contenedores separados.
En Dokploy configura:

```txt
Root Directory / Base Directory: raiz del repositorio
Build Type: Docker Compose
Compose Path: compose.coordination.yaml
```

El dominio del panel se asigna a `frontend-coord:8080`. Este reenvia `/api` a
`backend-apirest:3100` por la red privada, conservando las cookies `HttpOnly`
en el mismo origen. La API puede tener ademas un dominio propio para los otros
clientes.

Los dos servicios tambien se conectan a la red externa `dokploy-network` para
que Traefik y los servicios administrados de Dokploy, incluido PostgreSQL,
puedan alcanzarlos por sus hostnames internos.

Variables recomendadas:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3100
UAT_BASE_URL=https://administracionescolar.uat.edu.mx
UAT_HTTP_TIMEOUT_MS=30000
UAT_SESSION_TTL_MINUTES=45
ATTENDANCE_JOB_ENCRYPTION_SECRET=un-secreto-estable-de-al-menos-32-caracteres
DATABASE_URL=postgresql://usuario:password@postgres:5432/presencia_coordination?schema=public
DATABASE_MIGRATION_MAX_ATTEMPTS=10
DATABASE_MIGRATION_RETRY_MS=3000
COORDINATION_JWT_SECRET=cambia-este-secreto-de-al-menos-32-caracteres
COORDINATION_WEB_ORIGIN=https://tu-dominio.example
COORDINATION_COOKIE_SECURE=true
ATTENDANCE_BACKEND_URL=http://backend:3000
ATTENDANCE_BACKEND_SERVICE_TOKEN=token-interno-compartido-de-al-menos-32-caracteres
COORDINATOR_EMAIL=coordinacion@uat.edu.mx
COORDINATOR_NAME=Coordinacion Academica
COORDINATOR_PASSWORD=una-clave-segura-de-al-menos-12-caracteres
# Alternativa para varias cuentas:
COORDINATORS_JSON=[{"email":"coord1@uat.edu.mx","name":"Coordinador Uno","password":"clave-segura-123"}]
```

En `DATABASE_URL` usa el hostname interno del servicio PostgreSQL de Dokploy;
`localhost` apuntaria al propio contenedor de la API. Si PostgreSQL es externo,
agrega los parametros SSL exigidos por el proveedor.

Al iniciar cada revision, el contenedor realiza en orden:

1. `prisma migrate deploy`, con reintentos mientras PostgreSQL arranca.
2. UPSERT idempotente de las cuentas definidas en `COORDINATORS_JSON` o en las
   tres variables `COORDINATOR_*`.
3. Inicio de `backend-apirest` en el puerto configurado.

Si una migracion falla o las credenciales de coordinacion estan incompletas, el
contenedor termina con error y Dokploy conserva los logs del motivo; no inicia
la API sobre un esquema incompleto.

Los archivos `.dockerignore` evitan enviar dependencias, builds y secretos al
daemon de Docker.

## Flujo principal

1. `POST /api/uat/sessions` con usuario y password.
2. Guardar el `sessionId` devuelto por esta API.
3. Enviar `X-UAT-Session-Id: <sessionId>` en consultas posteriores.
4. Consultar horarios/examenes con `Id_Ciclo_Escolar` e `Id_DES`.

El backend ejecuta internamente:

```txt
GET  https://administracionescolar.uat.edu.mx/Login
POST https://administracionescolar.uat.edu.mx/Login/Accesar_Dominio
GET  https://administracionescolar.uat.edu.mx/Login/Validar
GET  https://administracionescolar.uat.edu.mx/Profesor/Consultas/BuscaHorarios
GET  https://administracionescolar.uat.edu.mx/Profesor/Consultas/BuscaExamenes
GET  https://administracionescolar.uat.edu.mx/Profesor/ControlAsistencia/BuscaGruposProfesor
GET  https://administracionescolar.uat.edu.mx/Profesor/ControlAsistencia/BuscaSemanas
GET  https://administracionescolar.uat.edu.mx/Profesor/ControlAsistencia/BuscaAsistenciaGrupo
POST https://administracionescolar.uat.edu.mx/Profesor/ControlAsistencia/GuardaAsistencias
```

## Ejemplos curl

Crear sesion:

```bash
curl -X POST http://localhost:3100/api/uat/sessions \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"CORREO_USUARIO\",\"password\":\"PASSWORD_USUARIO\"}"
```

Consultar horarios:

```bash
curl "http://localhost:3100/api/uat/profesor/consultas/horarios?Id_Ciclo_Escolar=150&Id_DES=12" \
  -H "X-UAT-Session-Id: SESSION_ID"
```

Consultar examenes:

```bash
curl "http://localhost:3100/api/uat/profesor/consultas/examenes?Id_Ciclo_Escolar=150&Id_DES=12" \
  -H "X-UAT-Session-Id: SESSION_ID"
```

Flujo completo en una sola llamada, sin guardar sesion:

```bash
curl -X POST http://localhost:3100/api/uat/profesor/consultas/snapshot \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"CORREO_USUARIO\",\"password\":\"PASSWORD_USUARIO\",\"Id_Ciclo_Escolar\":150,\"Id_DES\":12,\"includeExamenes\":true}"
```

## Contrato

El contrato OpenAPI esta en:

```txt
docs/openapi.yaml
```

Endpoints incluidos:

```txt
GET    /health
POST   /api/uat/sessions
DELETE /api/uat/sessions/{sessionId}
GET    /api/uat/profesor/consultas/horarios
GET    /api/uat/profesor/consultas/examenes
POST   /api/uat/profesor/consultas/snapshot
GET    /api/uat/catalogos/niveles-educativos
GET    /api/uat/catalogos/campus
GET    /api/uat/catalogos/des
GET    /api/uat/catalogos/ciclos-escolares
GET    /api/uat/profesor/control-asistencia/grupos
GET    /api/uat/profesor/control-asistencia/semanas
GET    /api/uat/profesor/control-asistencia/asistencia-grupo
POST   /api/uat/profesor/control-asistencia/asistencias
POST   /api/uat/asistencia/guardar
GET    /api/coordinacion/resumen
GET    /api/coordinacion/coordinaciones
GET    /api/coordinacion/profesores
GET    /api/coordinacion/profesores/:teacherId/asignaciones
POST   /api/coordinacion/auth/login
GET    /api/coordinacion/auth/me
POST   /api/coordinacion/auth/logout
GET    /api/coordinacion/reportes/asistencia-semanal
```

## Arquitectura

El servicio quedo organizado por capas:

```txt
src/domain          Tipos UAT y contrato IUatSessionRepository
src/infrastructure  Axios + CookieJar, factory y store en memoria
src/application     UatService con casos de uso y snapshot
src/presentation    Controladores, hooks Fastify, schemas Zod y rutas
```

## Cosecha incremental para coordinacion

Cada `POST /api/uat/sessions` exitoso publica una sola vez el evento interno
`teacher.authenticated`. El listener se ejecuta fuera del camino de respuesta,
reutiliza el cliente UAT y sus cookies, descubre ciclos/DES y acumula profesores,
materias y grupos mediante `upsert` en Prisma. Un fallo de portal o persistencia
solo produce un log estructurado y no invalida la sesion del profesor.

Configura `DATABASE_URL` con la conexion PostgreSQL. Para desarrollo, crea o
actualiza el esquema y genera el cliente con:

```bash
npm run prisma:generate
npm run prisma:migrate
```

En produccion aplica exclusivamente las migraciones versionadas:

```bash
npm run prisma:generate
npm run prisma:deploy
```

La imagen de `backend-apirest` ejecuta las migraciones y el aprovisionamiento
opcional de coordinadores automaticamente antes de iniciar la API.

Provisiona o rota una cuenta de coordinación sin guardar su contraseña en el
frontend:

```powershell
$env:COORDINATOR_EMAIL="coordinacion@uat.edu.mx"
$env:COORDINATOR_NAME="Coordinación Académica"
$env:COORDINATOR_PASSWORD="una-clave-segura-de-12-caracteres"
npm run coordinator:create
```

Para varias cuentas define `COORDINATORS_JSON` como un arreglo de objetos con
`email`, `name` y `password`, y ejecuta el mismo comando. Omitir una cuenta del
arreglo no la elimina ni la deshabilita automaticamente.

Desde la terminal del contenedor en Dokploy se puede repetir el aprovisionamiento
con `npm run coordinator:create:production`; toma las variables actuales del
servicio y nunca imprime las contraseñas.

La SPA vive en `frontend-coord`. En desarrollo usa Vite y proxy a `:3100`; en
producción se sirve desde el contenedor independiente `frontend-coord` bajo
`/coordinacion`.

El listado admite `coordinationId`, `search`, `page` y `pageSize` (maximo 100).
Los contratos completos se encuentran en `docs/openapi.yaml`.

Las rutas protegidas usan el hook `authUatHook`, que lee `X-UAT-Session-Id`,
valida la sesion mediante `UatService` e inyecta `request.uatSession`.

## Flujo de asistencia

Consultar grupos del profesor por ciclo:

```bash
curl "http://localhost:3100/api/uat/profesor/control-asistencia/grupos?Id_Des=12&Id_Ciclo=150&Id_Plantilla=308127" \
  -H "X-UAT-Session-Id: SESSION_ID"
```

Consultar semanas de un grupo:

```bash
curl "http://localhost:3100/api/uat/profesor/control-asistencia/semanas?Id_Grupo=947699" \
  -H "X-UAT-Session-Id: SESSION_ID"
```

Consultar alumnos/asistencia de una semana:

```bash
curl "http://localhost:3100/api/uat/profesor/control-asistencia/asistencia-grupo?Id_Grupo=947699&fec_ini=19%2F01%2F2026&fec_fin=25%2F01%2F2026" \
  -H "X-UAT-Session-Id: SESSION_ID"
```

Guardar asistencias:

```bash
curl -X POST http://localhost:3100/api/uat/profesor/control-asistencia/asistencias \
  -H "Content-Type: application/json" \
  -H "X-UAT-Session-Id: SESSION_ID" \
  -d "{\"Id_Grupo\":947699,\"Fec_Ini\":\"19/01/2026\",\"Asistencia\":[{\"id_alumno\":371591,\"num_pase_lista\":1,\"num_dia\":1,\"sn_asistencia\":true}]}"
```

El backend serializa `Asistencia` como JSON comprimido y lo envia al portal UAT
en `application/x-www-form-urlencoded` contra
`/Profesor/ControlAsistencia/GuardaAsistencias`.

## Seeder de clases compartidas

Aplica primero las migraciones y luego crea dos profesores y una clase de prueba:

```powershell
npm run prisma:deploy
npm run seed:shared-class
```

## Cola durable de asistencias

`POST /api/uat/asistencia/lotes` persiste el lote completo en PostgreSQL y responde `202 Accepted`.
Un worker procesa una lista a la vez por profesor, reintenta errores transitorios con backoff y recupera jobs
interrumpidos. La clave `ATTENDANCE_JOB_ENCRYPTION_SECRET` cifra las credenciales necesarias para reautenticar
contra UAT; debe conservarse estable entre despliegues. El cliente puede consultar el lote y reconciliar sus
registros locales después de cerrar o reiniciar la aplicación.

Para probar el acceso con cuentas UAT reales:

```powershell
$env:SEED_PRIMARY_EMAIL="titular@uat.edu.mx"
$env:SEED_SECONDARY_EMAIL="profesor2@uat.edu.mx"
npm run seed:shared-class
```

El seeder es idempotente y deja la clase sin compartir. La asignacion se realiza
desde Coordinacion, en la seccion de clases compartidas. Por defecto usa el ciclo
`2026 - 1 PRIMAVERA` (`Id_Ciclo_Escolar=150`); puede sobrescribirse con
`SEED_CYCLE_NAME` y `SEED_CYCLE_EXTERNAL_ID`.

## Script CLI opcional

Para probar desde terminal sin levantar el servidor:

```bash
UAT_USER="CORREO_USUARIO" \
UAT_PASS="PASSWORD_USUARIO" \
UAT_ID_CICLO_ESCOLAR=150 \
UAT_ID_DES=12 \
npm run fetch:horarios
```

En PowerShell:

```powershell
$env:UAT_USER="CORREO_USUARIO"
$env:UAT_PASS="PASSWORD_USUARIO"
$env:UAT_ID_CICLO_ESCOLAR="150"
$env:UAT_ID_DES="12"
npm run fetch:horarios
```

## Errores esperados

`UAT_LOGIN_FAILED`: el login devolvio `exito: false`.

`UAT_SESSION_REQUIRED`: falta el header `X-UAT-Session-Id`.

`UAT_SESSION_NOT_FOUND`: la sesion local no existe o expiro.

`UAT_SESSION_EXPIRED`: el portal devolvio HTML/Login en vez de JSON.

`UAT_PORTAL_ERROR`: error de red, timeout, cookies faltantes o respuesta inesperada.

## Notas de seguridad

No guardes credenciales reales en `.env`, scripts versionados ni logs. Las cookies
se mantienen solo en memoria y se descartan al reiniciar el proceso. El TTL local
se controla con `UAT_SESSION_TTL_MINUTES`.
