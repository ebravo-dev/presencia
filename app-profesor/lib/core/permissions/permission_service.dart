import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';

enum ScanRequirement {
  ready,
  permissionRequired,
  permissionDenied,
  bluetoothOff,
  locationServicesOff,
  unsupported,
  unavailable,
}

enum ScanSettingsTarget { app, bluetooth, location }

class ScanRequirementResult {
  final ScanRequirement requirement;
  final ScanSettingsTarget? settingsTarget;

  const ScanRequirementResult(this.requirement, {this.settingsTarget});

  bool get isReady => requirement == ScanRequirement.ready;
}

/// Service to handle app permissions
class PermissionService {
  static const _studentBleChannel = MethodChannel(
    'com.presencia/student_attendance_ble',
  );

  /// Request Bluetooth permissions
  static Future<bool> requestBluetoothPermissions() async {
    final permissions = await _classroomScanPermissions();
    return (await _permissionResult(permissions, request: true)).isReady;
  }

  /// Request only the permissions required for the local student BLE handshake.
  ///
  /// On iOS, scanning a connectable BLE peripheral by service UUID requires the
  /// Bluetooth permission, not Location. Location is still requested by the
  /// classroom iBeacon flow through [requestBluetoothPermissions].
  static Future<bool> requestStudentAttendanceBlePermissions() async {
    final permissions = await _platformStudentBlePermissions();
    return (await _permissionResult(permissions, request: true)).isReady;
  }

  static Future<ScanRequirementResult> checkStudentAttendanceScan({
    bool requestPermissions = false,
  }) async {
    try {
      final permissions = await _platformStudentBlePermissions();
      final permissionResult = await _permissionResult(
        permissions,
        request: requestPermissions,
      );
      if (!permissionResult.isReady) return permissionResult;

      final sdkInt = await _androidSdkInt();
      return await _checkServices(
        requiresLocationServices:
            !kIsWeb &&
            defaultTargetPlatform == TargetPlatform.android &&
            sdkInt <= 30,
      );
    } catch (_) {
      return const ScanRequirementResult(ScanRequirement.unavailable);
    }
  }

  static Future<ScanRequirementResult> checkClassroomBeaconScan({
    bool requestPermissions = false,
  }) async {
    try {
      final permissions = await _classroomScanPermissions();
      final permissionResult = await _permissionResult(
        permissions,
        request: requestPermissions,
      );
      if (!permissionResult.isReady) return permissionResult;

      final sdkInt = await _androidSdkInt();
      return await _checkServices(
        requiresLocationServices:
            !kIsWeb &&
            (defaultTargetPlatform == TargetPlatform.iOS ||
                (defaultTargetPlatform == TargetPlatform.android &&
                    sdkInt <= 30)),
      );
    } catch (_) {
      return const ScanRequirementResult(ScanRequirement.unavailable);
    }
  }

  static Future<bool> openSettings(ScanSettingsTarget target) async {
    if (target == ScanSettingsTarget.app) return openAppSettings();
    try {
      return await _studentBleChannel.invokeMethod<bool>(
            target == ScanSettingsTarget.bluetooth
                ? 'openBluetoothSettings'
                : 'openLocationSettings',
          ) ??
          false;
    } on PlatformException {
      return openAppSettings();
    } on MissingPluginException {
      return openAppSettings();
    }
  }

  /// Check if Bluetooth permissions are granted
  static Future<bool> hasBluetoothPermissions() async {
    final permissions = await _classroomScanPermissions();

    for (final permission in permissions) {
      final status = await permission.status;
      if (!status.isGranted && !status.isLimited) {
        return false;
      }
    }

    return true;
  }

  static Future<List<Permission>> _classroomScanPermissions() async {
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return [
        Permission.bluetoothScan,
        Permission.bluetoothConnect,
        if (await _androidSdkInt() <= 30) Permission.locationWhenInUse,
      ];
    }

    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.iOS) {
      return [Permission.bluetooth, Permission.locationWhenInUse];
    }

    return [Permission.bluetooth, Permission.location];
  }

  static Future<List<Permission>> _platformStudentBlePermissions() async {
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      // Android 12+ has a dedicated Nearby devices permission. Android 11 and
      // below still require location to perform a BLE scan.
      final sdkInt = await _androidSdkInt();
      return [
        Permission.bluetoothScan,
        Permission.bluetoothConnect,
        if (sdkInt <= 30) Permission.locationWhenInUse,
      ];
    }

    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.iOS) {
      return [Permission.bluetooth];
    }

    return [Permission.bluetooth];
  }

  static Future<int> _androidSdkInt() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return 0;
    try {
      return await _studentBleChannel.invokeMethod<int>('getAndroidSdkInt') ??
          30;
    } on PlatformException {
      return 30;
    } on MissingPluginException {
      return 30;
    }
  }

  static Future<ScanRequirementResult> _permissionResult(
    List<Permission> permissions, {
    required bool request,
  }) async {
    final statuses = request
        ? await permissions.request()
        : <Permission, PermissionStatus>{
            for (final permission in permissions)
              permission: await permission.status,
          };
    if (statuses.values.every(
      (status) => status.isGranted || status.isLimited,
    )) {
      return const ScanRequirementResult(ScanRequirement.ready);
    }
    final permanentlyDenied = statuses.values.any(
      (status) => status.isPermanentlyDenied || status.isRestricted,
    );
    return ScanRequirementResult(
      permanentlyDenied
          ? ScanRequirement.permissionDenied
          : ScanRequirement.permissionRequired,
      settingsTarget: permanentlyDenied ? ScanSettingsTarget.app : null,
    );
  }

  static Future<ScanRequirementResult> _checkServices({
    required bool requiresLocationServices,
  }) async {
    if (!kIsWeb &&
        (defaultTargetPlatform == TargetPlatform.android ||
            defaultTargetPlatform == TargetPlatform.iOS)) {
      try {
        final state = await _studentBleChannel.invokeMethod<String>(
          'checkBluetoothState',
        );
        switch (state) {
          case 'poweredOff':
            return const ScanRequirementResult(
              ScanRequirement.bluetoothOff,
              settingsTarget: ScanSettingsTarget.bluetooth,
            );
          case 'unsupported':
            return const ScanRequirementResult(ScanRequirement.unsupported);
          case 'unauthorized':
            return const ScanRequirementResult(
              ScanRequirement.permissionDenied,
              settingsTarget: ScanSettingsTarget.app,
            );
          case 'poweredOn':
            break;
          default:
            return const ScanRequirementResult(ScanRequirement.unavailable);
        }
      } on PlatformException {
        return const ScanRequirementResult(ScanRequirement.unavailable);
      } on MissingPluginException {
        return const ScanRequirementResult(ScanRequirement.unavailable);
      }
    }

    if (requiresLocationServices) {
      final serviceStatus = await Permission.locationWhenInUse.serviceStatus;
      if (!serviceStatus.isEnabled) {
        return const ScanRequirementResult(
          ScanRequirement.locationServicesOff,
          settingsTarget: ScanSettingsTarget.location,
        );
      }
    }
    return const ScanRequirementResult(ScanRequirement.ready);
  }
}
