import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:universal_ble/universal_ble.dart';
import '../shared/models/alumno.dart';

/// Resultado del matching entre un dispositivo BT y un alumno
class BluetoothMatch {
  final Alumno alumno;
  final String deviceName;
  final String deviceId;
  final double matchScore; // 0.0 - 1.0
  final int? rssi;

  BluetoothMatch({
    required this.alumno,
    required this.deviceName,
    required this.deviceId,
    required this.matchScore,
    this.rssi,
  });
}

/// Dispositivo Bluetooth descubierto
class DiscoveredDevice {
  final String name;
  final String id;
  final int? rssi;
  final bool isSystemDevice;
  final DateTime discoveredAt;

  DiscoveredDevice({
    required this.name,
    required this.id,
    this.rssi,
    this.isSystemDevice = false,
    required this.discoveredAt,
  });

  @override
  bool operator ==(Object other) => other is DiscoveredDevice && other.id == id;

  @override
  int get hashCode => id.hashCode;
}

/// GAP Service UUID (Generic Access Profile)
const String _gapServiceUuid = '1800';

/// Device Name Characteristic UUID
const String _deviceNameCharUuid = '2A00';

/// Generic names that BLE reports instead of the real device name.
/// These need to be resolved by connecting and reading GAP profile.
const Set<String> _genericDeviceNames = {
  'iphone',
  'ipad',
  'ipod',
  'apple watch',
  'macbook',
  'macbook pro',
  'macbook air',
  'imac',
  'mac mini',
  'mac pro',
  'mac studio',
  'android',
  'galaxy',
  'pixel',
  'samsung',
  'huawei',
  'xiaomi',
  'redmi',
  'oppo',
  'vivo',
  'motorola',
};

/// Check if a name is generic (needs resolution to find real name)
bool _isGenericName(String name) {
  final lower = name.toLowerCase().trim();
  if (lower.isEmpty) return true;
  return _genericDeviceNames.contains(lower);
}

/// Servicio para escaneo Bluetooth y matching con lista de alumnos.
/// Estrategia: escanea BLE, luego conecta a dispositivos sin nombre
/// o con nombre genérico (e.g. "iPhone") para leer su nombre REAL
/// desde el perfil GAP (Generic Access → Device Name).
class BluetoothAttendanceService {
  // Singleton
  static final BluetoothAttendanceService _instance =
      BluetoothAttendanceService._internal();
  factory BluetoothAttendanceService() => _instance;
  BluetoothAttendanceService._internal();

  // Stream controllers
  final _devicesController =
      StreamController<List<DiscoveredDevice>>.broadcast();
  final _matchesController = StreamController<List<BluetoothMatch>>.broadcast();
  final _scanningController = StreamController<bool>.broadcast();
  final _scanCycleController = StreamController<int>.broadcast();

  // State
  final Map<String, DiscoveredDevice> _discoveredDevices = {};
  final Set<String> _unresolvedDeviceIds = {};
  final Map<String, String> _unresolvedGenericNames =
      {}; // deviceId -> generic name
  final Set<String> _failedResolutions = {}; // Don't retry failed devices
  List<Alumno> _currentStudents = [];
  bool _isScanning = false;
  bool _shouldKeepScanning = false;
  int _scanCycle = 0;
  StreamSubscription<BleDevice>? _scanSubscription;

  // Public streams
  Stream<List<DiscoveredDevice>> get devicesStream => _devicesController.stream;
  Stream<List<BluetoothMatch>> get matchesStream => _matchesController.stream;
  Stream<bool> get scanningStream => _scanningController.stream;
  Stream<int> get scanCycleStream => _scanCycleController.stream;
  bool get isScanning => _isScanning;
  int get scanCycle => _scanCycle;
  List<DiscoveredDevice> get discoveredDevices =>
      _discoveredDevices.values.toList();

  /// Request BLE permissions (auto-handled by universal_ble on iOS/macOS)
  Future<bool> requestPermissions() async {
    try {
      final state = await UniversalBle.getBluetoothAvailabilityState();
      debugPrint('🔵 BT availability: $state');
      return state == AvailabilityState.poweredOn;
    } catch (e) {
      debugPrint('🔵 Error requesting permissions: $e');
      return false;
    }
  }

