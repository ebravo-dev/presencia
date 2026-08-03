# Auditoría de finalización del objetivo de microservicios

**Fecha:** 2026-08-03

Esta matriz distingue implementación, evidencia automatizada y validación
externa. Un archivo existente o un test unitario no se considera por sí solo
prueba de funcionamiento integral.

| Requisito | Propietario y evidencia actual | Estado |
|---|---|---|
| Datos UAT del profesor mediante REST | UAT Integration implementa sesión ASP.NET, horarios, catálogos, grupos, roster y asistencia. Los tests de cliente y el Compose CI prueban formularios, cookies, cosecha y escritura contra un portal HTTP aislado. Una cuenta real autorizada autenticó y respondió a catálogos, horarios y exámenes en modo de sólo lectura. | Implementado; falta validar una carga real expresamente autorizada. |
| Login, perfil y horario del alumno | UAT Integration autentica, selecciona carrera y expone horario/calificaciones; Identity emite la sesión y Academic persiste el snapshot. Flutter conserva la sesión UAT inicial sólo en memoria mientras descarga el perfil y horario en segundo plano, transforma todos los días y sustituye los datos ficticios por materias, aulas, horas y profesor devueltos por REST. El Compose CI recorre el contrato público desde el Gateway y las pruebas Dart cubren el mapeo. Una cuenta real autorizada autenticó, entregó carrera y aceptó consultas sin mutaciones. | Implementado; falta E2E visual y del vínculo en dispositivos físicos. |
| Login estudiantil como única alta | Cada login exige UUID BLE, identificador estable y plataforma móvil; el vínculo sólo se ejecuta después de que UAT devuelve login, carrera y matrícula válidos. La misma identidad se reconcilia idempotentemente durante la actualización académica y no existe alta manual pública. | Implementado y probado en BFF, Attendance y Flutter. |
| Vincular matrícula, teléfono y UUID | Attendance posee `StudentDeviceBinding`, rechaza identificadores duplicados y entrega un token acotado. El Gateway renueva únicamente el vínculo exacto; el profesor lo resuelve mediante sesión UAT y pertenencia al roster, sin dual-write legado. | Implementado y probado. |
| Cambio de UUID sólo por coordinación | Attendance permite reemplazo/desvinculación sólo por comando interno con rol y motivo auditables; el endpoint público únicamente repite el vínculo exacto. El dashboard protegido muestra los celulares vinculados y permite a `COORDINATOR` revocar el vínculo actual para que el siguiente login estudiantil registre el nuevo UUID; `READ_ONLY` conserva consulta sin escritura. | Implementado y probado en backend y frontend. |
| Captura local y subida posterior a UAT | La presencia del profesor entra únicamente por el canal de beacon/entrada/salida y usa hora del servidor; la captura de alumnos no puede inyectar timestamps de profesor. Attendance usa transacción serializable e idempotencia. Antes del `202`, UAT Integration persiste un job con credencial cifrada, separado del TTL de Redis; el móvil conserva su `ClientRecordId` hasta recibir `COMPLETED`. El titular queda `PENDING`; una clase compartida queda `SKIPPED`. El Compose fuerza fallos transitorios y terminales y comprueba recuperación sin duplicar la escritura. | Implementado y probado contra el simulador; falta caos contra UAT real. |
| Asistencia del profesor en dashboard | Coordination Query consume roster/asistencia, reconcilia snapshots y genera reportes semanal/rango. | Implementado; CI prueba la proyección cruzando PostgreSQL y RabbitMQ. |
| Microservicios y datos separados | Gateway, Identity, Academic, Attendance, UAT Integration y Coordination Query usan límites y bases lógicas propios. Identity es obligatorio para cada login; Academic recibe el único snapshot de profesor/alumno; Attendance posee beacons, dispositivos y telemetría BLE. UAT Integration no mantiene una segunda proyección académica. | El proceso HTTP monolítico y las fachadas móviles antiguas están fuera del runtime; se conservan únicamente imports one-shot idempotentes mientras se valida el primer despliegue. |
| Docker y Dokploy | Compose crea bases/usuarios, migraciones/importaciones one-shot, Redis AOF, RabbitMQ, redes privadas, egreso UAT, readiness y apagado controlado. Las imágenes de aplicación usan usuarios sin privilegios; los runtimes eliminan capacidades, bloquean escalamiento de privilegios y montan el filesystem como sólo lectura con `tmpfs` explícitos. Una construcción limpia local validó dos réplicas de los seis servicios, failover del Gateway, jobs, web y el flujo integral con Docker 29.7.1 y Compose 5.3.1. | Implementado y validado localmente; faltan la primera corrida remota y el despliegue Dokploy. |
| Credenciales móviles | El alumno usa almacenamiento seguro nativo. El profesor migra los tokens de Hive a Keychain/Keystore, elimina la contraseña heredada y sólo la conserva efímeramente en memoria para reintentos del proceso actual. | Implementado y probado; falta auditoría en dispositivos físicos. |
| Tests | Unitarios, contratos HTTP/eventos, clientes UAT simulados, apps Flutter, dashboard web, smoke público, flujo integral escalado, DLQ y restauración de datos. El smoke UAT real de sólo lectura verifica ambos portales sin imprimir datos académicos. | Implementado; escritura, reintento y recuperación pasaron contra el simulador UAT. La escritura UAT real y los dispositivos físicos aún requieren autorización e infraestructura externa. |

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
completó trece etapas entre Gateway, Identity, Academic, Attendance, UAT
Integration, Coordination Query, PostgreSQL, Redis y RabbitMQ. Se levantaron
dos réplicas de cada servicio HTTP; al detener una réplica del Gateway, las
ocho comprobaciones continuaron pasando a través del mismo frontend.

