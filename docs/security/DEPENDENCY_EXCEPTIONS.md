# Excepciones temporales de dependencias

## React Router `GHSA-qwww-vcr4-c8h2`

- Registrada: 2026-08-02.
- Paquete: `react-router-dom` / `react-router` 7.18.2.
- Aviso: bypass CSRF en el modo RSC Action/Server Action.
- Estado del registro al auditar: no existe una versión publicada que cierre
  simultáneamente este aviso y los avisos anteriores de la línea 7.11.

El dashboard de Presencia es una SPA estática compilada con Vite y servida por
Nginx. No usa React Server Components, loaders/actions de servidor, SSR ni el
runtime de React Router en el backend. Por ello la ruta vulnerable descrita por
el aviso no está presente en el producto desplegado.

Controles compensatorios:

- la API usa cookies `HttpOnly`, `Secure` y `SameSite=Strict`;
- Nginx aplica CSP, `frame-ancestors 'none'`, `form-action 'self'` y
  `X-Frame-Options: DENY`;
- sólo el Gateway es accesible desde la web y bloquea `/internal/*`;
- React Router queda fijado en 7.18.2 para evitar una resolución automática a
  otra versión vulnerable conocida.

Revisar este aviso en cada actualización de dependencias y eliminar la
excepción tan pronto se publique una versión segura compatible. Esta excepción
no autoriza introducir RSC, SSR ni acciones de React Router sin una nueva
revisión de seguridad.
