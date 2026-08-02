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
implementaron Gateway, UAT Integration escalable, Identity y Academic; el
tráfico continúa en migración reversible mientras Attendance y Coordination se
extraen.

La migración se hará incrementalmente detrás de un API Gateway. El gateway
mantendrá los contratos públicos actuales mientras cada capacidad se extrae a
un servicio propietario.

## Hallazgos priorizados

| Prioridad | Hallazgo | Riesgo | Corrección |
|---|---|---|---|
| Resuelto | Las sesiones UAT vivían en un `Map` local de `backend-apirest`. | Una petición dirigida a otra réplica perdía la sesión ASP.NET. | Redis con TTL, CookieJar serializado y cifrado implementados. |
| Resuelto | `frontend-coord` enrutaba directamente a dos backends. | Los servicios quedaban expuestos y la topología se filtraba al cliente. | API Gateway configurado como único upstream web. |
| Resuelto | Los eventos de sincronización usaban `EventEmitter`. | Se perdían al reiniciar y no existía reintento o DLQ. | Outbox/inbox y RabbitMQ con reintentos y DLQ implementados. |
| P1 | `backend` posee identidad, datos académicos, asistencia, beacons, dispositivos y administración en una base. | Acoplamiento de despliegue y contención al escalar. | Extraer Identity, Academic y Attendance por propiedad de datos. |
| P1 | `backend-apirest` mezcla integración UAT, coordinación y reportes. | La carga externa de UAT afecta el dashboard. | Separar UAT Integration y Coordination Query. |
| P1 | La sincronización y la carga UAT dependen de llamadas HTTP entre servicios legados. | Acoplamiento temporal y fallos en cascada. | Comandos internos autenticados y eventos durables. |
| P1 | No hay contrato central de rutas y eventos. | Cambios incompatibles entre Flutter, web y backends. | Paquetes `contracts-http` y `contracts-events`, versionados y probados. |
| P2 | La observabilidad se limita a logs y `/health`. | No se conocen latencias, saturación ni fallos por dependencia. | Correlation ID, readiness, métricas Prometheus y logs estructurados. |
| P2 | El arranque de producción ejecuta migraciones y aprovisionamiento junto al servidor. | Varias réplicas pueden competir durante un despliegue. | Trabajo de migración único previo al despliegue. |

## Cobertura de requisitos

| Requisito | Estado auditado | Trabajo pendiente |
|---|---|---|
| Inicio de alumno sólo con cuenta UAT | Implementado; sesión cifrada en Redis e identidad emitida sólo tras validar UAT. | E2E contra entorno UAT autorizado. |
| Perfil, carrera, horario y calificaciones del alumno | Endpoints UAT existentes; perfil/carrera/horario se proyectan en Academic. | Caché de calificaciones y backfill/reconciliación. |
| Información del maestro desde UAT | Sesión Redis, rate limit, circuit breaker y snapshot académico diferencial implementados. | E2E contra entorno UAT autorizado. |
| Vincular matrícula, teléfono y UUID al iniciar sesión | Flujo implementado contra `backend`. | Consolidar propiedad en Attendance/Identity y auditoría de cambios. |
| UUID modificable sólo por coordinación | Endpoints administrativos protegidos existentes. | Convertir el cambio en comando auditado del servicio propietario. |
| Captura local aunque UAT esté fuera | Implementada en PostgreSQL. | Outbox en la misma transacción y pruebas de recuperación. |
| Actualización de asistencia en UAT | Worker y trabajos PostgreSQL existentes. | Eventos durables, DLQ y pruebas end-to-end. |
| Asistencia de profesores en dashboard | Reportes existentes. | Proyección de Coordination Query reconstruible. |
| Docker y Dokploy | Compose integral con red privada, bases/usuarios separados, healthchecks y migraciones one-shot. | Validarlo en un host con Docker/Dokploy y probar restauración. |
| Pruebas | Contratos, gateway, Identity, Academic, Redis, UAT y outbox tienen pruebas automatizadas. | Attendance, Coordination, migraciones reales y E2E de sistema. |

## Límites de servicio durante la migración

| Ruta pública | Propietario objetivo | Destino transitorio |
|---|---|---|
| `/api/uat/*` | UAT Integration | `backend-apirest` |
| `/api/coordinacion/*` | Coordination Query / comandos a propietarios | `backend-apirest` |
| `/auth/*`, `/professors/login` | Identity | `backend` |
| `/professors/*`, `/groups/*` | Academic | `backend` |
| `/attendance/*` | Attendance | `backend` |
| `/api/beacons/*`, `/api/student-device-bindings/*` | Attendance | `backend` |
| `/api/superUsuario/auth/*`, `/api/superUsuario/coordinadores/*` | Identity | `backend` |

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
