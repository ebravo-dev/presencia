import 'package:app_alumno/services/native_altbeacon_channel.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('com.presencia/altbeacon');
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

  tearDown(() {
    messenger.setMockMethodCallHandler(channel, null);
  });

  test('usa la autorización nativa de Bluetooth reportada por iOS', () async {
    messenger.setMockMethodCallHandler(channel, (call) async {
      if (call.method == 'checkBluetoothPermission') return 'granted';
      return null;
    });

    final status = await NativeAltBeaconChannel()
        .getBluetoothPermissionStatus();

    expect(status, NativePermissionStatus.granted);
  });

  test('distingue permiso sin solicitar de permiso bloqueado', () async {
    messenger.setMockMethodCallHandler(channel, (call) async {
      return switch (call.method) {
        'checkBluetoothPermission' => 'notDetermined',
        'requestBluetoothPermission' => 'denied',
        _ => null,
      };
    });

    final channelService = NativeAltBeaconChannel();
    expect(
      await channelService.getBluetoothPermissionStatus(),
      NativePermissionStatus.notDetermined,
    );
    expect(
      await channelService.getBluetoothPermissionStatus(request: true),
      NativePermissionStatus.denied,
    );
  });
}
