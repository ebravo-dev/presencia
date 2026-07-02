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
}
