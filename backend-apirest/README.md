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
```

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
