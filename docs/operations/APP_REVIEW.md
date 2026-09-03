# Cuentas aisladas para App Review

Presencia incluye dos identidades fijas para que Apple revise ambas apps sin
usar cuentas institucionales reales:

| App | Usuario predeterminado | Datos visibles |
| --- | --- | --- |
| Profesor | `appreview.profesor@uat.edu.mx` | Materia `REVIEW-101` y alumno `APPREVIEW01` |
| Alumno | `appreview.alumno@alumnos.uat.edu.mx` | Materia `REVIEW-101` con horario disponible todos los días |

Las contraseñas son secretos de despliegue separados. No deben agregarse al
repositorio, a las apps ni a las imágenes de Docker.

## Garantía de aislamiento

El BFF reconoce únicamente esos dos nombres de usuario y dirige su login al
`demo-portal-service` privado. Todos los demás usuarios continúan contra los
portales institucionales de UAT.

Las identidades de revisión:

- existen en un catálogo fijo en memoria, separado del catálogo administrable
  del modo demo;
- sólo generan una sesión cifrada y temporal en Redis;
- no crean registros en Identity, Academic ni Attendance;
- no publican eventos de sincronización ni snapshots académicos;
- no aparecen en los dashboards de coordinación o Super Usuario;
- no crean vínculos de dispositivo, capturas ni trabajos de subida;
- responden de forma efímera a presencia, vinculación y guardado de asistencia.

El endpoint privado que permite al BFF resolver el beacon de revisión exige el
`INTERNAL_API_TOKEN`. El panel demo permanece oculto cuando
`PRESENCIA_DEBUG_MODE=false`.

## Activación en Dokploy

Mantén el modo demo general apagado y configura estas variables en el proyecto
que atiende a las apps enviadas a revisión:

```dotenv
PRESENCIA_DEBUG_MODE=false
PRESENCIA_APP_REVIEW_ENABLED=true
PRESENCIA_APP_REVIEW_TEACHER_USERNAME=appreview.profesor@uat.edu.mx
PRESENCIA_APP_REVIEW_STUDENT_USERNAME=appreview.alumno@alumnos.uat.edu.mx
PRESENCIA_APP_REVIEW_TEACHER_PASSWORD=<secreto-aleatorio-distinto-de-al-menos-12-caracteres>
PRESENCIA_APP_REVIEW_STUDENT_PASSWORD=<otro-secreto-aleatorio-de-al-menos-12-caracteres>
```

Los dos secretos deben ser distintos. Después de cambiar las variables,
redespliega `uat-integration` y `demo-portal-service`. Antes del despliegue se
puede validar el archivo de variables con:

```bash
node infra/scripts/validate-dokploy-env.mjs /ruta/al/archivo.env
```

## Comprobación previa al envío

1. Inicia sesión en la app Profesor con la cuenta de profesor. Debe aparecer
   `Materia de demostración`, grupo `A`, salón `REVIEW-101` y el alumno
   `APPREVIEW01`.
2. Simula la presencia en el salón y guarda una asistencia. La app debe marcar
   la operación como completada sin generar datos institucionales.
3. Cierra sesión e inicia la app Alumno con la cuenta de alumno. Debe mostrarse
   la misma materia y el indicador de versión de prueba.
4. Confirma en los dashboards de coordinación y Super Usuario que no aparecen
   el profesor `999900`, el alumno `APPREVIEW01` ni el grupo `999901`.

En App Store Connect activa **Sign-in required** y registra en cada ficha sólo
el usuario y contraseña de la app correspondiente. En las notas de revisión
indica que el entorno es demostrativo y que las acciones de asistencia no se
guardan en sistemas institucionales.

## Desactivación o rotación

Para cerrar el acceso inmediatamente establece
`PRESENCIA_APP_REVIEW_ENABLED=false` y redespliega los dos servicios. Para una
nueva revisión, rota ambas contraseñas en Dokploy y actualízalas en App Store
Connect; no hace falta limpiar bases de datos porque estas cuentas nunca se
persisten allí.