  /// Check if Bluetooth is available and on
  Future<bool> isBluetoothReady() async {
    try {
      final state = await UniversalBle.getBluetoothAvailabilityState();
      debugPrint('🔵 BT availability: $state');
      return state == AvailabilityState.poweredOn;
    } catch (e) {
      debugPrint('Error checking Bluetooth state: $e');
      return false;
    }
  }

  /// Start scanning for nearby devices.
  /// Strategy:
  /// 1. Get system-paired devices (have names)
  /// 2. BLE scan to find nearby devices
  /// 3. Connect to unnamed/generic-named devices to read GAP Device Name
  /// 4. Match device names against student list
  Future<void> startScan({
    required List<Alumno> students,
    Duration cycleDuration = const Duration(seconds: 8),
  }) async {
    if (_isScanning) return;

    _currentStudents = students;
    _discoveredDevices.clear();
    _unresolvedDeviceIds.clear();
    _unresolvedGenericNames.clear();
    _failedResolutions.clear();
    _isScanning = true;
    _shouldKeepScanning = true;
    _scanCycle = 0;
    _scanningController.add(true);
    _scanCycleController.add(0);

    debugPrint('🔵 Buscando ${students.length} alumnos por Bluetooth...');
    debugPrint('🔵 Alumnos a buscar:');
    for (final s in students) {
      debugPrint('   👤 ${s.name}');
    }

    // Step 1: Get system-paired devices
    await _fetchSystemDevices();

    // Step 2: BLE scanning cycles + name resolution
    while (_shouldKeepScanning) {
      _scanCycle++;
      _scanCycleController.add(_scanCycle);
      debugPrint('🔵 === Ciclo $_scanCycle ===');

      try {
        // BLE scan phase
        _scanSubscription?.cancel();
        _scanSubscription = UniversalBle.scanStream.listen((bleDevice) {
          _processScanResult(bleDevice);
        });

        await UniversalBle.startScan();
        await Future.delayed(cycleDuration);
        await UniversalBle.stopScan();
        _scanSubscription?.cancel();
        _scanSubscription = null;

        // Name resolution phase: connect to unnamed/generic devices to read GAP name
        final toResolve = {
          ..._unresolvedDeviceIds,
          ..._unresolvedGenericNames.keys,
        }.where((id) => !_failedResolutions.contains(id)).toSet();

        if (_shouldKeepScanning && toResolve.isNotEmpty) {
          await _resolveDeviceNames(toResolve);
        }

        // Re-fetch system devices (in case new connections appeared)
        if (_shouldKeepScanning) {
          await _fetchSystemDevices();
        }

        final named = _discoveredDevices.values.length;
        final matches = matchStudents(_currentStudents);
        debugPrint(
          '🔵 Ciclo $_scanCycle: $named dispositivos con nombre, '
          '${matches.length} coincidencias con alumnos',
        );

        if (_shouldKeepScanning) {
          await Future.delayed(const Duration(seconds: 1));
        }
      } catch (e) {
        debugPrint('❌ Error ciclo $_scanCycle: $e');
        await Future.delayed(const Duration(seconds: 2));
      }
    }

    _isScanning = false;
    _scanningController.add(false);
    debugPrint('🔵 Escaneo terminado después de $_scanCycle ciclos.');
  }

  /// Fetch system-paired/connected devices
  Future<void> _fetchSystemDevices() async {
    try {
      final systemDevices = await UniversalBle.getSystemDevices(
        withServices: [],
      );
      for (final device in systemDevices) {
        final name = device.name ?? '';
        if (name.isNotEmpty && !_isGenericName(name)) {
          final isNew = !_discoveredDevices.containsKey(device.deviceId);
          if (isNew) {
            debugPrint('📱 Sistema: "$name" (${device.deviceId})');
          }
          _discoveredDevices[device.deviceId] = DiscoveredDevice(
            name: name,
            id: device.deviceId,
            isSystemDevice: true,
            discoveredAt: DateTime.now(),
          );
        } else if (name.isNotEmpty && _isGenericName(name)) {
          // Generic system device — queue for name resolution too
          if (!_failedResolutions.contains(device.deviceId)) {
            _unresolvedGenericNames[device.deviceId] = name;
            debugPrint(
              '🔄 Sistema genérico: "$name" (${device.deviceId}) → intentará leer nombre real',
            );
          }
        }
      }
      _emitResults();
    } catch (e) {
      debugPrint('⚠️ Error obteniendo dispositivos del sistema: $e');
    }
  }

