# Modo demo de Presencia

El modo demo permite presentar el flujo completo con cuentas institucionales y
datos académicos reales de la UAT, sin escribir asistencias en sus portales. Se
activa en el entorno del backend y conserva los contratos REST que consumen las
aplicaciones móviles.

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

UAT Integration mantiene conectados sus clientes de maestros y alumnos a los
hosts configurados en `UAT_BASE_URL` y `UAT_ALUMNOS_BASE_URL`, también cuando el
modo demo está activo. Por ello, el inicio de sesión y las consultas académicas
requieren cuentas UAT válidas. Attendance fuerza todas las capturas a
`SKIPPED` y UAT Integration no inicia el worker de subida, por lo que ninguna
asistencia se envía a UAT.

El Compose conserva `demo-portal-service` únicamente en la red privada para el
catálogo y las simulaciones administrativas. Ese servicio ya no sustituye la
autenticación de las aplicaciones móviles.

## Preparar una demostración

1. Entra a `/coordinacion/superUsuario` con la contraseña maestra del proyecto
   demo y abre la sección **Debug**.
2. Inicia sesión en las apps con cuentas institucionales UAT válidas. El
   backend autentica y consulta los portales reales, informa que la aplicación
   está en demo y la app del profesor puede usar detección de salón simulada.
3. Si necesitas datos totalmente controlados para una presentación sin usar
   las apps, crea profesores, alumnos, materias y padrones ficticios desde el
   panel y pulsa **Sincronizar datos**.
4. Verifica que las materias y los padrones esperados estén proyectados en
   Academic, Attendance y Coordination Query.
5. Registra una asistencia desde la app. Debe conservarse localmente con estado
   `SKIPPED`; no debe crearse ni procesarse un trabajo de subida a UAT.
6. Para una demostración sin teléfonos, selecciona fecha y estado en el panel y
   pulsa **Simular**. Se crea una captura real en Attendance, se proyecta hacia
   Coordination Query y permanece dentro del entorno demo.

El seed inicial sigue creando un catálogo ficticio para las simulaciones del
panel. Sus cuentas usan `PRESENCIA_DEMO_DEFAULT_PASSWORD`, pero no sirven para
iniciar sesión en las apps: éstas siempre validan las credenciales en UAT. El
valor concreto debe mantenerse sólo en los secretos del proyecto demo.

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
el hostname de los portales. El BFF decide qué operaciones son de sólo lectura
y evita encolar la escritura de asistencias cuando la captura queda `SKIPPED`.

## Aislamiento y operación

- `demo-portal-service` no publica puertos, no se conecta a `uat-egress` y debe
  ejecutarse con una sola réplica porque serializa las mutaciones de su catálogo.
- El catálogo se persiste en Redis para sobrevivir reinicios del contenedor.
- Las proyecciones de Academic, Attendance y Coordination Query se guardan en
  las bases del proyecto demo; por eso los volúmenes nunca deben compartirse
  con producción.
- Desactivar el flag oculta todas las rutas de administración demo y vuelve a
  habilitar el worker de subida de asistencias en el siguiente despliegue. No
  convierte ni sube retroactivamente datos demo.
- Para comenzar desde cero, usa **Borrar datos demo** en la sección Debug. La
  confirmación escrita elimina catálogo, identidades no administrativas,
  sesiones UAT almacenadas, vínculos, beacons, asistencias y proyecciones. No
  elimina migraciones, cuentas coordinadoras ni la cuenta de superusuario.
- La operación está protegida en cada microservicio: aunque se invocara una
  ruta interna directamente, responde `404` cuando `PRESENCIA_DEBUG_MODE` no
  está activo.
