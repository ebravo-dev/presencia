# Auditoría BLE/GATT Android — 2026-09-02

## Resultado

El flujo fue corregido y supera compilación, pruebas automatizadas, Android Lint
y revisión del manifiesto empaquetado con `targetSdk 36`.

La certificación de radio extremo a extremo queda pendiente porque durante la
auditoría no había dispositivos conectados por ADB. Un emulador no sustituye
dos controladores BLE reales para validar el modo periférico/GATT entre marcas.

## Flujo esperado

1. El alumno abre **Tomar asistencia**.
2. Si el curso tiene beacon de salón, la app lo busca únicamente mientras la
   pantalla está visible.
3. La app del alumno inicia un anuncio BLE conectable y publica un servidor
   GATT con su UUID de asistencia.
4. El profesor abre el grupo y pulsa **Escanear alumnos**.
5. La app filtra por el UUID del servicio, abre GATT, lee el UUID del alumno y
   lo compara con el padrón activo.
6. Después de guardar la asistencia, el profesor escribe la confirmación GATT
   de ese alumno.
7. El alumno valida su matrícula, muestra la confirmación y detiene la emisión.

## Correcciones aplicadas

- En Android 12 o posterior, el escaneo GATT del profesor ya no exige ubicación;
  solicita únicamente `BLUETOOTH_SCAN` y `BLUETOOTH_CONNECT`.
- La ubicación se conserva para el flujo separado que infiere presencia física
  mediante el beacon del salón. No se usa `neverForLocation`, porque Android
  advierte que esa afirmación puede filtrar algunos beacons.
- El profesor ya no declara ni solicita `BLUETOOTH_ADVERTISE`.
- La transmisión del alumno solicita `BLUETOOTH_ADVERTISE` y
  `BLUETOOTH_CONNECT`. `POST_NOTIFICATIONS` está declarado por compatibilidad
  con código opcional empaquetado por AltBeacon, pero nunca se solicita ni
  condiciona la asistencia.
- La emisión solo se reporta como iniciada después del callback real de Android;
  los errores del controlador llegan a la interfaz.
- El servicio del alumno es `connectedDevice`, `START_NOT_STICKY` y maneja la
  revocación de permisos durante la sesión.
- El servidor GATT valida el UUID, respeta offsets de lectura y rechaza escrituras
  preparadas o con offset no soportado.
- El profesor limita las conexiones simultáneas a cuatro, usa MTU 185, impone
  12 segundos por conexión y 120 segundos al escaneo completo, y libera siempre
  los objetos `BluetoothGatt`.
- Los callbacks GATT se serializan en el hilo principal desde API 26 para evitar
  carreras en implementaciones OEM.
- Los fallos del escáner dejan de mostrar una animación infinita y se comunican
  al profesor con una acción de reintento.
- El escaneo AltBeacon no agenda jobs, no se reinicia al arrancar el teléfono y
  se detiene al salir la actividad. Se eliminaron del manifiesto fusionado el
  receptor de arranque, `BluetoothTestJob` y el tipo de servicio de ubicación.
- Gradle, AGP y Kotlin fueron elevados a las versiones mínimas aceptadas por el
  Flutter instalado: Gradle 8.14, AGP 8.11.1 y Kotlin 2.2.20.

## Matriz de permisos

| Flujo | Android 12+ | Android 7–11 |
|---|---|---|
| Alumno emite GATT | Nearby: anunciar y conectar | Bluetooth normal; sin permiso runtime adicional |
| Alumno valida salón | Nearby: escanear/conectar + ubicación precisa | Ubicación precisa |
| Profesor escanea alumnos GATT | Nearby: escanear/conectar | Ubicación precisa |
| Profesor escanea beacon de salón | Nearby: escanear/conectar + ubicación precisa | Ubicación precisa |
| Notificaciones | Opcional; nunca bloquea el flujo | No aplica como permiso runtime |

## Compatibilidad OEM