  /// Process a BLE scan result — only log named devices or collect unnamed for resolution
  void _processScanResult(BleDevice bleDevice) {
    final name = bleDevice.name ?? '';
    final deviceId = bleDevice.deviceId;
    final rssi = bleDevice.rssi;

    if (name.isNotEmpty && !_isGenericName(name)) {
      // Device has a REAL name (not generic) — add it directly
      final isNew = !_discoveredDevices.containsKey(deviceId);
      if (isNew) {
        debugPrint('📱 BLE: "$name" ($deviceId) RSSI: $rssi');
      }
      _discoveredDevices[deviceId] = DiscoveredDevice(
        name: name,
        id: deviceId,
        rssi: rssi,
        discoveredAt: DateTime.now(),
      );
      _emitResults();
    } else if (name.isNotEmpty && _isGenericName(name)) {
      // Generic name like "iPhone" — queue for GAP name resolution
      if (!_failedResolutions.contains(deviceId)) {
        final isNew = !_unresolvedGenericNames.containsKey(deviceId);
        if (isNew) {
          debugPrint(
            '🔄 BLE genérico: "$name" ($deviceId) RSSI: $rssi → intentará leer nombre real',
          );
        }
        _unresolvedGenericNames[deviceId] = name;
      }
    } else {
      // No name at all — queue for resolution
      if (!_failedResolutions.contains(deviceId)) {
        _unresolvedDeviceIds.add(deviceId);
      }
    }
  }

  /// Connect to unnamed/generic devices and read their Device Name from GAP profile
  Future<void> _resolveDeviceNames(Set<String> deviceIds) async {
    // Take up to 5 devices per cycle to avoid spending too much time
    final idsToResolve = deviceIds.take(5).toList();

    if (idsToResolve.isEmpty) return;

    debugPrint(
      '🔍 Intentando leer nombre de ${idsToResolve.length} dispositivos...',
    );

    for (final deviceId in idsToResolve) {
      if (!_shouldKeepScanning) break;

      try {
        // Connect to the device
        await UniversalBle.connect(deviceId);

        // Brief wait for connection to stabilize
        await Future.delayed(const Duration(milliseconds: 500));

        // Discover services to find GAP
        final services = await UniversalBle.discoverServices(deviceId);

        String resolvedName = '';

        // Look for GAP service (0x1800)
        for (final service in services) {
          final serviceUuid = service.uuid.toLowerCase();
          if (serviceUuid.contains(_gapServiceUuid.toLowerCase())) {
            // Found GAP service — look for Device Name characteristic (0x2A00)
            for (final char in service.characteristics) {
              final charUuid = char.uuid.toLowerCase();
              if (charUuid.contains(_deviceNameCharUuid.toLowerCase())) {
                try {
                  final value = await UniversalBle.readValue(
                    deviceId,
                    service.uuid,
                    char.uuid,
                  );
                  if (value.isNotEmpty) {
                    resolvedName = String.fromCharCodes(value);
                    debugPrint(
                      '✅ Nombre resuelto: "$resolvedName" ($deviceId)',
                    );
                  }
                } catch (e) {
                  debugPrint('⚠️ Error leyendo nombre $deviceId: $e');
                }
                break;
              }
            }
            break;
          }
        }

        // Disconnect
        try {
          await UniversalBle.disconnect(deviceId);
        } catch (_) {}

        if (resolvedName.isNotEmpty) {
          _discoveredDevices[deviceId] = DiscoveredDevice(
            name: resolvedName,
            id: deviceId,
            discoveredAt: DateTime.now(),
          );
          _unresolvedDeviceIds.remove(deviceId);
          _emitResults();
        } else {
          _failedResolutions.add(deviceId);
          _unresolvedDeviceIds.remove(deviceId);
        }
      } catch (e) {
        // Connection failed — mark as failed so we don't retry
        _failedResolutions.add(deviceId);
        _unresolvedDeviceIds.remove(deviceId);
        try {
          await UniversalBle.disconnect(deviceId);
        } catch (_) {}
      }
    }
  }

