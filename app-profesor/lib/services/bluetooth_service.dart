import 'package:universal_ble/universal_ble.dart';
import '../core/utils/utils.dart';

/// Service to handle Bluetooth operations using universal_ble.
class BluetoothService {
  static final BluetoothService _instance = BluetoothService._internal();
  factory BluetoothService() => _instance;
  BluetoothService._internal();

  /// Check if Bluetooth is available
  Future<bool> isBluetoothAvailable() async {
    try {
      final state = await UniversalBle.getBluetoothAvailabilityState();
      return state == AvailabilityState.poweredOn;
    } catch (e, stackTrace) {
      Logger.error('Error checking Bluetooth availability', e, stackTrace);
      return false;
    }
  }

  /// Turn on Bluetooth (Android only, no-op on iOS/macOS)
  Future<bool> turnOnBluetooth() async {
    try {
      await UniversalBle.enableBluetooth();
      return true;
    } catch (e, stackTrace) {
      Logger.error('Error turning on Bluetooth', e, stackTrace);
      return false;
    }
  }

  /// Start scanning for devices
  Future<void> startScan() async {
    try {
      Logger.info('Starting BLE scan via universal_ble');
      await UniversalBle.startScan();
    } catch (e, stackTrace) {
      Logger.error('Error starting BLE scan', e, stackTrace);
    }
  }

  /// Stop scanning
  Future<void> stopScan() async {
    try {
      await UniversalBle.stopScan();
      Logger.info('BLE scan stopped');
    } catch (e, stackTrace) {
      Logger.error('Error stopping BLE scan', e, stackTrace);
    }
  }
}