- **Pixel/AOSP:** el flujo sigue el modelo de permisos Nearby de Android 12+ y
  las reglas de servicio en primer plano `connectedDevice`.
- **Samsung One UI:** Samsung garantiza desde One UI 6 los servicios en primer
  plano conformes con Android 14, pero los modos Sleeping/Deep sleeping siguen
  limitando trabajo en segundo plano.
- **Xiaomi/Redmi/POCO:** Battery Saver puede congelar apps al pasar al fondo. El
  flujo crítico se inicia con interacción visible y usa un servicio conforme;
  si el usuario fuerza “Restringido”, debe seleccionar “Sin restricciones”.
- **Motorola:** Adaptive Battery y la optimización también pueden limitar apps
  poco usadas. Para una sesión activa se debe mantener la app en modo Optimizado
  o Sin restricciones, no Restringido.

Ninguna app debe abrir pantallas privadas de fabricante ni pedir exclusión de
batería de forma preventiva. Si un equipo concreto mata una sesión iniciada por
el usuario, la ayuda de diagnóstico puede indicar la ruta de ajustes de ese OEM.

## Verificación ejecutada

- `flutter analyze --no-pub`: ambas apps sin hallazgos.
- `flutter test --no-pub`: alumno 37/37; profesor 84/84.
- `./gradlew lintDebug --no-daemon`: ambas apps, exitoso.
- `flutter build apk --debug --no-pub`: ambos APK, exitoso.
- `apkanalyzer`: ambos APK apuntan a API 36; el alumno empaqueta únicamente su
  servicio GATT como `connectedDevice`; el profesor no empaqueta permiso de
  anunciar; ninguno empaqueta los componentes de reinicio de AltBeacon.

## Certificación pendiente con dos teléfonos

Probar al menos estas parejas: Pixel↔Samsung, Samsung↔Xiaomi/Redmi y
Motorola↔Samsung. En cada pareja:

1. Instalar el APK del alumno en un equipo y el del profesor en el otro.
2. Conceder Nearby; conceder ubicación solo si el curso usa beacon de salón.
3. Denegar notificaciones a propósito y comprobar que no bloquea la emisión.
4. En el alumno, pulsar **Tomar asistencia** y esperar el estado de transmisión.
5. En el profesor, pulsar **Escanear alumnos** y comprobar detección, guardado y
   confirmación en el alumno.
6. Repetir con la pantalla del alumno apagada durante la emisión.
7. Repetir apagando Bluetooth, revocando Nearby y pulsando reintentar; ninguna
   app debe quedar escaneando indefinidamente ni cerrar por excepción.
8. Repetir con varios alumnos y confirmar que las conexiones se reciclan sin
   agotar el límite GATT del teléfono del profesor.

Logs recomendados durante la prueba:

```text
adb -s <SERIAL_ALUMNO> logcat -s StudentBeacon BLE RoomBeaconScanner
adb -s <SERIAL_PROFESOR> logcat -s StudentAttendanceBLE RoomBeaconScanner
```

## Fuentes oficiales

- Android: permisos Bluetooth:
  https://developer.android.com/develop/connectivity/bluetooth/bt-permissions
- Android: búsqueda de dispositivos BLE:
  https://developer.android.com/develop/connectivity/bluetooth/ble/find-ble-devices
- Android: conexión a un servidor GATT:
  https://developer.android.com/develop/connectivity/bluetooth/ble/connect-gatt-server
- Android: tipos de servicio en primer plano:
  https://developer.android.com/develop/background-work/services/fgs/service-types
- Android: permiso de notificaciones:
  https://developer.android.com/develop/ui/views/notifications/notification-permission
- Samsung: administración de aplicaciones:
  https://developer.samsung.com/mobile/app-management.html
- Xiaomi: restricciones de batería en segundo plano:
  https://www.mi.com/global/support/faq/details/KA-515628/
- Motorola: optimización de batería:
  https://en-us.support.motorola.com/app/answers/detail/a_id/173986