  /// Stop scanning
  Future<void> stopScan() async {
    _shouldKeepScanning = false;

    final named = _discoveredDevices.values.toList();
    final matches = matchStudents(_currentStudents);

    debugPrint('🔵 Detenido después de $_scanCycle ciclos.');
    debugPrint('🔵 ${named.length} dispositivos con nombre:');
    for (var d in named) {
      debugPrint('   📱 "${d.name}" (${d.id})');
    }
    debugPrint('🔵 ${matches.length} coincidencias con alumnos:');
    for (var m in matches) {
      debugPrint(
        '   ✅ ${m.alumno.name} ← "${m.deviceName}" (score: ${m.matchScore.toStringAsFixed(2)})',
      );
    }

    try {
      await UniversalBle.stopScan();
    } catch (e) {
      debugPrint('Error stopping scan: $e');
    }
    _scanSubscription?.cancel();
    _scanSubscription = null;
  }

  // =============================================
  // Matching logic
  // =============================================

  void _emitResults() {
    _devicesController.add(_discoveredDevices.values.toList());
    final matches = matchStudents(_currentStudents);
    _matchesController.add(matches);
  }

  /// Match discovered device names against student list
  List<BluetoothMatch> matchStudents(List<Alumno> students) {
    final matches = <BluetoothMatch>[];

    for (final student in students) {
      BluetoothMatch? bestMatch;
      double bestScore = 0;

      for (final device in _discoveredDevices.values) {
        final score = _calculateMatchScore(student.name, device.name);

        if (score > bestScore && score >= 0.5) {
          bestScore = score;
          bestMatch = BluetoothMatch(
            alumno: student,
            deviceName: device.name,
            deviceId: device.id,
            matchScore: score,
            rssi: device.rssi,
          );
        }
      }

      if (bestMatch != null) {
        matches.add(bestMatch);
        debugPrint(
          '🎯 Match: "${bestMatch.alumno.name}" ← "${bestMatch.deviceName}" '
          '(${bestMatch.matchScore.toStringAsFixed(2)})',
        );
      }
    }

    return matches;
  }

  /// Calculate match score between student name and device name
  double _calculateMatchScore(String studentName, String deviceName) {
    final normalizedStudent = _normalize(studentName);
    final normalizedDevice = _normalize(deviceName);

    if (normalizedStudent == normalizedDevice) return 1.0;

    if (normalizedStudent.contains(normalizedDevice) ||
        normalizedDevice.contains(normalizedStudent)) {
      final longer = normalizedStudent.length > normalizedDevice.length
          ? normalizedStudent.length
          : normalizedDevice.length;
      final shorter = normalizedStudent.length < normalizedDevice.length
          ? normalizedStudent.length
          : normalizedDevice.length;
      return (shorter / longer).clamp(0.0, 1.0);
    }

    final studentWords = normalizedStudent
        .split(' ')
        .where((w) => w.length > 2)
        .toSet();
    final deviceWords = normalizedDevice
        .split(' ')
        .where((w) => w.length > 2)
        .toSet();

    if (studentWords.isEmpty || deviceWords.isEmpty) return 0.0;

    final commonWords = studentWords.intersection(deviceWords);
    if (commonWords.isEmpty) return 0.0;

    final jaccard = commonWords.length / studentWords.union(deviceWords).length;
    final deviceMatchRatio = commonWords.length / deviceWords.length;

    return (deviceMatchRatio * 0.7 + jaccard * 0.3).clamp(0.0, 1.0);
  }

  String _normalize(String name) {
    return name
        .toUpperCase()
        .replaceAll(RegExp(r'[ÁÀÂÄ]'), 'A')
        .replaceAll(RegExp(r'[ÉÈÊË]'), 'E')
        .replaceAll(RegExp(r'[ÍÌÎÏ]'), 'I')
        .replaceAll(RegExp(r'[ÓÒÔÖ]'), 'O')
        .replaceAll(RegExp(r'[ÚÙÛÜ]'), 'U')
        .replaceAll('Ñ', 'N')
        .replaceAll(RegExp(r'[^A-Z0-9 ]'), '')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
  }

  void dispose() {
    stopScan();
    _devicesController.close();
    _matchesController.close();
    _scanningController.close();
    _scanCycleController.close();
  }
}
