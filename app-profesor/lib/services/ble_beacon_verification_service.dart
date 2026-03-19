import 'dart:async';
import 'package:flutter/foundation.dart';
import 'native_ble_channel.dart';
import '../core/utils/utils.dart';

/// Resultado de la verificación BLE del beacon
enum BeaconVerificationResult {
  /// Beacon detectado — profesor está en el salón
  detected,

  /// No se detectó el beacon dentro del tiempo límite
  timeout,

  /// Bluetooth no disponible o apagado
  bluetoothUnavailable,

  /// Error durante el escaneo
  error,
}

/// Servicio para verificar la presencia del profesor en el salón
/// mediante la detección de un beacon BLE por su service UUID.
///
/// Flujo:
/// 1. Verifica que Bluetooth esté encendido
/// 2. Inicia escaneo BLE filtrando por el service UUID del beacon
/// 3. Retorna [BeaconVerificationResult.detected] si lo encuentra,
///    o [BeaconVerificationResult.timeout] si se agota el tiempo.
class BleBeaconVerificationService {
  final _ble = NativeBleChannel();

  // ── Estado interno ──────────────────────────────────────────────
  Completer<BeaconVerificationResult>? _completer;
  Timer? _timeoutTimer;
  bool _isScanning = false;
  String? _targetUuid;
  StreamSubscription<NativeBleDevice>? _scanSubscription;

  /// Stream para notificar progreso durante el escaneo.
  final _progressController = StreamController<String>.broadcast();
  Stream<String> get progressStream => _progressController.stream;

  /// Indica si hay un escaneo activo.
  bool get isScanning => _isScanning;

  /// Verifica que el beacon del salón está cerca.
  Future<BeaconVerificationResult> verifyBeaconPresence({
    required String beaconUuid,
    Duration timeout = const Duration(seconds: 5),
  }) async {
    if (_isScanning) {
      Logger.info('[BLE-Beacon] Ya hay un escaneo en progreso');
      return BeaconVerificationResult.error;
    }

    // 1. Verificar que Bluetooth esté disponible
    try {
      final available = await _ble.isBluetoothAvailable();
      if (!available) {
        final state = await _ble.getBluetoothState();
        Logger.info('[BLE-Beacon] Bluetooth no disponible: $state');
        return BeaconVerificationResult.bluetoothUnavailable;
      }
    } catch (e) {
      Logger.error('[BLE-Beacon] Error verificando Bluetooth', e);
      return BeaconVerificationResult.bluetoothUnavailable;
    }

    // 2. Preparar escaneo
    _isScanning = true;
    _targetUuid = beaconUuid;
    _completer = Completer<BeaconVerificationResult>();

    // 3. Iniciar escaneo BLE
    try {
      Logger.info(
        '[BLE-Beacon] Iniciando escaneo BLE '
        '(timeout: ${timeout.inSeconds}s)',
      );
      Logger.info('[BLE-Beacon] Buscando iBeacon UUID: $beaconUuid');

      // En debug, escanear sin filtro primero para ver todos los dispositivos
      if (kDebugMode) {
        debugPrint('══════════════════════════════════════════════');
        debugPrint('[BLE-DEBUG] Escaneo SIN filtro — 3s para ver TODOS los dispositivos');
        debugPrint('[BLE-DEBUG] UUID objetivo: $beaconUuid');
        debugPrint('══════════════════════════════════════════════');

        final devicesFound = <String>{};
        final debugSub = _ble.scanStream.listen((device) {
          if (!devicesFound.contains(device.deviceId)) {
            devicesFound.add(device.deviceId);
            debugPrint('[BLE-DEBUG] #${devicesFound.length} '
                'Nombre: "${device.name}" | ID: ${device.deviceId} | RSSI: ${device.rssi}');
            if (device.serviceUuids.isNotEmpty) {
              debugPrint('[BLE-DEBUG]   Services: ${device.serviceUuids.join(", ")}');
            }
          }
        });

        await _ble.startScan();
        await Future.delayed(const Duration(seconds: 3));
        await _ble.stopScan();
        await debugSub.cancel();

        debugPrint('══════════════════════════════════════════════');
        debugPrint('[BLE-DEBUG] Total dispositivos encontrados: ${devicesFound.length}');
        debugPrint('[BLE-DEBUG] Ahora buscando iBeacon: $beaconUuid');
        debugPrint('══════════════════════════════════════════════');

        // Pequeña pausa antes de escaneo filtrado
        await Future.delayed(const Duration(milliseconds: 500));
      }

      // Si el completer ya se completó (timeout prematuro), salir
      if (_completer == null || _completer!.isCompleted) {
        return _completer?.future ?? Future.value(BeaconVerificationResult.error);
      }

      // 4. Timer de timeout para el escaneo real (iBeacon ranging)
      _timeoutTimer = Timer(timeout, () {
        Logger.info(
          '[BLE-Beacon] Timeout — no se detectó el beacon en '
          '${timeout.inSeconds}s',
        );
        _finishScan(BeaconVerificationResult.timeout);
      });

      // 5. Escaneo real — usa iBeacon ranging (iOS) o manufacturer data parsing (Android)
      _scanSubscription = _ble.scanStream.listen(_onScanResult);
      // Pequeña pausa para asegurar que el EventChannel onListen se registre
      // antes de iniciar el escaneo nativo
      await Future.delayed(const Duration(milliseconds: 200));
      debugPrint('[BLE-Beacon] Subscribido al scanStream, iniciando escaneo filtrado...');
      final scanStatus = await _ble.startScan(serviceUuids: [beaconUuid]);
      debugPrint('[BLE-Beacon] startScan retornó: $scanStatus');
    } catch (e) {
      Logger.error('[BLE-Beacon] Error iniciando escaneo', e);
      _finishScan(BeaconVerificationResult.error);
    }

    return _completer!.future;
  }

  /// Callback invocado por cada dispositivo BLE encontrado.
  void _onScanResult(NativeBleDevice device) {
    final name = device.name.isNotEmpty ? device.name : 'Sin nombre';
    final id = device.deviceId;

    debugPrint('[BLE-Beacon] Dispositivo: $name ($id)');
    _progressController.add(name);

    Logger.info(
      '[BLE-Beacon] ✅ ¡BEACON DETECTADO! '
      'Nombre: $name, ID: $id, UUID: $_targetUuid',
    );
    _finishScan(BeaconVerificationResult.detected);
  }

  /// Finaliza el escaneo y emite el resultado.
  void _finishScan(BeaconVerificationResult result) {
    if (!_isScanning) return;

    _timeoutTimer?.cancel();
    _timeoutTimer = null;
    _isScanning = false;

    _scanSubscription?.cancel();
    _scanSubscription = null;

    _ble.stopScan();

    if (_completer != null && !_completer!.isCompleted) {
      _completer!.complete(result);
    }
    _completer = null;
  }

  /// Cancela un escaneo en progreso.
  void cancelScan() {
    if (_isScanning) {
      Logger.info('[BLE-Beacon] Escaneo cancelado por el usuario');
      _finishScan(BeaconVerificationResult.timeout);
    }
  }

  /// Libera recursos.
  void dispose() {
    cancelScan();
    _progressController.close();
  }
}
