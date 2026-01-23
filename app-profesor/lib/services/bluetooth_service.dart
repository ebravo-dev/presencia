import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import '../core/utils/utils.dart';

/// Service to handle Bluetooth operations
class BluetoothService {
  static final BluetoothService _instance = BluetoothService._internal();
  factory BluetoothService() => _instance;
  BluetoothService._internal();

  /// Check if Bluetooth is available
  Future<bool> isBluetoothAvailable() async {
    try {
      final isSupported = await FlutterBluePlus.isSupported;
      if (!isSupported) {
        Logger.error('Bluetooth not supported on this device');
        return false;
      }

      final adapterState = await FlutterBluePlus.adapterState.first;
      return adapterState == BluetoothAdapterState.on;
    } catch (e, stackTrace) {
      Logger.error('Error checking Bluetooth availability', e, stackTrace);
      return false;
    }
  }

  /// Turn on Bluetooth
  Future<bool> turnOnBluetooth() async {
    try {
      await FlutterBluePlus.turnOn();
      return true;
    } catch (e, stackTrace) {
      Logger.error('Error turning on Bluetooth', e, stackTrace);
      return false;
    }
  }

  /// Start scanning for devices
  Future<void> startScan() async {
    try {
      Logger.info('Starting Bluetooth scan');
      await FlutterBluePlus.startScan(timeout: const Duration(seconds: 10));
    } catch (e, stackTrace) {
      Logger.error('Error starting Bluetooth scan', e, stackTrace);
    }
  }

  /// Stop scanning
  Future<void> stopScan() async {
    try {
      await FlutterBluePlus.stopScan();
      Logger.info('Bluetooth scan stopped');
    } catch (e, stackTrace) {
      Logger.error('Error stopping Bluetooth scan', e, stackTrace);
    }
  }
}
