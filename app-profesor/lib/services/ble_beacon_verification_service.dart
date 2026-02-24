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
/// mediante la detección del beacon ESP32-C3_BLE por BLE.
///
/// Flujo:
/// 1. Verifica que Bluetooth esté encendido
/// 2. Inicia escaneo BLE
/// 3. Filtra por nombre "ESP32-C3_BLE" o device ID conocido
/// 4. Retorna [BeaconVerificationResult.detected] si lo encuentra,
///    o [BeaconVerificationResult.timeout] si se agota el tiempo.
class BleBeaconVerificationService {
  // ── Configuración del beacon ESP32 ──────────────────────────────
  static const String _beaconName = 'ESP32-C3_BLE';
  static const String _beaconDeviceId = '327210EB-609B-A588-6399-92594A3A9F39';
  static const String _serviceUuid = '12345678-1234-1234-1234-123456789abc';

  // ── Estado interno ──────────────────────────────────────────────
  Completer<BeaconVerificationResult>? _completer;
  Timer? _timeoutTimer;
  bool _isScanning = false;

  /// Stream para notificar progreso durante el escaneo.
  /// Emite el nombre de cada dispositivo encontrado (para debug UI).
  final _progressController = StreamController<String>.broadcast();
  Stream<String> get progressStream => _progressController.stream;

  /// Indica si hay un escaneo activo.
  bool get isScanning => _isScanning;

  /// Verifica que el beacon del salón está cerca.
  ///
  /// Retorna [BeaconVerificationResult.detected] si se encuentra el
  /// ESP32-C3_BLE dentro del [timeout], o el resultado de error
  /// correspondiente en caso contrario.
  Future<BeaconVerificationResult> verifyBeaconPresence({
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
      Logger.info('[BLE-Beacon] Buscando: $_beaconName / $_beaconDeviceId');

      await UniversalBle.startScan(
        scanFilter: ScanFilter(withServices: [_serviceUuid]),
      );
    } catch (e) {
      Logger.error('[BLE-Beacon] Error iniciando escaneo', e);
      _finishScan(BeaconVerificationResult.error);
    }

    return _completer!.future;
  }

  /// Callback invocado por cada dispositivo BLE encontrado.
  void _onScanResult(BleDevice device) {
    final name = device.name ?? 'Sin nombre';
    final id = device.deviceId;

    debugPrint('[BLE-Beacon] Dispositivo: $name ($id)');
    _progressController.add(name);

    // Matchear por nombre O device ID (case-insensitive)
    final nameMatch = name.toLowerCase() == _beaconName.toLowerCase();
    final idMatch = id.toLowerCase() == _beaconDeviceId.toLowerCase();

    if (nameMatch || idMatch) {
      Logger.info(
        '[BLE-Beacon] ✅ ¡BEACON DETECTADO! '
        'Nombre: $name, ID: $id',
      );
      _finishScan(BeaconVerificationResult.detected);
    }
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
