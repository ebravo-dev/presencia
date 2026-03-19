import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Dispositivo BLE descubierto por el escaneo nativo.
class NativeBleDevice {
  final String deviceId;
  final String name;
  final int? rssi;
  final List<String> serviceUuids;

  NativeBleDevice({
    required this.deviceId,
    required this.name,
    this.rssi,
    this.serviceUuids = const [],
  });

  factory NativeBleDevice.fromMap(Map<dynamic, dynamic> map) {
    return NativeBleDevice(
      deviceId: map['deviceId'] as String? ?? '',
      name: map['name'] as String? ?? '',
      rssi: map['rssi'] as int?,
      serviceUuids: (map['serviceUuids'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [],
    );
  }

  @override
  String toString() =>
      'NativeBleDevice($name, $deviceId, rssi: $rssi, services: $serviceUuids)';
}

/// Canal de comunicación con BLE nativo (iOS CoreBluetooth / Android BLE).
class NativeBleChannel {
  static const _method = MethodChannel('com.presencia/ble');
  static const _scanEvent = EventChannel('com.presencia/ble_scan');

  static NativeBleChannel? _instance;
  factory NativeBleChannel() => _instance ??= NativeBleChannel._();
  NativeBleChannel._();

  /// Verifica si el Bluetooth está encendido.
  Future<bool> isBluetoothAvailable() async {
    try {
      final state = await _method.invokeMethod<String>('checkBluetoothState');
      return state == 'poweredOn';
    } catch (e) {
      debugPrint('[NativeBLE] Error checking BT state: $e');
      return false;
    }
  }

  /// Obtiene el estado del Bluetooth como String.
  Future<String> getBluetoothState() async {
    try {
      return await _method.invokeMethod<String>('checkBluetoothState') ??
          'unknown';
    } catch (e) {
      debugPrint('[NativeBLE] Error getting BT state: $e');
      return 'unknown';
    }
  }

  /// Inicia escaneo BLE. Si [serviceUuids] filtra por esos service UUIDs.
  /// Retorna un status string del lado nativo para debug.
  Future<String?> startScan({List<String>? serviceUuids}) async {
    try {
      final status = await _method.invokeMethod<String>('startScan', {
        if (serviceUuids != null && serviceUuids.isNotEmpty)
          'serviceUuids': serviceUuids,
      });
      debugPrint('[NativeBLE] startScan status: $status');
      return status;
    } catch (e) {
      debugPrint('[NativeBLE] Error starting scan: $e');
      rethrow;
    }
  }

  /// Detiene el escaneo BLE.
  Future<void> stopScan() async {
    try {
      await _method.invokeMethod('stopScan');
    } catch (e) {
      debugPrint('[NativeBLE] Error stopping scan: $e');
    }
  }

  /// Stream de resultados de escaneo.
  /// Crea un nuevo broadcast stream cada vez para que el EventChannel
  /// vuelva a llamar onListen en el lado nativo.
  /// Filtra eventos de debug (los imprime) y solo emite dispositivos.
  Stream<NativeBleDevice> get scanStream {
    return _scanEvent.receiveBroadcastStream().where((event) {
      if (event is Map) {
        final type = event['type'] as String?;
        if (type == 'debug') {
          debugPrint('[NativeBLE-native] ${event['message']}');
          return false; // no emitir como dispositivo
        }
      }
      return true;
    }).map((event) {
      return NativeBleDevice.fromMap(event as Map<dynamic, dynamic>);
    });
  }

  /// Conecta a un dispositivo y lee su nombre del perfil GAP.
  Future<String> connectAndReadName(String deviceId) async {
    try {
      final name = await _method.invokeMethod<String>(
        'connectAndReadName',
        {'deviceId': deviceId},
      );
      return name ?? '';
    } catch (e) {
      debugPrint('[NativeBLE] Error reading name for $deviceId: $e');
      return '';
    }
  }

  /// Desconecta un dispositivo.
  Future<void> disconnect(String deviceId) async {
    try {
      await _method.invokeMethod('disconnect', {'deviceId': deviceId});
    } catch (e) {
      debugPrint('[NativeBLE] Error disconnecting $deviceId: $e');
    }
  }
}
