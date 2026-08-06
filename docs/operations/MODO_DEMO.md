# Modo demo de Presencia

El modo demo permite presentar el flujo completo sin depender de datos ni
disponibilidad de los portales reales de la UAT. Se activa en el entorno del
backend y conserva los contratos REST que consumen las aplicaciones móviles.

## Activación segura

Usa un proyecto Dokploy separado, con sus propios volúmenes de PostgreSQL,
Redis y RabbitMQ. No cambies el flag dentro de un despliegue productivo ya
existente.

```env
DEPLOYMENT_ENVIRONMENT=demo
PRESENCIA_DEBUG_MODE=true
PRESENCIA_DEMO_DEFAULT_PASSWORD=<contraseña-exclusiva-para-cuentas-ficticias>
DEMO_SESSION_SECRET=<secreto-aleatorio-de-al-menos-32-caracteres>
PRESENCIA_DEMO_CYCLE_ID=152
PRESENCIA_DEMO_CYCLE_NAME=2026-3
PRESENCIA_DEMO_COORDINATION_ID=12
PRESENCIA_DEMO_COORDINATION_NAME=Coordinación Demo
```

`PRESENCIA_DEBUG_MODE` es el interruptor funcional. El validador exige además
`DEPLOYMENT_ENVIRONMENT=demo` para impedir una activación accidental sobre un
proyecto identificado como producción:

```bash
node infra/scripts/validate-dokploy-env.mjs infra/compose/.env.dokploy
docker compose --env-file infra/compose/.env.dokploy \
  -f infra/compose/docker-compose.microservices.yml config --quiet
```

El Compose inicia `demo-portal-service` únicamente en la red privada. UAT
Integration cambia sus clientes de maestros y alumnos a ese servicio y no usa
los hosts institucionales. Attendance fuerza todas las capturas a `SKIPPED`,
por lo que ningún worker intenta subirlas a UAT.

## Preparar una demostración

1. Entra a `/coordinacion/superUsuario` con la contraseña maestra del proyecto
   demo y abre la sección **Debug**.
2. Crea o usa profesores y alumnos ficticios. Las contraseñas sólo se reciben
   al crear o rotar una cuenta; nunca se devuelven en las APIs ni en el panel.
3. Crea una materia, selecciona profesor, salón, beacon y horario.
4. Asigna alumnos al padrón de la materia.
5. Pulsa **Sincronizar datos**. El BFF publica snapshots en Academic y aplica el
   roster autoritativo en Attendance.
6. Inicia sesión en las apps con las cuentas ficticias. El backend les informa
   que están en demo; ambas muestran un aviso y la app del profesor puede usar
   detección de salón simulada.
7. Para una demostración sin teléfonos, selecciona fecha y estado en el panel y
   pulsa **Simular**. Se crea una captura real en Attendance, se proyecta hacia
   Coordination Query y queda registrada en el portal simulado.

El seed inicial crea una cuenta ficticia de profesor, una de alumno y una
materia. Todas usan `PRESENCIA_DEMO_DEFAULT_PASSWORD`; el valor concreto debe
mantenerse sólo en los secretos del proyecto demo.

## API administrativa

Todas estas rutas pasan por el Gateway, requieren la sesión `SUPER_USER` y
responden `404 DEBUG_MODE_DISABLED` cuando el flag está apagado:

| Recurso | Rutas |
|---|---|
| Estado y catálogo | `GET /api/superUsuario/debug/status`, `GET /api/superUsuario/debug/catalog` |
| Profesores | `GET/POST /api/superUsuario/debug/teachers`, `PUT/DELETE /api/superUsuario/debug/teachers/:id` |
| Alumnos | `GET/POST /api/superUsuario/debug/students`, `PUT/DELETE /api/superUsuario/debug/students/:id` |
| Materias | `GET/POST /api/superUsuario/debug/classes`, `PUT/DELETE /api/superUsuario/debug/classes/:id` |
| Padrón | `POST /api/superUsuario/debug/classes/:id/students`, `DELETE /api/superUsuario/debug/classes/:id/students/:studentId` |
| Prueba | `POST /api/superUsuario/debug/classes/:id/simulate-attendance`, `POST /api/superUsuario/debug/synchronize` |
| Evidencia | `GET /api/superUsuario/debug/student-attendance`, `GET /api/superUsuario/debug/flow-logs` |
| Reinicio | `DELETE /api/superUsuario/debug/data` con `{ "confirmation": "BORRAR DEMO" }` |

Las aplicaciones siguen usando `/api/uat/*`; no conocen las rutas internas ni
el hostname del portal simulado.

## Aislamiento y operación

- `demo-portal-service` no publica puertos, no se conecta a `uat-egress` y debe
  ejecutarse con una sola réplica porque serializa las mutaciones de su catálogo.
- El catálogo se persiste en Redis para sobrevivir reinicios del contenedor.
- Las proyecciones de Academic, Attendance y Coordination Query se guardan en
  las bases del proyecto demo; por eso los volúmenes nunca deben compartirse
  con producción.
- Desactivar el flag oculta todas las rutas de administración demo y restaura
  los clientes UAT reales en el siguiente despliegue. No convierte datos demo
  en datos reales.
- Para comenzar desde cero, usa **Borrar datos demo** en la sección Debug. La
  confirmación escrita elimina catálogo, identidades no administrativas,
  sesiones UAT simuladas, vínculos, beacons, asistencias y proyecciones. No
  elimina migraciones, cuentas coordinadoras ni la cuenta de superusuario.
- La operación está protegida en cada microservicio: aunque se invocara una
  ruta interna directamente, responde `404` cuando `PRESENCIA_DEBUG_MODE` no
  está activo.
