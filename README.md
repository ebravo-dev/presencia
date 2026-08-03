# Presencia

Monorepo del proyecto de asistencia UAT.

## Estructura

```txt
presencia/
|- app-alumno/
|- app-profesor/
|- backend/
|- backend-apirest/
`- frontend-coord/
```

## backend-apirest

`backend-apirest` es el backend puente/ACL entre `app-profesor` y el portal
UAT. No reemplaza al sistema escolar original; consume por HTTP la API/sitio de
`https://administracionescolar.uat.edu.mx` usando sesion ASP.NET basada en
cookies.

## Despliegue de coordinacion en Dokploy

El archivo `compose.coordination.yaml` levanta dos contenedores independientes:

- `backend-apirest`: API, migraciones Prisma y provision de coordinadores.
- `frontend-coord`: Nginx con la SPA y proxy interno de `/api`.

Configuracion recomendada:

```txt
Build Type: Docker Compose
Compose Path: compose.coordination.yaml
Root Directory / Base Directory: raiz del repositorio
```

Asigna el dominio web a `frontend-coord`, puerto `8080`. Si otras aplicaciones
consumen directamente la API, asigna tambien su dominio a `backend-apirest`,
puerto `3100`.

Ambos contenedores se conectan a la red externa `dokploy-network`, necesaria
para que Traefik enrute los dominios y para alcanzar servicios administrados
por Dokploy, como PostgreSQL, mediante su hostname interno.

Copia las variables de `.env.example` al apartado Environment de Dokploy. Para
el primer coordinador usa:

```env
COORDINATOR_EMAIL=coordinacion@uat.edu.mx
COORDINATOR_NAME=Coordinacion Academica
COORDINATOR_PASSWORD=contra123
```

Para varios coordinadores usa `COORDINATORS_JSON`; cada despliegue realiza UPSERT
por correo, por lo que permite agregar usuarios o rotar contraseñas sin
duplicados.

## Integraciones

- `app-profesor` consume `https://backendapirest.149828.xyz`
- `backend-apirest` consume `https://administracionescolar.uat.edu.mx`

## Referencias

- `backend-apirest/README.md`
- `backend-apirest/docs/openapi.yaml`
