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
| Mitigado | `backend` poseía identidad, datos académicos, asistencia, beacons, dispositivos y administración en una base. | Acoplamiento de despliegue y contención al escalar. | Identity, Academic y Attendance tienen bases propias; configuración de beacons y dispositivos ya pertenecen a Attendance. Telemetría BLE y sustituciones conservan compatibilidad temporal. |
| Resuelto | `backend-apirest` mezclaba integración UAT, coordinación y reportes. | La carga externa de UAT afectaba el dashboard. | Coordination Query posee un read model reconstruible y el BFF delega las lecturas. |
| Resuelto | La sincronización y la carga UAT dependían de llamadas HTTP entre servicios legados. | Acoplamiento temporal y fallos en cascada. | Comandos internos autenticados, outbox/inbox, RabbitMQ, reintentos y DLQ. |
| Resuelto | No había contrato central de rutas y eventos. | Cambios incompatibles entre Flutter, web y backends. | Paquetes `contracts-http` y `contracts-events`, versionados y probados. |
| Resuelto | La app del profesor persistía en Hive una contraseña UAT en texto plano bajo el nombre `encrypted_password`. | Exposición de la cuenta institucional si se extraía el almacenamiento del dispositivo. | Migración que elimina la clave heredada; la credencial sólo vive en memoria durante el proceso y se solicita nuevamente tras reiniciar. |
| Resuelto | La app del profesor persistía identificadores de sesión en Hive. | Robo de sesión si se extraía el almacenamiento local de la aplicación. | Migración automática a Keychain/Keystore mediante almacenamiento seguro nativo y eliminación de las claves heredadas. |
| Mitigado | La observabilidad se limitaba a logs y `/health`. | No se conocían latencias, saturación ni fallos por dependencia. | Correlation/trace ID, readiness por dependencia, métricas Prometheus y logs estructurados; falta conectar un colector/alertas en el host. |
| Resuelto | El arranque de producción ejecutaba migraciones y aprovisionamiento junto al servidor. | Varias réplicas podían competir durante un despliegue. | Jobs de migración/aprovisionamiento únicos antes de las réplicas HTTP. |

## Cobertura de requisitos

| Requisito | Estado auditado | Trabajo pendiente |
|---|---|---|
| Inicio de alumno sólo con cuenta UAT | Implementado; sesión cifrada en Redis e identidad emitida sólo tras validar UAT. | E2E contra entorno UAT autorizado. |
| Perfil, carrera, horario y calificaciones del alumno | Endpoints UAT existentes; perfil/carrera/horario se proyectan en Academic. | Caché de calificaciones y backfill/reconciliación. |
| Información del maestro desde UAT | Sesión Redis, rate limit, circuit breaker y snapshot académico diferencial implementados. | E2E contra entorno UAT autorizado. |
| Vincular matrícula, teléfono y UUID al iniciar sesión | Attendance es propietario; el alta sólo ocurre después de autenticar UAT y entrega token acotado. | E2E en dispositivos Android/iOS reales. |
| UUID modificable sólo por coordinación | Comando privado auditado; el alumno sólo puede repetir el vínculo exacto y requiere desvinculación previa para cambiarlo. | Verificar el flujo con una cuenta de coordinación desplegada. |
| Captura local aunque UAT esté fuera | Transacción serializable con idempotencia y outbox en la misma base. | Prueba de caos en el host Docker. |
| Actualización de asistencia en UAT | Consumidor durable, credenciales cifradas, reintentos, DLQ y resultado versionado. | E2E con cuenta UAT autorizada. |
| Asistencia de profesores en dashboard | Proyección reconstruible por eventos y reconciliación de snapshots. | Medir lag y fijar alerta. |
| Docker y Dokploy | Compose integral con red privada, egreso UAT aislado, bases/usuarios separados, healthchecks, migraciones one-shot, validador y smoke test. | Validarlo en un host Dokploy y ensayar restauración. |
| Pruebas | Contratos, Gateway, Identity, Academic, Attendance, Coordination Query, Redis, UAT, outbox, clientes BFF, web y apps Flutter tienen pruebas automatizadas; CI levanta PostgreSQL/RabbitMQ y el stack completo. | E2E UAT autorizado y dispositivos físicos. |

## Límites de servicio durante la migración

| Ruta pública | Propietario objetivo | Destino transitorio |
|---|---|---|
| `/api/uat/*` | UAT Integration | `backend-apirest` |
| `/api/coordinacion/*` | Coordination Query / comandos a propietarios | BFF `backend-apirest`, con lecturas delegadas |
| `/auth/*`, `/professors/login` | Identity | `backend` |
| `/professors/*`, `/groups/*` | Academic | `backend` |
| `/attendance/*` | Attendance | `backend` como fachada móvil; captura UAT ya delegada |
| `/api/uat/profesor/beacons/resolve` | Attendance | BFF UAT; autorización de sustituciones pasa temporalmente por la fachada y la configuración siempre se lee de Attendance |
| `/api/beacons/*` | Attendance | Fachada autenticada para móviles instalados; delega la resolución a Attendance sin leer configuración legada |
| `/api/student-device-bindings/*` | Attendance | Corte completado; Gateway enruta al propietario y la lectura del profesor pasa por sesión UAT + roster |
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
