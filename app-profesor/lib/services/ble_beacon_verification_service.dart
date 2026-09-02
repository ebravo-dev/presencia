import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/utils/utils.dart';
import 'auth_storage_service.dart';
import 'native_altbeacon_channel.dart';

/// Estado final de un escaneo de salones por BLE.
enum BeaconVerificationResult { detected, timeout, bluetoothUnavailable, error }

/// Beacon configurado para un salón.
class ClassroomBeaconReference {
  final String classroom;
  final String uuid;

  const ClassroomBeaconReference({required this.classroom, required this.uuid});
}

/// Salón que resultó más cercano durante el periodo completo de muestreo.
class ClassroomBeaconMatch {
  final ClassroomBeaconReference reference;
  final AltBeaconDetection detection;

  const ClassroomBeaconMatch({
    required this.reference,
    required this.detection,
  });
}

class ClassroomBeaconScanResult {
  final BeaconVerificationResult status;
  final ClassroomBeaconMatch? match;

  const ClassroomBeaconScanResult(this.status, {this.match});
}

/// Elige la señal RSSI más intensa (el valor más alto, por ejemplo -45 antes
/// que -80). Si dos señales tienen el mismo RSSI, el salón principal gana el
/// desempate. La distancia sólo se usa cuando el dispositivo no reporta RSSI.
@visibleForTesting
ClassroomBeaconMatch? selectNearestClassroomBeacon({
  required List<ClassroomBeaconReference> references,
  required Iterable<AltBeaconDetection> detections,
  String? primaryClassroom,
}) {
  final referenceByUuid = <String, ClassroomBeaconReference>{
    for (final reference in references)
      if (reference.uuid.trim().isNotEmpty)
        reference.uuid.trim().toLowerCase(): reference,
  };
  final primaryKey = AuthStorageService.classroomKey(primaryClassroom);
  ClassroomBeaconMatch? best;

  for (final detection in detections) {
    final reference = referenceByUuid[detection.uuid.trim().toLowerCase()];
    if (reference == null) continue;
    final candidate = ClassroomBeaconMatch(
      reference: reference,
      detection: detection,
    );
    if (best == null ||
        _isStronger(candidate, best, primaryClassroomKey: primaryKey)) {
      best = candidate;
    }
  }
  return best;
}

bool _isStronger(
  ClassroomBeaconMatch candidate,
  ClassroomBeaconMatch current, {
  required String primaryClassroomKey,
}) {
  final candidateRssi = candidate.detection.rssi;
  final currentRssi = current.detection.rssi;
  if (candidateRssi != null || currentRssi != null) {
    if (candidateRssi == null) return false;
    if (currentRssi == null) return true;
    if (candidateRssi != currentRssi) return candidateRssi > currentRssi;
  } else {
    final candidateDistance = candidate.detection.distance;
    final currentDistance = current.detection.distance;
    if (candidateDistance != null || currentDistance != null) {
      if (candidateDistance == null) return false;
      if (currentDistance == null) return true;
      if (candidateDistance != currentDistance) {
        return candidateDistance < currentDistance;
      }
    }
  }

  final candidateIsPrimary =
      AuthStorageService.classroomKey(candidate.reference.classroom) ==
      primaryClassroomKey;
  final currentIsPrimary =
      AuthStorageService.classroomKey(current.reference.classroom) ==
      primaryClassroomKey;
  return candidateIsPrimary && !currentIsPrimary;
}

/// Escanea simultáneamente todos los UUID configurados y conserva, para cada
/// beacon, su lectura más intensa. Al terminar el muestreo devuelve el salón
/// del beacon con el RSSI global más alto.
class BleBeaconVerificationService {
  final NativeAltBeaconChannel _beacons;

  BleBeaconVerificationService({NativeAltBeaconChannel? beacons})
    : _beacons = beacons ?? NativeAltBeaconChannel();

  Completer<ClassroomBeaconScanResult>? _completer;
  Timer? _timeoutTimer;
  bool _isScanning = false;
  List<ClassroomBeaconReference> _references = const [];
  String? _primaryClassroom;
  final Map<String, AltBeaconDetection> _strongestByUuid = {};
  StreamSubscription<List<AltBeaconDetection>>? _scanSubscription;

  final _progressController = StreamController<String>.broadcast();
  Stream<String> get progressStream => _progressController.stream;

  bool get isScanning => _isScanning;

