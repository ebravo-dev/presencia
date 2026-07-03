# AsistenciaMas Backend

Backend API para el sistema de captura de asistencia de la UAT.

## Stack Tecnológico

- **Runtime**: Node.js 20 LTS
- **Framework**: Fastify
- **Lenguaje**: TypeScript
- **Base de Datos**: PostgreSQL 16
- **ORM**: Prisma
- **Cola**: BullMQ + Redis
- **Scraping**: Playwright

## Requisitos

- Node.js 20+
- Docker y Docker Compose
- Una cuenta de profesor UAT para pruebas

## Desarrollo Local

### 1. Instalar dependencias

```bash
cd backend
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus valores
```

### 3. Generar clave RSA (si no tienes)

```bash
# Generar clave privada
openssl genpkey -algorithm RSA -out private.pem -pkeyopt rsa_keygen_bits:4096

# Generar clave pública (para la app Flutter)
openssl rsa -pubout -in private.pem -out public.pem

# Codificar clave privada en base64 para .env
base64 -i private.pem | tr -d '\n'
```

### 4. Levantar servicios con Docker

```bash
# Desde el directorio raíz del proyecto
docker-compose up -d postgres redis
```

### 5. Ejecutar migraciones

```bash
npm run db:push
# o para crear migración formal
npm run db:migrate
```

### 6. Iniciar servidor de desarrollo

```bash
npm run dev
```

El servidor estará disponible en `http://localhost:3000`

## Endpoints API

### Autenticación

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/professors/register` | Registro de profesor |
| POST | `/professors/login` | Login de profesor |

### Profesores (requiere JWT)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/professors/me` | Perfil del profesor |
| GET | `/professors/classes` | Grupos del profesor |
| GET | `/professors/sync-status` | Estado de sincronización |

### Grupos (requiere JWT)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/groups/:id` | Detalle de un grupo |
| GET | `/groups/:id/students` | Alumnos de un grupo |

### Asistencia (requiere JWT)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/attendance` | Registrar asistencia |
| GET | `/attendance/:groupId/history` | Historial de asistencia |
| GET | `/attendance/:groupId/summary` | Resumen estadístico |

## Deploy con Docker

```bash
# Construir y levantar todos los servicios
docker-compose up -d --build

# Ver logs
docker-compose logs -f api

# Detener
docker-compose down
```

## Deploy en Dokploy

Usa el archivo `docker-compose.dokploy.yml` como compose del servicio de API.
PostgreSQL y Redis se crean como servicios separados en Dokploy y se conectan
por variables de entorno.

Configuración recomendada en Dokploy:

| Campo | Valor |
|-------|-------|
| Compose path | `backend/docker-compose.dokploy.yml` |
| Build context | `backend` |
| Puerto interno | `3000` |
| Healthcheck | `/health` |
| Dashboard | `/admin/` |

Variables requeridas:

```bash
DATABASE_URL=postgresql://user:password@postgres-host:5432/presencia?schema=public
REDIS_URL=redis://redis-host:6379
BACKEND_API_REST_URL=http://backend-apirest-host:3100
JWT_SECRET=un-secreto-largo-minimo-32-caracteres
JWT_EXPIRES_IN=7d
RSA_PRIVATE_KEY=clave-privada-rsa-en-base64
UAT_PORTAL_URL=https://administracionescolar.uat.edu.mx
APP_PORT=3000
```

Puedes partir de `.env.dokploy.example`. Al iniciar, el contenedor ejecuta
`prisma migrate deploy` automáticamente contra `DATABASE_URL` antes de levantar
la API. Redis se usa por BullMQ mediante `REDIS_URL`. Las rutas `/api/uat/*`
se reenvían a `BACKEND_API_REST_URL`, que debe apuntar al servicio interno
`backend-apirest`.

Para generar `RSA_PRIVATE_KEY`:

```bash
openssl genpkey -algorithm RSA -out private.pem -pkeyopt rsa_keygen_bits:4096
base64 -w 0 private.pem
```

Después de desplegar, configura las apps con:

```bash
PRESENCIA_API_BASE_URL=https://tu-dominio-de-dokploy
```

## Variables de Entorno

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DATABASE_URL` | URL de PostgreSQL | `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | URL de Redis | `redis://localhost:6379` |
| `BACKEND_API_REST_URL` | URL interna de backend-apirest | `http://backend-apirest:3100` |
| `JWT_SECRET` | Secreto para JWT (min 32 chars) | `tu-secreto-muy-largo` |
| `JWT_EXPIRES_IN` | Duración del token | `7d` |
| `RSA_PRIVATE_KEY` | Clave privada RSA (base64) | `...` |
| `PORT` | Puerto del servidor | `3000` |
| `NODE_ENV` | Entorno | `development` / `production` |

## Seguridad

⚠️ **Las contraseñas de profesores NUNCA se almacenan.**

El flujo de seguridad:
1. App Flutter encripta la contraseña con RSA (clave pública)
2. Backend descifra con clave privada
3. Se usa temporalmente para hacer scraping a UAT
4. Se descarta inmediatamente de memoria
5. Solo se almacena el JWT para autenticación futura
