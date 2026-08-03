# Auditoría de finalización del objetivo de microservicios

**Fecha:** 2026-08-03

Esta matriz distingue implementación, evidencia automatizada y validación
externa. Un archivo existente o un test unitario no se considera por sí solo
prueba de funcionamiento integral.

| Requisito | Propietario y evidencia actual | Estado |
|---|---|---|
| Datos UAT del profesor mediante REST | UAT Integration implementa sesión ASP.NET, horarios, catálogos, grupos, roster y asistencia. Los tests de cliente y el Compose CI prueban formularios, cookies, cosecha y escritura contra un portal HTTP aislado. Una cuenta real autorizada autenticó y respondió a catálogos, horarios y exámenes en modo de sólo lectura. | Implementado; falta validar una carga real expresamente autorizada. |
| Login, perfil y horario del alumno | UAT Integration autentica, selecciona carrera y expone horario/calificaciones; Identity emite la sesión y Academic persiste el snapshot. El Compose CI recorre el contrato público desde el Gateway. Una cuenta real autorizada autenticó, entregó carrera y aceptó consultas de horario/calificaciones sin mutaciones. | Implementado; falta E2E del vínculo en dispositivos físicos. |
| Login estudiantil como única alta | Cada login exige UUID BLE, identificador estable y plataforma móvil; el vínculo sólo se ejecuta después de que UAT devuelve login, carrera y matrícula válidos. La misma identidad se reconcilia idempotentemente durante la actualización académica y no existe alta manual pública. | Implementado y probado en BFF, Attendance y Flutter. |
| Vincular matrícula, teléfono y UUID | Attendance posee `StudentDeviceBinding`, rechaza identificadores duplicados y entrega un token acotado. El Gateway renueva únicamente el vínculo exacto; el profesor lo resuelve mediante sesión UAT y pertenencia al roster, sin dual-write legado. | Implementado y probado. |
| Cambio de UUID sólo por coordinación | Attendance permite reemplazo/desvinculación sólo por comando interno con rol y motivo auditables; el endpoint público únicamente repite el vínculo exacto. | Implementado y probado. |
| Captura local y subida posterior a UAT | La presencia del profesor entra únicamente por el canal de beacon/entrada/salida y usa hora del servidor; la captura de alumnos no puede inyectar timestamps de profesor. Attendance usa transacción serializable e idempotencia. Antes del `202`, UAT Integration persiste un job con credencial cifrada, separado del TTL de Redis; el móvil conserva su `ClientRecordId` hasta recibir `COMPLETED`. El titular queda `PENDING`; una clase compartida queda `SKIPPED`. | Implementado; falta caos contra UAT real. |
| Asistencia del profesor en dashboard | Coordination Query consume roster/asistencia, reconcilia snapshots y genera reportes semanal/rango. | Implementado; CI prueba la proyección cruzando PostgreSQL y RabbitMQ. |
| Microservicios y datos separados | Gateway, Identity, Academic, Attendance, UAT Integration y Coordination Query usan límites y bases lógicas propios. Identity es obligatorio para cada login; Academic recibe el único snapshot de profesor/alumno; Attendance posee beacons, dispositivos y telemetría BLE. UAT Integration no mantiene una segunda proyección académica. | El proceso HTTP monolítico y las fachadas móviles antiguas están fuera del runtime; se conservan únicamente imports one-shot idempotentes mientras se valida el primer despliegue. |
| Docker y Dokploy | Compose crea bases/usuarios, migraciones/importaciones one-shot, Redis AOF, RabbitMQ, redes privadas, egreso UAT, readiness y apagado controlado. Las imágenes de aplicación usan usuarios sin privilegios; los runtimes eliminan capacidades, bloquean escalamiento de privilegios y montan el filesystem como sólo lectura con `tmpfs` explícitos. Una construcción limpia local validó imágenes, jobs, servicios, web y el flujo integral con Docker 29.7.1 y Compose 5.3.1. | Implementado y validado localmente; faltan la primera corrida remota y el despliegue Dokploy. |
| Credenciales móviles | El alumno usa almacenamiento seguro nativo. El profesor migra los tokens de Hive a Keychain/Keystore, elimina la contraseña heredada y sólo la conserva efímeramente en memoria para reintentos del proceso actual. | Implementado y probado; falta auditoría en dispositivos físicos. |
| Tests | Unitarios, contratos HTTP/eventos, clientes UAT simulados, apps Flutter, dashboard web, smoke público y flujo integral del Compose. El smoke UAT real de sólo lectura verifica ambos portales sin imprimir datos académicos. | Implementado; la escritura al simulador UAT pasó E2E. La escritura UAT real y los dispositivos físicos aún requieren autorización e infraestructura externa. |

