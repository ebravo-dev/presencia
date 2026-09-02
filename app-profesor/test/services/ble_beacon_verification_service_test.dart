import 'package:appprofesoresuniversidad/services/ble_beacon_verification_service.dart';
import 'package:appprofesoresuniversidad/services/native_altbeacon_channel.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const aulaPrincipal = ClassroomBeaconReference(
    classroom: 'AULA 101',
    uuid: '11111111-1111-4111-8111-111111111111',
  );
  const laboratorio = ClassroomBeaconReference(
    classroom: 'LAB 3',
    uuid: '22222222-2222-4222-8222-222222222222',
  );

  test('selecciona el salón con el RSSI más intenso', () {
    final match = selectNearestClassroomBeacon(
      references: const [aulaPrincipal, laboratorio],
      primaryClassroom: aulaPrincipal.classroom,
      detections: [
        AltBeaconDetection(uuid: aulaPrincipal.uuid, rssi: -74),
        AltBeaconDetection(uuid: laboratorio.uuid, rssi: -43),
      ],
    );

    expect(match?.reference.classroom, laboratorio.classroom);
    expect(match?.detection.rssi, -43);
  });

  test('el salón principal gana cuando dos RSSI son iguales', () {
    final match = selectNearestClassroomBeacon(
      references: const [laboratorio, aulaPrincipal],
      primaryClassroom: ' aula-101 ',
      detections: [
        AltBeaconDetection(uuid: laboratorio.uuid, rssi: -55),
        AltBeaconDetection(uuid: aulaPrincipal.uuid, rssi: -55),
      ],
    );

    expect(match?.reference.classroom, aulaPrincipal.classroom);
  });

  test('ignora señales que no pertenecen al catálogo de salones', () {
    final match = selectNearestClassroomBeacon(
      references: const [aulaPrincipal],
      primaryClassroom: aulaPrincipal.classroom,
      detections: [
        AltBeaconDetection(
          uuid: '33333333-3333-4333-8333-333333333333',
          rssi: -20,
        ),
        AltBeaconDetection(uuid: aulaPrincipal.uuid, rssi: -80),
      ],
    );

    expect(match?.reference.classroom, aulaPrincipal.classroom);
  });
}
