import 'dart:convert';

import 'package:appprofesoresuniversidad/services/native_altbeacon_channel.dart';
import 'package:appprofesoresuniversidad/services/student_attendance_ble_service.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('com.presencia/student_attendance_ble');
  const iBeaconChannel = MethodChannel('com.presencia/altbeacon');

  tearDown(() async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(iBeaconChannel, null);
  });

  test('GATT confirmation contains matricula, materia and attendance day', () {
    final confirmation = StudentAttendanceGattConfirmation(
      matricula: ' 2200000001 ',
      materia: 'Redes y telecomunicaciones',
      dia: DateTime(2026, 8, 16, 9, 30),
    );

    final payload =
        jsonDecode(confirmation.toGattPayload()) as Map<String, dynamic>;

    expect(payload, {
      'id': '2200000001',
      'materia': 'Redes y telecomunicaciones',
      'dia': '2026-08-16',
    });
  });

  test('homonymous students receive different GATT identities', () {
    final first = StudentAttendanceGattConfirmation(
      matricula: '2200000001',
      materia: 'Redes',
      dia: DateTime(2026, 8, 16),
    );
    final second = StudentAttendanceGattConfirmation(
      matricula: '2200000002',
      materia: 'Redes',
      dia: DateTime(2026, 8, 16),
    );

    expect(first.toGattPayload(), isNot(second.toGattPayload()));
  });

  test('scans by registered UUID with one payload per student', () async {
    MethodCall? capturedCall;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          capturedCall = call;
          return true;
        });

    final started = await StudentAttendanceBleService().startScanning(
      confirmationsByUuid: {
        '11111111-2222-4333-8444-555555555555':
            StudentAttendanceGattConfirmation(
              matricula: '2200000001',
              materia: 'Redes',
              dia: DateTime(2026, 8, 16),
            ),
        'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE':
            StudentAttendanceGattConfirmation(
              matricula: '2200000002',
              materia: 'Redes',
              dia: DateTime(2026, 8, 16),
            ),
      },
    );

    expect(started, isTrue);
    expect(capturedCall?.method, 'startScanning');
    final arguments = capturedCall?.arguments as Map<Object?, Object?>;
    final payloads = arguments['confirmationPayloads'] as Map<Object?, Object?>;
    expect(payloads.keys.toSet(), {
      '11111111222243338444555555555555',
      'aaaaaaaabbbb4ccc8dddeeeeeeeeeeee',
    });
    expect(jsonDecode(payloads['11111111222243338444555555555555'] as String), {
      'id': '2200000001',
      'materia': 'Redes',
      'dia': '2026-08-16',
    });
  });

  test('ranges external iBeacons without changing the GATT payload', () async {
    MethodCall? capturedCall;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(iBeaconChannel, (call) async {
          capturedCall = call;
          return true;
        });

    final started = await StudentAttendanceBleService().startIBeaconScanning(
      uuids: const [
        '11111111222243338444555555555555',
        'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE',
        'not-a-uuid',
      ],
    );

    expect(started, isTrue);
    expect(capturedCall?.method, 'startScanning');
    expect(capturedCall?.arguments, {
      'uuids': [
        '11111111-2222-4333-8444-555555555555',
        'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      ],
    });
  });

  test('external iBeacon detections never require a GATT confirmation', () {
    final detection = StudentAttendanceDetection.fromIBeacon(
      AltBeaconDetection(
        uuid: '11111111-2222-4333-8444-555555555555',
        major: 1,
        minor: 2,
        rssi: -55,
      ),
    );

    expect(detection.transport, StudentAttendanceDetectionTransport.iBeacon);
    expect(detection.requiresGattConfirmation, isFalse);
    expect(detection.rssi, -55);
  });

  test('only manual bindings without device identity use external iBeacon', () {
    expect(
      bindingUsesExternalIBeacon({'platform': 'ios', 'deviceBindingId': null}),
      isTrue,
    );
    expect(
      bindingUsesExternalIBeacon({
        'platform': 'android',
        'deviceBindingId': 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      }),
      isFalse,
    );
  });

  test(
    'confirms a UUID only through an explicit teacher-app acknowledgement',
    () async {
      MethodCall? capturedCall;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
            capturedCall = call;
            return true;
          });

      final confirmed = await StudentAttendanceBleService().confirmAttendance(
        '11111111-2222-4333-8444-555555555555',
      );

      expect(confirmed, isTrue);
      expect(capturedCall?.method, 'confirmAttendance');
      expect(capturedCall?.arguments, {
        'uuid': '11111111222243338444555555555555',
      });
    },
  );
}
