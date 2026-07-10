# Frontend de Coordinación Académica

SPA React 19 para auditar la ingesta académica, revisar asignaciones por grupo y
consultar cumplimiento semanal de asistencia docente.

```bash
npm install
npm run dev
```

Vite abre `http://localhost:5173/coordinacion/` y redirige `/api` a
`http://localhost:3100`. El build de producción usa base `/coordinacion/`:

```bash
npm run build
```

La autenticación usa exclusivamente una cookie JWT `HttpOnly`; Zustand conserva
el perfil visible pero nunca tokens. Las exportaciones Excel/PDF se cargan bajo
demanda para no penalizar el dashboard.

## Docker y Dokploy

En produccion la SPA se ejecuta en su propio contenedor Nginx, puerto `8080`.
El `compose.coordination.yaml` de la raiz crea `frontend-coord` y
`backend-apirest` en
la misma red. Nginx reenvia `/api` al hostname interno configurado en
`BACKEND_API_UPSTREAM`; `backend-apirest` atiende tambien `/api/superUsuario`
y aplica fallback SPA para `/coordinacion`.

En Dokploy asigna el dominio publico del panel al servicio
`frontend-coord:8080`; el proxy entre ambos contenedores permanece privado.
