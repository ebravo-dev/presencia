# Presencia

Monorepo del proyecto de asistencia UAT.

## Estructura

```txt
presencia/
|- app-alumno/
|- app-profesor/
|- backend/
`- backend-apirest/
```

## backend-apirest

`backend-apirest` es el backend puente/ACL entre `app-profesor` y el portal
UAT. No reemplaza al sistema escolar original; consume por HTTP la API/sitio de
`https://administracionescolar.uat.edu.mx` usando sesion ASP.NET basada en
cookies.

## Despliegue en Dokploy

Este servicio debe desplegarse de forma aislada, apuntando a la carpeta
`backend-apirest`.

Configuracion recomendada:

```txt
Build Type: Dockerfile
Root Directory / Base Directory: backend-apirest
Dockerfile Path: Dockerfile
Internal Port: 3100
Public Domain: https://backendapirest.149828.xyz
```

Alternativa valida:

```txt
Build Type: Nixpacks
Root Directory / Base Directory: backend-apirest
Internal Port: 3100
```

Si Dokploy intenta construir la raiz del repositorio, Nixpacks fallara porque
el repo contiene varias aplicaciones.

## Integraciones

- `app-profesor` consume `https://backendapirest.149828.xyz`
- `backend-apirest` consume `https://administracionescolar.uat.edu.mx`

## Referencias

- `backend-apirest/README.md`
- `backend-apirest/docs/openapi.yaml`
