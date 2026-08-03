# Auditoría del backend de Presencia

**Fecha:** 2026-08-02

**Alcance:** `backend`, `backend-apirest`, `frontend-coord`, `app-profesor` y
`app-alumno`.

## Resumen ejecutivo

El sistema ya cubre buena parte del flujo funcional: autenticación contra los
portales UAT de maestros y alumnos, consulta de horarios y calificaciones,
captura local de asistencia, vinculación del alumno con un dispositivo y una
cola persistente de cargas hacia UAT. Sin embargo, los dos backends aún son
monolitos con responsabilidades superpuestas. Desde esta auditoría ya se
implementaron Gateway, UAT Integration escalable, Identity, Academic,
Attendance y Coordination Query. El tráfico conserva fachadas reversibles para
no romper Flutter ni la web mientras se observa el nuevo flujo en producción.

La migración se hará incrementalmente detrás de un API Gateway. El gateway
mantendrá los contratos públicos actuales mientras cada capacidad se extrae a
un servicio propietario.

## Hallazgos priorizados

| Prioridad | Hallazgo | Riesgo | Corrección |
|---|---|---|---|
| Resuelto | Las sesiones UAT vivían en un `Map` local de `backend-apirest`. | Una petición dirigida a otra réplica perdía la sesión ASP.NET. | Redis con TTL, CookieJar serializado y cifrado implementados. |
| Resuelto | `frontend-coord` enrutaba directamente a dos backends. | Los servicios quedaban expuestos y la topología se filtraba al cliente. | API Gateway configurado como único upstream web. |
| Resuelto | Los eventos de sincronización usaban `EventEmitter`. | Se perdían al reiniciar y no existía reintento o DLQ. | Outbox/inbox y RabbitMQ con reintentos y DLQ implementados. |
| Resuelto en runtime | `backend` poseía identidad, datos académicos, asistencia, beacons, dispositivos y administración en una base. | Acoplamiento de despliegue y contención al escalar. | Identity posee cuentas y sesiones del personal; Academic posee carga/clases compartidas; Attendance posee beacons, dispositivos y telemetría BLE. Las fachadas móviles y herramientas debug heredadas están retiradas; la imagen y base antiguas sólo alimentan imports one-shot hasta validar el despliegue. |
| Resuelto | `backend-apirest` mezclaba integración UAT, coordinación, reportes y una segunda proyección académica. | La carga externa de UAT afectaba el dashboard y dos bases competían como fuente de verdad. | Coordination Query posee el read model; Academic recibe el único snapshot de profesor/alumno; UAT Integration ya no escribe profesores, materias, coordinaciones ni grupos en tablas locales. |
| Resuelto | La sincronización y la carga UAT dependían de llamadas HTTP entre servicios legados. | Acoplamiento temporal y fallos en cascada. | Comandos internos autenticados, outbox/inbox, RabbitMQ, reintentos y DLQ. |
| Resuelto | No había contrato central de rutas y eventos. | Cambios incompatibles entre Flutter, web y backends. | Paquetes `contracts-http` y `contracts-events`, versionados y probados. |
| Resuelto | La app del profesor persistía en Hive una contraseña UAT en texto plano bajo el nombre `encrypted_password`. | Exposición de la cuenta institucional si se extraía el almacenamiento del dispositivo. | Migración que elimina la clave heredada; la credencial sólo vive en memoria durante el proceso y se solicita nuevamente tras reiniciar. |
| Resuelto | La app del profesor persistía identificadores de sesión en Hive y mantenía una segunda sesión contra el monolito. | Robo de sesión y dos autoridades activas para una misma persona. | La sesión UAT se migra a Keychain/Keystore; el token paralelo, incluso si estaba en almacenamiento seguro, se elimina y el logout revoca Redis/Identity antes de limpiar el equipo. |
| Mitigado | La observabilidad se limitaba a logs y `/health`. | No se conocían latencias, saturación ni fallos por dependencia. | Correlation/trace ID, readiness por dependencia, métricas Prometheus protegidas en los seis servicios HTTP, logs estructurados y reglas de alerta versionadas; falta conectar el colector y Alertmanager en el host. |
| Resuelto | El arranque de producción ejecutaba migraciones y aprovisionamiento junto al servidor. | Varias réplicas podían competir durante un despliegue. | Jobs de migración/aprovisionamiento únicos antes de las réplicas HTTP. |

## Cobertura de requisitos

