import 'package:appprofesoresuniversidad/core/permissions/permission_service.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const permissionChannel = MethodChannel(
    'flutter.baseflow.com/permissions/methods',
  );
  const studentBleChannel = MethodChannel(
    'com.presencia/student_attendance_ble',
  );
  const classroomBeaconChannel = MethodChannel('com.presencia/altbeacon');
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
    messenger.setMockMethodCallHandler(permissionChannel, null);
    messenger.setMockMethodCallHandler(studentBleChannel, null);
    messenger.setMockMethodCallHandler(classroomBeaconChannel, null);
  });

  test('detiene el escaneo antes de pedir permisos faltantes', () async {
    var bluetoothWasChecked = false;
    messenger.setMockMethodCallHandler(permissionChannel, (call) async => 0);
    messenger.setMockMethodCallHandler(studentBleChannel, (call) async {
      if (call.method == 'getAndroidSdkInt') return 35;
      if (call.method == 'checkBluetoothState') {
        bluetoothWasChecked = true;
        return 'poweredOn';
      }
      return null;
    });

    final result = await PermissionService.checkStudentAttendanceScan();

    expect(result.requirement, ScanRequirement.permissionRequired);
    expect(bluetoothWasChecked, isFalse);
  });

  test('reporta Bluetooth apagado aunque los permisos estén activos', () async {
    messenger.setMockMethodCallHandler(permissionChannel, (call) async => 1);
    messenger.setMockMethodCallHandler(studentBleChannel, (call) async {
      if (call.method == 'getAndroidSdkInt') return 35;
      if (call.method == 'checkBluetoothState') return 'poweredOff';
      return null;
    });

    final result = await PermissionService.checkStudentAttendanceScan();

    expect(result.requirement, ScanRequirement.bluetoothOff);
    expect(result.settingsTarget, ScanSettingsTarget.bluetooth);
  });

  test(
    'permite escanear sólo cuando permisos y Bluetooth están listos',
    () async {
      messenger.setMockMethodCallHandler(permissionChannel, (call) async => 1);
      messenger.setMockMethodCallHandler(studentBleChannel, (call) async {
        if (call.method == 'getAndroidSdkInt') return 35;
        if (call.method == 'checkBluetoothState') return 'poweredOn';
        return null;
      });

      final result = await PermissionService.checkStudentAttendanceScan();

      expect(result.isReady, isTrue);
    },
  );

  test(
    'en iOS confía en permisos nativos aunque el plugin genérico falle',
    () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      var genericPermissionWasRead = false;
      messenger.setMockMethodCallHandler(permissionChannel, (call) async {
        genericPermissionWasRead = true;
        return 0;
      });
      messenger.setMockMethodCallHandler(studentBleChannel, (call) async {
        return switch (call.method) {
          'checkBluetoothPermission' => 'granted',
          'checkBluetoothState' => 'poweredOn',
          _ => null,
        };
      });
      messenger.setMockMethodCallHandler(classroomBeaconChannel, (call) async {
        return switch (call.method) {
          'checkLocationPermission' => 'granted',
          'checkLocationServices' => true,
          _ => null,
        };
      });

      final result = await PermissionService.checkClassroomBeaconScan();

      expect(result.isReady, isTrue);
      expect(genericPermissionWasRead, isFalse);
    },
  );
}
