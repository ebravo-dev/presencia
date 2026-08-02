# Auditoría del backend de Presencia

**Fecha:** 2026-08-02

**Alcance:** `backend`, `backend-apirest`, `frontend-coord`, `app-profesor` y
`app-alumno`.

## Resumen ejecutivo

El sistema ya cubre buena parte del flujo funcional: autenticación contra los
portales UAT de maestros y alumnos, consulta de horarios y calificaciones,
captura local de asistencia, vinculación del alumno con un dispositivo y una
cola persistente de cargas hacia UAT. Sin embargo, los dos backends aún son
monolitos con responsabilidades superpuestas y no pueden escalar todas sus
réplicas con seguridad.

La migración se hará incrementalmente detrás de un API Gateway. El gateway
mantendrá los contratos públicos actuales mientras cada capacidad se extrae a
un servicio propietario.

## Hallazgos priorizados

| Prioridad | Hallazgo | Riesgo | Corrección |
|---|---|---|---|
| P0 | Las sesiones UAT viven en un `Map` local de `backend-apirest`. | Una petición dirigida a otra réplica pierde la sesión ASP.NET. | Redis con TTL, CookieJar serializado y cifrado. |
| P0 | `frontend-coord` enruta directamente a dos backends. | Los servicios quedan expuestos y la topología se filtra al cliente. | API Gateway como único punto público. |
| P0 | Los eventos de sincronización usan `EventEmitter`. | Se pierden al reiniciar y no existe reintento o DLQ. | Outbox transaccional y RabbitMQ con consumidores idempotentes. |
| P1 | `backend` posee identidad, datos académicos, asistencia, beacons, dispositivos y administración en una base. | Acoplamiento de despliegue y contención al escalar. | Extraer Identity, Academic y Attendance por propiedad de datos. |
| P1 | `backend-apirest` mezcla integración UAT, coordinación y reportes. | La carga externa de UAT afecta el dashboard. | Separar UAT Integration y Coordination Query. |
| P1 | La sincronización y la carga UAT dependen de llamadas HTTP entre servicios legados. | Acoplamiento temporal y fallos en cascada. | Comandos internos autenticados y eventos durables. |
| P1 | No hay contrato central de rutas y eventos. | Cambios incompatibles entre Flutter, web y backends. | Paquetes `contracts-http` y `contracts-events`, versionados y probados. |
| P2 | La observabilidad se limita a logs y `/health`. | No se conocen latencias, saturación ni fallos por dependencia. | Correlation ID, readiness, métricas Prometheus y logs estructurados. |
| P2 | El arranque de producción ejecuta migraciones y aprovisionamiento junto al servidor. | Varias réplicas pueden competir durante un despliegue. | Trabajo de migración único previo al despliegue. |

## Cobertura de requisitos

| Requisito | Estado auditado | Trabajo pendiente |
|---|---|---|
| Inicio de alumno sólo con cuenta UAT | Implementado en `backend-apirest`. | Persistir la sesión en Redis y pruebas de contrato con UAT simulada. |
| Perfil, carrera, horario y calificaciones del alumno | Endpoints existentes bajo `/api/uat/alumnos`. | Contratos versionados y caché tolerante a caída de UAT. |
| Información del maestro desde UAT | Endpoints existentes bajo `/api/uat/profesor`. | Persistencia distribuida de sesión, rate limit y circuit breaker. |
| Vincular matrícula, teléfono y UUID al iniciar sesión | Flujo implementado contra `backend`. | Consolidar propiedad en Attendance/Identity y auditoría de cambios. |
| UUID modificable sólo por coordinación | Endpoints administrativos protegidos existentes. | Convertir el cambio en comando auditado del servicio propietario. |
| Captura local aunque UAT esté fuera | Implementada en PostgreSQL. | Outbox en la misma transacción y pruebas de recuperación. |
| Actualización de asistencia en UAT | Worker y trabajos PostgreSQL existentes. | Eventos durables, DLQ y pruebas end-to-end. |
| Asistencia de profesores en dashboard | Reportes existentes. | Proyección de Coordination Query reconstruible. |
| Docker y Dokploy | Docker parcial y un compose legado. | Compose integral, red privada, healthchecks y migraciones one-shot. |
| Pruebas | Cobertura parcial. | Contratos, gateway, Redis, integración, migraciones y E2E. |

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
