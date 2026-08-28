import 'package:flutter/foundation.dart';
import 'package:permission_handler/permission_handler.dart';

/// Service to handle app permissions
class PermissionService {
  /// Request Bluetooth permissions
  static Future<bool> requestBluetoothPermissions() async {
    final permissions = _platformBluetoothPermissions();

    final statuses = await permissions.request();
    final locationGranted =
        statuses[Permission.location] == PermissionStatus.granted;
    if (!kIsWeb &&
        defaultTargetPlatform == TargetPlatform.iOS &&
        locationGranted) {
      await Permission.locationAlways.request();
    }

    return statuses.values.every(
      (status) => status == PermissionStatus.granted,
    );
  }

  /// Request only the permissions required for the local student BLE handshake.
  ///
  /// On iOS, scanning a connectable BLE peripheral by service UUID requires the
  /// Bluetooth permission, not Location. Location is still requested by the
  /// classroom iBeacon flow through [requestBluetoothPermissions].
  static Future<bool> requestStudentAttendanceBlePermissions() async {
    final permissions = _platformStudentBlePermissions();
    final statuses = await permissions.request();

    return statuses.values.every(
      (status) => status == PermissionStatus.granted,
    );
  }

  /// Requests the scan and foreground location permissions required by
  /// standard iBeacon ranging. It is kept separate from the GATT permission so
  /// denying Location never disables Android students using the Presencia app.
  static Future<bool> requestStudentIBeaconPermissions() async {
    if (kIsWeb) return false;
    final statuses = await _platformBluetoothPermissions().request();
    return statuses.values.every(
      (status) =>
          status == PermissionStatus.granted ||
          status == PermissionStatus.limited,
    );
  }

  /// Check if Bluetooth permissions are granted
  static Future<bool> hasBluetoothPermissions() async {
    final permissions = _platformBluetoothPermissions();

    for (final permission in permissions) {
      final status = await permission.status;
      if (status != PermissionStatus.granted) {
        return false;
      }
    }

    return true;
  }

  static List<Permission> _platformBluetoothPermissions() {
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return [
        Permission.bluetooth,
        Permission.bluetoothScan,
        Permission.bluetoothConnect,
        Permission.location,
      ];
    }

    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.iOS) {
      return [Permission.location];
    }

    return [Permission.bluetooth, Permission.location];
  }

  static List<Permission> _platformStudentBlePermissions() {
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return [
        Permission.bluetooth,
        Permission.bluetoothScan,
        Permission.bluetoothConnect,
      ];
    }

    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.iOS) {
      return [Permission.bluetooth];
    }

    return [Permission.bluetooth];
  }
}
