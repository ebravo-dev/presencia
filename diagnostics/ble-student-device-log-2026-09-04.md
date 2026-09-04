# Captura BLE del celular del alumno

Fecha: 2026-09-04 (America/Mexico_City)

## Dispositivo y aplicación

- Dispositivo: Huawei MAR-LX3A
- Android: 10 (API 29)
- Aplicación: `com.presencia.app_alumno`
- Versión: 1.2.0 (versionCode 5, targetSdk 36)
- Bluetooth: encendido
- Ubicación: encendida
- App visible durante la captura
- Servicio `BleAdvertiserService`: activo y en primer plano

Los identificadores personales del alumno se omitieron de este archivo.

## Logcat relevante

```text
09-04 08:31:53.295 I flutter: [device_binding.sync_rejected] El backend rechazó la sincronización del dispositivo.
09-04 08:31:54.756 I flutter: [device_binding.sync_rejected] El backend rechazó la sincronización del dispositivo.
09-04 08:32:33.858 I flutter: [auth.login.started] Iniciando autenticación del alumno.
09-04 08:32:38.253 I flutter: [auth.login.completed] Autenticación del alumno completada.
09-04 08:32:40.351 I flutter: [device_binding.sync_completed] El vínculo del dispositivo quedó sincronizado.
09-04 08:32:40.651 I flutter: [device_binding.sync_completed] El vínculo del dispositivo quedó sincronizado.

09-04 08:33:04.145 I flutter: [ble.advertising.start] Iniciando transmisión del beacon de asistencia.
09-04 08:33:04.220 I StudentBeacon: Attendance GATT service added status=0 service=9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c1
09-04 08:33:04.220 I BluetoothLeAdvertiser: startAdvertising is called
09-04 08:33:04.378 I StudentBeacon: Student attendance peripheral started

09-04 08:33:34.391 I BluetoothLeAdvertiser: stopAdvertising is called
09-04 08:33:35.812 I flutter: [ble.advertising.start] Iniciando transmisión del beacon de asistencia.
09-04 08:33:35.826 I StudentBeacon: Attendance GATT service added status=0 service=9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c1
09-04 08:33:35.826 I BluetoothLeAdvertiser: startAdvertising is called
09-04 08:33:35.844 I StudentBeacon: Student attendance peripheral started

09-04 08:34:05.856 I BluetoothLeAdvertiser: stopAdvertising is called
09-04 08:34:07.083 I flutter: [ble.advertising.start] Iniciando transmisión del beacon de asistencia.
09-04 08:34:07.099 I StudentBeacon: Attendance GATT service added status=0 service=9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c1
09-04 08:34:07.099 I BluetoothLeAdvertiser: startAdvertising is called
09-04 08:34:07.118 I StudentBeacon: Student attendance peripheral started

09-04 08:34:37.131 I BluetoothLeAdvertiser: stopAdvertising is called
09-04 08:34:40.452 I flutter: [ble.advertising.start] Iniciando transmisión del beacon de asistencia.
09-04 08:34:40.468 I StudentBeacon: Attendance GATT service added status=0 service=9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c1
09-04 08:34:40.468 I BluetoothLeAdvertiser: startAdvertising is called
09-04 08:34:40.486 I StudentBeacon: Student attendance peripheral started
```

No aparecieron durante la captura las líneas esperadas cuando el profesor detecta al alumno:

```text
StudentBeacon: Professor connected: ...
StudentBeacon: Professor read attendance UUID ...
StudentBeacon: Attendance confirmed by professor: ...
```

## Estado interno de Bluetooth

```text
GATT Server Map
com.presencia.app_alumno (Registered)
Connections: 0

Service 9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c1, started true
Characteristic 9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c2
Characteristic 9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c3
```

## Correlación con el celular del profesor

La captura anterior del Samsung del profesor mostró escaneos con `0/0` resultados. Esta captura se obtuvo después, al cambiar el cable ADB al Huawei; por ello sus horas no sirven para determinar si la interacción original fue simultánea. El usuario confirmó que inició ambas operaciones al mismo tiempo.

La evidencia combinada sí permite ubicar el punto de corte: el Huawei registra satisfactoriamente cada inicio de publicidad y el servicio GATT, mientras que el Samsung registra el escaneo pero no entrega ningún resultado a la app. En consecuencia, nunca se alcanza la conexión GATT.

Cada sesión de transmisión del alumno dura 30 segundos. En el Samsung, Android informó que el filtro de Presencia quedó inicialmente bloqueado por falta de ranuras BLE y tardó alrededor de 50 segundos en resolverlo durante el primer intento observado. Esa condición puede hacer que la ventana del alumno termine antes de que el filtro del profesor esté operativo.

## Conclusión

El Huawei puede publicar correctamente el servicio BLE y el vínculo del dispositivo terminó sincronizado. Aun con la transmisión activa no se registró ninguna conexión, lectura o confirmación del profesor. Los logs apuntan al descubrimiento BLE del Samsung, especialmente a la saturación temporal de sus filtros, y no a un fallo de autenticación, permisos o creación del servicio GATT en el Huawei.

Una prueba posterior conectó ambos teléfonos por ADB simultáneamente. El resultado confirmó esta conclusión: durante la publicidad correcta del Huawei, el Samsung recibió tráfico BLE general pero Android bloqueó el filtro específico de Presencia por falta de ranuras. La app del profesor obtuvo cero callbacks y el servidor GATT del alumno permaneció en cero conexiones.
