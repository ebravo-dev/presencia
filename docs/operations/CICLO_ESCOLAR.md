# Ciclo escolar activo

El ciclo escolar de producción se administra desde **Super Usuario > Ciclo escolar**. La selección se guarda en Academic Service y es la fuente única que usan la sincronización de profesores, el backend REST y la consulta de clases de la app del profesor.

## Reglas

- La configuración inicial es `152` (`2026-3`).
- El ciclo activo solo cambia cuando un Super Usuario lo selecciona; el cambio de año no activa un ciclo automáticamente.
- El 1 de enero de cada año se habilitan automáticamente sus tres opciones. Por ejemplo, durante 2027 se habilitan `153` (`2027-1`), `154` (`2027-2`) y `155` (`2027-3`).
- No es posible activar ciclos de años futuros. Los ciclos anteriores permanecen disponibles y su historial no se elimina.
- Al cambiar de ciclo se desactivan las materias activas del ciclo anterior. Los profesores recuperan las materias del ciclo seleccionado al volver a iniciar sesión o sincronizar.
- Cada cambio se registra con el Super Usuario, la fecha, el ciclo anterior, el nuevo ciclo y el identificador de correlación.

## Despliegue

El contenedor `academic-migrate` aplica la migración antes de iniciar `academic-service`. En producción ya no se usa `UAT_ID_CICLO_ESCOLAR` como fuente del ciclo; `PRESENCIA_DEMO_CYCLE_ID` sigue configurando únicamente el entorno demo.

La zona horaria utilizada para desbloquear el nuevo año es `America/Monterrey`.