## Evidencia UAT real de sólo lectura

El 3 de agosto de 2026 se ejecutó `npm run smoke:uat:readonly` con credenciales
entregadas de forma efímera al proceso. Los dos portales autenticaron y
entregaron cookies ASP.NET válidas. El portal estudiantil devolvió una carrera;
horario y calificaciones estaban vacíos para el contexto seleccionado. El
portal de profesores devolvió catálogos, cinco horarios y cinco exámenes para
el ciclo activo; la consulta de grupos de control de asistencia devolvió una
lista vacía y UAT no ofreció fechas de ciclo para sondear el roster desde un
grupo del horario. Por ello, una carga real requiere otra ventana o contexto
académico válido. La prueba no imprimió identidad, matrícula, cookies ni datos
académicos y nunca invocó `GuardaAsistencias`.

## Evidencia Docker local

El 3 de agosto de 2026 se construyó y levantó desde volúmenes limpios la
superposición `docker-compose.microservices.yml` + `docker-compose.ci.yml` con
Docker 29.7.1 y Compose 5.3.1. Los jobs de aprovisionamiento, migración e import
terminaron con código cero y los servicios de ejecución alcanzaron sus sondas
de salud. El smoke público completó ocho comprobaciones de web, health,
readiness, autenticación y bloqueo de rutas internas. El flujo integral
completó once etapas entre Gateway, Identity, Academic, Attendance, UAT
Integration, Coordination Query, PostgreSQL, Redis y RabbitMQ.

La ejecución descubrió y corrigió cuatro diferencias respecto de la validación
estática: el script de aprovisionamiento montado debe invocarse mediante
`/bin/sh`; la sonda Redis debe reutilizar la contraseña expandida por Compose;
la cuenta coordinadora opcional no debe recibir sólo un nombre predeterminado;
y el hash de idempotencia de asistencia debe depender del contenido de negocio,
no del identificador de correlación de cada reintento. También se ajustó la
espera de readiness para que los jobs one-shot exitosos no hagan fallar Compose
5 al usar `--wait`.

## Gate automatizado del Compose

El job `compose-integration` genera secretos efímeros, sustituye ambos portales
UAT por un simulador HTTP no privilegiado y levanta todas las imágenes. La
prueba `verify-service-flow.mjs` comprueba:

1. Gateway autentica al profesor contra el formulario UAT e Identity verifica su sesión;
2. UAT Integration cosecha grupo/roster y Academic los persiste;
3. Gateway autentica al alumno, Attendance vincula su celular y Academic persiste el horario leído de UAT;
4. RabbitMQ entrega el roster a Attendance;
5. Attendance importa beacons idempotentemente y limita su resolución al roster;
6. Gateway valida la renovación acotada del vínculo estudiantil;
7. Las rutas públicas del profesor validan beacon, roster y UUID, deduplican al alumno y proyectan telemetría `DRAFT` con tiempo del servidor;
8. La ruta pública de captura crea un job durable antes del `202`, deduplica el reintento y el worker escribe exactamente una vez en UAT;
9. RabbitMQ entrega `COMPLETED` a Attendance y Coordination Query para el dashboard;
10. Nginx/Gateway publican health y rutas de clientes, pero no `/internal/*`.
11. Academic crea/revoca una clase compartida y Attendance aplica el permiso a
    beacons, roster, presencia y captura `SKIPPED` sin generar una subida UAT.

El mismo workflow ejecuta `flutter analyze` y `flutter test` en las apps de
alumno y profesor. El bundle inicial del dashboard separa React, consultas e
iconos en chunks cacheables; Excel y PDF continúan como imports bajo demanda.

## Gates externos aún obligatorios

- ventana, grupo y lista expresamente autorizados para una escritura UAT real;
- Android e iOS físicos para BLE, UUID y revinculación;
- despliegue Dokploy con dos réplicas por servicio;
- caída/restauración controlada contra UAT real y verificación de reintento/DLQ;
- backup y restauración de las bases y Redis.

El runtime legado está retirado del Compose. La base histórica y su imagen no
deben eliminarse hasta ejecutar el primer despliegue, comprobar los imports
one-shot y completar una restauración de respaldo en un entorno aislado.
