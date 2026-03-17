import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:universal_ble/universal_ble.dart';
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
  // ── Estado interno ──────────────────────────────────────────────
  Completer<BeaconVerificationResult>? _completer;
  Timer? _timeoutTimer;
  bool _isScanning = false;
  String? _targetUuid;

  /// Stream para notificar progreso durante el escaneo.
  /// Emite el nombre de cada dispositivo encontrado (para debug UI).
  final _progressController = StreamController<String>.broadcast();
  Stream<String> get progressStream => _progressController.stream;

  /// Indica si hay un escaneo activo.
  bool get isScanning => _isScanning;

  /// Verifica que el beacon del salón está cerca.
  ///
  /// [beaconUuid] — service UUID del beacon asignado al salón.
  /// Retorna [BeaconVerificationResult.detected] si se encuentra
  /// dentro del [timeout], o el resultado de error correspondiente.
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
      final state = await UniversalBle.getBluetoothAvailabilityState();
      if (state != AvailabilityState.poweredOn) {
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

    // 3. Registrar callback de escaneo
    UniversalBle.onScanResult = _onScanResult;

    // 4. Timer de timeout
    _timeoutTimer = Timer(timeout, () {
      Logger.info(
        '[BLE-Beacon] Timeout — no se detectó el beacon en '
        '${timeout.inSeconds}s',
      );
      _finishScan(BeaconVerificationResult.timeout);
    });

    // 5. Iniciar escaneo BLE
    try {
      Logger.info(
        '[BLE-Beacon] Iniciando escaneo BLE '
        '(timeout: ${timeout.inSeconds}s)',
      );
      Logger.info('[BLE-Beacon] Buscando service UUID: $beaconUuid');

      await UniversalBle.startScan(
        scanFilter: ScanFilter(withServices: [beaconUuid]),
      );
    } catch (e) {
      Logger.error('[BLE-Beacon] Error iniciando escaneo', e);
      _finishScan(BeaconVerificationResult.error);
    }

    return _completer!.future;
  }

  /// Callback invocado por cada dispositivo BLE encontrado.
  /// Dado que el scan ya filtra por el service UUID del beacon,
  /// cualquier dispositivo encontrado es el beacon buscado.
  void _onScanResult(BleDevice device) {
    final name = device.name ?? 'Sin nombre';
    final id = device.deviceId;

    debugPrint('[BLE-Beacon] Dispositivo: $name ($id)');
    _progressController.add(name);

    // El scan filter ya garantiza que sólo llegan dispositivos
    // que anuncian el service UUID buscado
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

    // Detener escaneo BLE
    UniversalBle.stopScan().catchError((e) {
      Logger.error('[BLE-Beacon] Error deteniendo escaneo', e);
    });

    // Limpiar callback
    UniversalBle.onScanResult = (_) {};

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
