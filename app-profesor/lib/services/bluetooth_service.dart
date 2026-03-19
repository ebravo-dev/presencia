import 'native_ble_channel.dart';
import '../core/utils/utils.dart';

/// Service to handle Bluetooth operations using native platform channels.
class BluetoothService {
  static final BluetoothService _instance = BluetoothService._internal();
  factory BluetoothService() => _instance;
  BluetoothService._internal();

  final _ble = NativeBleChannel();

  /// Check if Bluetooth is available
  Future<bool> isBluetoothAvailable() async {
    try {
      return await _ble.isBluetoothAvailable();
    } catch (e, stackTrace) {
      Logger.error('Error checking Bluetooth availability', e, stackTrace);
      return false;
    }
  }

  /// Start scanning for devices
  Future<void> startScan() async {
    try {
      Logger.info('Starting BLE scan via native channel');
      await _ble.startScan();
    } catch (e, stackTrace) {
      Logger.error('Error starting BLE scan', e, stackTrace);
    }
  }

  /// Stop scanning
  Future<void> stopScan() async {
    try {
      await _ble.stopScan();
      Logger.info('BLE scan stopped');
    } catch (e, stackTrace) {
      Logger.error('Error stopping BLE scan', e, stackTrace);
    }
  }
}
