# backend-apirest

API REST aislada para consumir endpoints internos del Sistema Administrativo
Escolar UAT usando autenticacion ASP.NET por cookies. No usa Bearer token:
cada login crea un `CookieJar` persistente en memoria con `ASP.NET_SessionId`,
`.ASPXAUTH` y las cookies adicionales que entregue el sitio.

## Instalacion

```bash
cd backend-apirest
npm install
cp .env.example .env
npm run dev
```

Por defecto escucha en `http://localhost:3100`.

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
```

## Arquitectura

El servicio quedo organizado por capas:

```txt
src/domain          Tipos UAT y contrato IUatSessionRepository
src/infrastructure  Axios + CookieJar, factory y store en memoria
src/application     UatService con casos de uso y snapshot
src/presentation    Controladores, hooks Fastify, schemas Zod y rutas
```

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
