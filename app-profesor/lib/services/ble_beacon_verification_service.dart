import 'dart:async';
import 'package:flutter/foundation.dart';
import 'native_altbeacon_channel.dart';
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
  final _beacons = NativeAltBeaconChannel();

  // ── Estado interno ──────────────────────────────────────────────
  Completer<BeaconVerificationResult>? _completer;
  Timer? _timeoutTimer;
  bool _isScanning = false;
  String? _targetUuid;
  StreamSubscription<List<AltBeaconDetection>>? _scanSubscription;

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
      final available = await _beacons.isBluetoothAvailable();
      if (!available) {
        Logger.info('[BLE-Beacon] Bluetooth no disponible');
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
      Logger.info('[AltBeacon] Buscando UUID: $beaconUuid');
      if (kDebugMode) {
        debugPrint('[AltBeacon] Iniciando ranging nativo para $beaconUuid');
      }

      // Si el completer ya se completó (timeout prematuro), salir
      if (_completer == null || _completer!.isCompleted) {
        return _completer?.future ??
            Future.value(BeaconVerificationResult.error);
      }

      // 4. Timer de timeout para el escaneo real (iBeacon ranging)
      _timeoutTimer = Timer(timeout, () {
        Logger.info(
          '[BLE-Beacon] Timeout — no se detectó el beacon en '
          '${timeout.inSeconds}s',
        );
        _finishScan(BeaconVerificationResult.timeout);
      });

      _scanSubscription = _beacons.detectionsStream.listen(_onScanResult);
      await Future.delayed(const Duration(milliseconds: 200));
      final started = await _beacons.startScanning(uuids: [beaconUuid]);
      debugPrint('[AltBeacon] startScanning retornó: $started');
    } catch (e) {
      Logger.error('[BLE-Beacon] Error iniciando escaneo', e);
      _finishScan(BeaconVerificationResult.error);
    }

    return _completer!.future;
  }

  /// Callback invocado por cada dispositivo BLE encontrado.
  void _onScanResult(List<AltBeaconDetection> detections) {
    if (detections.isEmpty) return;

    final beacon = detections.first;
    final label = '${beacon.uuid} RSSI: ${beacon.rssi ?? '-'}';
    debugPrint('[AltBeacon] Beacon: $label');
    _progressController.add(label);

    Logger.info(
      '[BLE-Beacon] ✅ ¡BEACON DETECTADO! '
      'UUID: ${beacon.uuid}, objetivo: $_targetUuid',
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

    _beacons.stopScanning();

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
