import 'dart:convert';

import 'package:appprofesoresuniversidad/services/student_attendance_ble_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('GATT confirmation identifies the active professor class', () {
    const context = StudentAttendanceClassContext(
      classId: 'group-42',
      className: 'Redes y telecomunicaciones',
      group: 'A',
      classroom: 'LC-3',
    );

    final payload = jsonDecode(context.toGattPayload()) as Map<String, dynamic>;

    expect(payload, {
      'v': 1,
      's': 'confirmed',
      'id': 'group-42',
      'name': 'Redes y telecomunicaciones',
      'group': 'A',
      'room': 'LC-3',
    });
  });
}
