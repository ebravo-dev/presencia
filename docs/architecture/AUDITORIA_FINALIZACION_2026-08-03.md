# Auditoría de finalización del objetivo de microservicios

**Fecha:** 2026-08-03

Esta matriz distingue implementación, evidencia automatizada y validación
externa. Un archivo existente o un test unitario no se considera por sí solo
prueba de funcionamiento integral.

| Requisito | Propietario y evidencia actual | Estado |
|---|---|---|
| Datos UAT del profesor mediante REST | UAT Integration implementa sesión ASP.NET, horarios, catálogos, grupos, roster y asistencia. `uat-portal-clients.integration.test.ts` prueba formularios y cookies contra un portal HTTP simulado. | Implementado; falta E2E con cuenta UAT autorizada. |
| Login, perfil y horario del alumno | UAT Integration autentica, selecciona carrera y expone horario/calificaciones; Identity emite la sesión y Academic persiste el snapshot. | Implementado; falta E2E con cuenta UAT autorizada. |
| Login estudiantil como única alta | El vínculo inicial sólo se ejecuta después de que el portal devuelve login, carrera y matrícula válidos. No existe alta manual pública. | Implementado y probado en servicios. |
| Vincular matrícula, teléfono y UUID | Attendance posee `StudentDeviceBinding`, rechaza identificadores duplicados y entrega un token acotado. El Gateway renueva únicamente el vínculo exacto; el profesor lo resuelve mediante sesión UAT y pertenencia al roster, sin dual-write legado. | Implementado y probado. |
| Cambio de UUID sólo por coordinación | Attendance permite reemplazo/desvinculación sólo por comando interno con rol y motivo auditables; el endpoint público únicamente repite el vínculo exacto. | Implementado y probado. |
| Captura local y subida posterior a UAT | Attendance conserva entrada/salida y detecciones BLE como `DRAFT`; al finalizar usa transacción serializable, idempotencia y outbox. UAT Integration consume, cifra credenciales, reintenta y usa DLQ. | Implementado; CI distingue borrador de captura `PENDING`, falta caos contra UAT real. |
| Asistencia del profesor en dashboard | Coordination Query consume roster/asistencia, reconcilia snapshots y genera reportes semanal/rango. | Implementado; CI prueba la proyección cruzando PostgreSQL y RabbitMQ. |
| Microservicios y datos separados | Gateway, Identity, Academic, Attendance, UAT Integration y Coordination Query usan límites y bases lógicas propios. Attendance posee beacons, dispositivos y telemetría BLE con migraciones auditables. | Núcleo implementado; sustituciones y otras fachadas móviles conservan compatibilidad heredada hasta un corte observado. |
| Docker y Dokploy | Compose crea bases/usuarios, migraciones one-shot, Redis AOF, RabbitMQ, redes privadas, egreso UAT, readiness y apagado controlado. | Implementado; workflow CI ejecuta el stack, pendiente primera corrida remota y despliegue Dokploy. |
| Credenciales móviles | El alumno usa almacenamiento seguro nativo. El profesor migra los tokens de Hive a Keychain/Keystore, elimina la contraseña heredada y sólo la conserva efímeramente en memoria para reintentos del proceso actual. | Implementado y probado; falta auditoría en dispositivos físicos. |
| Tests | Unitarios, contratos HTTP/eventos, clientes UAT simulados, apps Flutter, dashboard web, smoke público y flujo integral del Compose. | Implementado; E2E UAT/dispositivos requiere infraestructura externa. |

## Gate automatizado del Compose

El job `compose-integration` genera secretos efímeros y levanta todas las
imágenes. La prueba `verify-service-flow.mjs` comprueba:

1. Identity crea y verifica una sesión autorizada por UAT;
2. Academic persiste snapshots de profesor, roster, alumno y horario;
3. RabbitMQ entrega el roster a Attendance;
4. Attendance importa beacons idempotentemente y limita su resolución al roster;
5. Attendance vincula el celular y Gateway valida la renovación acotada;
6. Attendance valida beacon, roster y UUID, deduplica alumno y proyecta la telemetría como `DRAFT` sin solicitar subida UAT;
7. Attendance finaliza la captura idempotente y la cambia a `PENDING`;
8. RabbitMQ entrega la asistencia a Coordination Query y el reporte refleja la publicación pendiente;
9. Nginx/Gateway publican health y rutas de clientes, pero no `/internal/*`.

El mismo workflow ejecuta `flutter analyze` y `flutter test` en las apps de
alumno y profesor. El bundle inicial del dashboard separa React, consultas e
iconos en chunks cacheables; Excel y PDF continúan como imports bajo demanda.

## Gates externos aún obligatorios

- cuentas de prueba autorizadas para maestros y alumnos UAT;
- Android e iOS físicos para BLE, UUID y revinculación;
- despliegue Dokploy con dos réplicas por servicio;
- caída/restauración controlada de UAT y verificación de reintento/DLQ;
- backup y restauración de las bases y Redis.

La migración no debe declararse completamente retirada mientras existan rutas
activas en las fachadas heredadas. El strangler permite desplegar y observar el
nuevo núcleo sin romper las aplicaciones móviles durante ese corte.