| Requisito | Estado auditado | Trabajo pendiente |
|---|---|---|
| Inicio de alumno sólo con cuenta UAT | Implementado; sesión cifrada en Redis e identidad emitida sólo tras validar UAT. | E2E contra entorno UAT autorizado. |
| Perfil, carrera, horario y calificaciones del alumno | Endpoints UAT existentes; perfil/carrera/horario se proyectan en Academic. | Caché de calificaciones y backfill/reconciliación. |
| Información del maestro desde UAT | Sesión Redis, rate limit, circuit breaker y snapshot académico diferencial implementados. | E2E contra entorno UAT autorizado. |
| Resincronización solicitada por el maestro | La app reutiliza `X-UAT-Session-Id`; `POST /api/uat/profesor/sync` publica una nueva cosecha mediante outbox/RabbitMQ sin reenviar contraseña. | Medir el tiempo de convergencia de Academic en el host. |
| Vincular matrícula, teléfono y UUID al iniciar sesión | Attendance es propietario; el alta sólo ocurre después de autenticar UAT y entrega token acotado. | E2E en dispositivos Android/iOS reales. |
| UUID modificable sólo por coordinación | Comando privado auditado; el alumno sólo puede repetir el vínculo exacto y requiere desvinculación previa para cambiarlo. | Verificar el flujo con una cuenta de coordinación desplegada. |
| Captura local aunque UAT esté fuera | La telemetría crea un borrador `DRAFT`; sólo la finalización transaccional cambia a `PENDING` y crea el outbox UAT. | Prueba de caos en el host Docker. |
| Actualización de asistencia en UAT | Consumidor durable, credenciales cifradas, reintentos, DLQ y resultado versionado. | E2E con cuenta UAT autorizada. |
| Asistencia de profesores en dashboard | Proyección reconstruible por eventos y reconciliación de snapshots. | Medir lag y fijar alerta. |
| Docker y Dokploy | Compose integral con red privada, egreso UAT aislado, bases/usuarios separados, healthchecks, migraciones one-shot, validador y smoke test. | Validarlo en un host Dokploy y ensayar restauración. |
| Pruebas | Contratos, Gateway, Identity, Academic, Attendance, Coordination Query, Redis, UAT, outbox, clientes BFF, web y apps Flutter tienen pruebas automatizadas; CI levanta PostgreSQL/RabbitMQ y el stack completo. | E2E UAT autorizado y dispositivos físicos. |

## Límites de servicio durante la migración

| Ruta pública | Propietario objetivo | Destino transitorio |
|---|---|---|
| `/api/uat/*` | UAT Integration | `backend-apirest` |
| `/api/coordinacion/*` | Coordination Query / comandos a propietarios | BFF `backend-apirest`, con lecturas delegadas |
| `/auth/*`, `/professors/*`, `/groups/*` | Retiradas | Sin referencias en Flutter vigente; el Gateway responde 404 y no permite reactivarlas mediante override |
| `/attendance/*` | Retirada | El Gateway responde 404; captura vigente usa `/api/uat/asistencia/*` y Attendance |
| `/api/uat/profesor/presencia/*` | Attendance | BFF UAT autentica al profesor y delega entrada, salida y detecciones sin elevar autorización |
| `/api/uat/profesor/beacons/resolve` | Attendance | BFF UAT; valida la sesión institucional y delega resolución/autorización al propietario Attendance |
| `/api/beacons/*`, `/api/student-attendance/*` | Retiradas | El Gateway responde 404; la app vigente usa sesión UAT y comandos de Attendance |
| `/api/student-device-bindings/*` | Attendance | Corte completado; Gateway enruta al propietario y la lectura del profesor pasa por sesión UAT + roster |
| `/api/superUsuario/auth/*`, `/api/superUsuario/coordinadores/*` | Identity | BFF `backend-apirest`; cuentas históricas se importan una sola vez y su tabla anterior queda sin CRUD runtime |
| `/api/superUsuario/beacons/*`, `/api/superUsuario/alumnos-vinculados/*` | Attendance | BFF `backend-apirest` autentica con Identity y delega comandos auditados |

Las rutas `/internal/*` nunca se publicarán en el gateway. Sólo estarán
disponibles en la red privada y requerirán token de servicio.

## Criterios de salida

La migración no se considerará terminada hasta demostrar:

1. dos réplicas por servicio sin afinidad de sesión;
2. captura de asistencia durante una caída simulada de UAT;
3. reintento exitoso y DLQ verificable al restaurar dependencias;
4. contratos HTTP y de eventos compatibles con los tres clientes;
5. bases y credenciales separadas por servicio;
6. restauración desde backups y migración reproducible;
7. pruebas unitarias, de integración, contrato y E2E en CI;
8. despliegue de Docker Compose validado para Dokploy sin exponer servicios
   internos.