  Future<ClassroomBeaconScanResult> detectNearestClassroom({
    required List<ClassroomBeaconReference> beacons,
    String? primaryClassroom,
    Duration timeout = const Duration(seconds: 5),
  }) async {
    if (_isScanning || beacons.isEmpty) {
      return const ClassroomBeaconScanResult(BeaconVerificationResult.error);
    }

    try {
      final available = await _beacons.isBluetoothAvailable();
      if (!available) {
        return const ClassroomBeaconScanResult(
          BeaconVerificationResult.bluetoothUnavailable,
        );
      }
    } catch (error) {
      Logger.error('[BLE-Beacon] Error verificando Bluetooth', error);
      return const ClassroomBeaconScanResult(
        BeaconVerificationResult.bluetoothUnavailable,
      );
    }

    final referencesByUuid = <String, ClassroomBeaconReference>{};
    for (final beacon in beacons) {
      final uuid = beacon.uuid.trim().toLowerCase();
      if (uuid.isNotEmpty) referencesByUuid[uuid] = beacon;
    }
    if (referencesByUuid.isEmpty) {
      return const ClassroomBeaconScanResult(BeaconVerificationResult.error);
    }

    _isScanning = true;
    _references = referencesByUuid.values.toList(growable: false);
    _primaryClassroom = primaryClassroom;
    _strongestByUuid.clear();
    _completer = Completer<ClassroomBeaconScanResult>();

    try {
      final uuids = referencesByUuid.keys.toList(growable: false);
      Logger.info('[AltBeacon] Buscando ${uuids.length} salones');
      if (kDebugMode) {
        debugPrint('[AltBeacon] Iniciando ranging nativo para $uuids');
      }

      _timeoutTimer = Timer(timeout, _completeFromStrongestReading);
      _scanSubscription = _beacons.detectionsStream.listen(_onScanResult);
      await Future<void>.delayed(const Duration(milliseconds: 200));
      final started = await _beacons.startScanning(uuids: uuids);
      if (!started) {
        _finishScan(
          const ClassroomBeaconScanResult(BeaconVerificationResult.error),
        );
      }
    } catch (error) {
      Logger.error('[BLE-Beacon] Error iniciando escaneo', error);
      _finishScan(
        const ClassroomBeaconScanResult(BeaconVerificationResult.error),
      );
    }

    return _completer?.future ??
        const ClassroomBeaconScanResult(BeaconVerificationResult.error);
  }

  void _onScanResult(List<AltBeaconDetection> detections) {
    for (final detection in detections) {
      final uuid = detection.uuid.trim().toLowerCase();
      final current = _strongestByUuid[uuid];
      if (current == null || _isStrongerDetection(detection, current)) {
        _strongestByUuid[uuid] = detection;
      }
      final label = '${detection.uuid} RSSI: ${detection.rssi ?? '-'}';
      debugPrint('[AltBeacon] Beacon: $label');
      _progressController.add(label);
    }
  }

  bool _isStrongerDetection(
    AltBeaconDetection candidate,
    AltBeaconDetection current,
  ) {
    if (candidate.rssi != null || current.rssi != null) {
      if (candidate.rssi == null) return false;
      if (current.rssi == null) return true;
      return candidate.rssi! > current.rssi!;
    }
    if (candidate.distance == null) return false;
    if (current.distance == null) return true;
    return candidate.distance! < current.distance!;
  }

  void _completeFromStrongestReading() {
    final match = selectNearestClassroomBeacon(
      references: _references,
      detections: _strongestByUuid.values,
      primaryClassroom: _primaryClassroom,
    );
    if (match == null) {
      Logger.info('[BLE-Beacon] No se detectó ningún salón configurado');
      _finishScan(
        const ClassroomBeaconScanResult(BeaconVerificationResult.timeout),
      );
      return;
    }

    Logger.info(
      '[BLE-Beacon] Salón más cercano: ${match.reference.classroom}; '
      'RSSI=${match.detection.rssi}',
    );
    _finishScan(
      ClassroomBeaconScanResult(
        BeaconVerificationResult.detected,
        match: match,
      ),
    );
  }

  void _finishScan(ClassroomBeaconScanResult result) {
    if (!_isScanning) return;
    _timeoutTimer?.cancel();
    _timeoutTimer = null;
    _isScanning = false;
    _scanSubscription?.cancel();
    _scanSubscription = null;
    _beacons.stopScanning();

    final completer = _completer;
    _completer = null;
    if (completer != null && !completer.isCompleted) completer.complete(result);
  }

  void cancelScan() {
    if (_isScanning) {
      Logger.info('[BLE-Beacon] Escaneo cancelado por el usuario');
      _finishScan(
        const ClassroomBeaconScanResult(BeaconVerificationResult.timeout),
      );
    }
  }

  void dispose() {
    cancelScan();
    _progressController.close();
  }
}
