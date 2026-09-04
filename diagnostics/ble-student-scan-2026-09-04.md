# Diagnóstico del escaneo BLE de alumnos

Fecha de captura: 2026-09-04 (America/Mexico_City)

## Dispositivo del profesor

- Modelo: Samsung SM-G990U
- Android: 16 (API 36)
- Paquete: `com.example.appprofesoresuniversidad`
- Versión instalada: 1.0.0 (versionCode 1, targetSdk 36)
- Bluetooth: encendido
- Servicios de ubicación: encendidos (`location_mode=3`)
- `BLUETOOTH_SCAN`: concedido; AppOps `allow`
- `BLUETOOTH_CONNECT`: concedido
- La ubicación precisa no está concedida, pero no es requisito del escaneo de alumnos en Android 12+; el flujo usa los permisos Nearby Devices.

## Extracto de logcat

```text
09-04 08:22:26.738 D BluetoothLeScanner: Start Scan with callback
09-04 08:22:26.741 D BluetoothLeScanner: onScannerRegistered() - status=0 scannerId=8 mScannerId=0
09-04 08:22:26.746 I StudentAttendanceBLE: Student BLE scan attempt 1/2 started for 1 UUID(s)
09-04 08:24:26.745 I StudentAttendanceBLE: Student BLE scan attempt 1/2 timed out; restarting once
09-04 08:24:26.745 D BluetoothLeScanner: Stop Scan with callback
09-04 08:24:27.255 D BluetoothLeScanner: Start Scan with callback
09-04 08:24:27.257 D BluetoothLeScanner: onScannerRegistered() - status=0 scannerId=8 mScannerId=0
09-04 08:24:27.264 I StudentAttendanceBLE: Student BLE scan attempt 2/2 started
09-04 08:25:56.033 D BluetoothLeScanner: Stop Scan with callback
09-04 08:26:20.049 D BluetoothLeScanner: Start Scan with callback
09-04 08:26:20.052 D BluetoothLeScanner: onScannerRegistered() - status=0 scannerId=8 mScannerId=0
09-04 08:26:20.055 I StudentAttendanceBLE: Student BLE scan attempt 1/2 started for 1 UUID(s)
```

## Estadísticas del sistema Bluetooth

```text
com.example.appprofesoresuniversidad (Registered)
LE scans (started/stopped): 3 / 2
Scan mode: LOW_LATENCY
Scan time active/suspend/freeze/total: 245721 / 0 / 0 / 245721 ms
Total number of results (screen off/total): 0/0

08:22:26.745 - 08:24:26.749: 0/0 results
08:24:27.262 - 08:25:56.035: 0/0 results
08:26:20.054 - 08:26:56.998: 0/0 results

Filter:
ServiceUuid=9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c1
```

Android también registró presión temporal en las ranuras de filtros BLE del Samsung:

```text
08:22:26.756 Blocked: 1 filters of com.example.appprofesoresuniversidad(8) becuz only 0 slots left
08:23:16.825 Resolved: 1 filters of com.example.appprofesoresuniversidad(8) becuz 1 slots available
08:24:27.269 Blocked: 1 filters of com.example.appprofesoresuniversidad(8) becuz only 0 slots left
```

El primer filtro quedó disponible después de unos 50 segundos y aun así terminó con cero resultados. No apareció `SCAN_FAILED`, una excepción de permisos, una suspensión ni una congelación del escaneo.

## Conclusión

El escáner del teléfono del profesor sí inicia correctamente, pero no recibe ningún anuncio compatible con el servicio GATT de alumnos `9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c1`. Por ello no llega a conectarse, leer el UUID de asistencia ni comparar al alumno con el vínculo del grupo.

La causa más probable está del lado emisor: la app de uno o más alumnos no está anunciando ese servicio, su servicio BLE se detuvo, no tiene permiso para anunciar/conectar, Bluetooth está apagado, o la versión instalada usa un protocolo distinto. La contención de filtros del Samsung puede retrasar el descubrimiento y debe vigilarse, pero no explica por sí sola el primer intento completo, que tuvo tiempo con el filtro resuelto y aun así recibió cero resultados.

Para cerrar la causa exacta falta conectar por ADB un celular de alumno afectado y revisar los tags `BleAdvertiserService` y `StudentMainActivity` mientras el profesor escanea. El único equipo conectado durante esta captura fue el del profesor; no estaba instalada en él la app `com.presencia.app_alumno`.

## Actualización: captura del celular del alumno

Posteriormente se conectó un Huawei MAR-LX3A con `com.presencia.app_alumno` 1.2.0. La app autenticó al alumno, sincronizó el vínculo y publicó correctamente el servicio GATT a partir de las 08:33:04. El estado interno de Bluetooth mostró el servicio iniciado, pero `Connections: 0`; no hubo conexión, lectura del UUID ni confirmación del profesor.

Las capturas se realizaron en momentos distintos porque el cable ADB se cambió de un teléfono al otro; por ello sus horas no demuestran falta de simultaneidad. El usuario confirmó que accionó ambas apps al mismo tiempo. La evidencia combinada ubica el fallo en el descubrimiento: el alumno publica el servicio correctamente, pero el profesor recibe cero resultados y nunca inicia una conexión GATT. La presión de filtros BLE observada en el Samsung es el principal indicio técnico. La captura detallada está en `diagnostics/ble-student-device-log-2026-09-04.md`.

## Prueba simultánea con ambos teléfonos conectados

Se conectaron al mismo tiempo el Samsung SM-G990U del profesor y el Huawei MAR-LX3A del alumno. Se mantuvieron dos capturas ADB concurrentes y se accionaron ambas apps durante la misma ventana.

Profesor:

```text
BluetoothLeScanner: Start Scan with callback
BluetoothLeScanner: onScannerRegistered() - status=0 scannerId=11
StudentAttendanceBLE: Student BLE scan attempt 1/2 started for 1 UUID(s)

Ongoing scan: LOW_LATENCY
Target filter: ServiceUuid=9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c1
App callbacks: 0/0 results (screen-off/total)

2026-09-04 08:43:50.026 Blocked: 1 filters of com.example.appprofesoresuniversidad(11) becuz only 0 slots left
2026-09-04 08:45:10.001 Blocked: 1 filters of com.example.appprofesoresuniversidad(11) becuz only 0 slots left
```

Al mismo tiempo, el stack de radio del Samsung estaba recibiendo tráfico BLE general:

```text
Le scan: enabled
duration_s: 46.025
results: 2147
```

Alumno:

```text
StudentBeacon: Attendance GATT service added status=0 service=9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c1
BluetoothLeAdvertiser: startAdvertising is called
StudentBeacon: Student attendance peripheral started

GATT Server: com.presencia.app_alumno (Registered)
Service 9f5f7f86-8e67-4f12-a8a5-b7f6f4f7b2c1: started true
Connections: 0
```

Esta prueba descarta falta de simultaneidad, Bluetooth apagado, ausencia de la lista, permisos y fallo del anunciante. La app del profesor preparó exactamente un UUID objetivo y el Huawei publicó el mismo UUID de servicio. El radio del Samsung recibió miles de anuncios generales, pero Android no pudo asignar una ranura al filtro de Presencia y no entregó callbacks a la app.

### Causa comprobada

El descubrimiento falla en el Samsung por agotamiento de las ranuras de filtros BLE del sistema. La implementación del profesor inicia `startScan` con un `ScanFilter` de 128 bits; el sistema registra el escaneo, pero marca ese filtro como bloqueado con `only 0 slots left`. Por eso la interfaz muestra 0 de 1 alumno aunque ambos teléfonos estén trabajando simultáneamente.
