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
        Permission.bluetoothScan,
        Permission.bluetoothConnect,
        Permission.bluetoothAdvertise,
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
      return [Permission.bluetoothScan, Permission.bluetoothConnect];
    }

    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.iOS) {
      return [Permission.bluetooth];
    }

    return [Permission.bluetooth];
  }
}