El worker UAT superó un fallo transitorio, registró un fallo terminal acotado a
cinco intentos y, al restaurarse el portal, reutilizó el comando idempotente sin
duplicar la escritura. Un evento malformado con reintentos agotados llegó a la
DLQ durable real de RabbitMQ. Las seis bases PostgreSQL se respaldaron y
restauraron en bases efímeras con conteos idénticos por tabla; un snapshot RDB
de Redis restauró sus diez keys en un contenedor aislado y sin red.

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
8. La ruta pública de captura crea un job durable antes del `202`, deduplica el comando y supera un fallo UAT transitorio;
9. el worker alcanza `FAILED` después de cinco fallos, conserva el diagnóstico y completa el mismo comando al restaurarse UAT sin duplicar la escritura;
10. RabbitMQ envía un evento inválido con reintentos agotados a la DLQ durable;
11. RabbitMQ entrega `COMPLETED` a Attendance y Coordination Query para el dashboard;
12. Nginx/Gateway publican health y rutas de clientes, pero no `/internal/*`, y el frontend continúa atendiendo al detener una réplica del Gateway;
13. Academic crea/revoca una clase compartida y Attendance aplica el permiso a
    beacons, roster, presencia y captura `SKIPPED` sin generar una subida UAT.

Después del flujo, el gate restaura las seis bases PostgreSQL y Redis en
destinos efímeros aislados y compara los conteos respaldados. Los verificadores
destructivos se niegan a ejecutar si no reciben la guarda explícita de CI.

El mismo workflow ejecuta `flutter analyze` y `flutter test` en las apps de
alumno y profesor, compila APK debug en Linux y compila ambas aplicaciones iOS
sin firma en un runner macOS. Los dos APK se construyeron también localmente;
el gate macOS queda verificable al ejecutar el workflow remoto. El bundle
inicial del dashboard separa React, consultas e iconos en chunks cacheables;
Excel y PDF continúan como imports bajo demanda.

La app estudiantil ya no muestra materias, aulas ni campus de ejemplo. Después
de autenticar, reutiliza la sesión UAT inicial para cargar el horario sin un
segundo login, la revoca al terminar y mantiene asistencia/navegación
disponibles mientras sincroniza. Presenta estados de carga, vacío, error y
reintento; el perfil usa nombre, programa, ciclo, promedio y créditos sólo
cuando UAT los entrega. Diez pruebas Flutter validan identidad estable, perfil
y horarios de varios días, y el APK actualizado compila localmente.

El dashboard de coordinación incorpora la vista de celulares vinculados. La
acción **Autorizar cambio** no asigna un UUID manual: revoca el vínculo actual
con identidad, rol, motivo y correlación auditables; sólo entonces el siguiente
login institucional del alumno puede registrar el UUID del nuevo teléfono. La
UI deshabilita la acción para `READ_ONLY` y el backend vuelve a imponer la
misma restricción con `403`, independientemente del cliente.

La línea base de carga CI ejecuta 200 lecturas UAT simuladas con concurrencia
20 sobre el stack escalado y exige menos de 1% de errores, p95 menor a 750 ms y
p99 menor a 1.5 s. UAT Integration expone ahora contadores y histogramas HTTP
Prometheus protegidos, igual que el resto de los servicios. Los SLO iniciales,
reglas de alerta y respuesta a incidentes están versionados en el runbook; su
calibración con tráfico real y la conexión del colector siguen siendo gates del
host Dokploy.

Las seis imágenes HTTP precargan OpenTelemetry antes de iniciar Fastify, asignan
un `service.name` independiente y pueden exportar trazas OTLP/HTTP al colector
privado configurado en Dokploy. La exportación queda desactivada por defecto;
Prometheus permanece como fuente de métricas y los logs no se duplican por OTLP.

La ejecución Docker local del 3 de agosto de 2026 completó esas 200 lecturas
con 20 solicitudes concurrentes, 0% de errores, p95 de 35.57 ms, p99 de 36.52
ms y 663.94 solicitudes por segundo. El mismo gate confirmó que las métricas de
UAT Integration responden `401` sin token y exponen el contador HTTP con su
Bearer dedicado.

## Gates externos aún obligatorios

- ventana, grupo y lista expresamente autorizados para una escritura UAT real;
- Android e iOS físicos para BLE, UUID y revinculación;
- despliegue Dokploy con dos réplicas por servicio;
- caída/restauración controlada contra UAT real; reintento y DLQ ya están validados en el simulador;
- programación, retención externa y monitoreo de backups de producción; la restauración aislada ya está automatizada.
- colector/Alertmanager y calibración de SLO con tráfico representativo; las reglas y el gate de carga simulado ya están versionados.

El runtime legado está retirado del Compose. La base histórica y su imagen no
deben eliminarse hasta ejecutar el primer despliegue, comprobar los imports
one-shot y completar una restauración de respaldo en un entorno aislado.
