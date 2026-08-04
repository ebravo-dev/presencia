import 'package:app_alumno/models/attendance_confirmation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses the class context sent through GATT', () {
    final confirmation = AttendanceConfirmation.fromGattMessage(
      '{"v":1,"s":"confirmed","id":"group-42","name":"Redes",'
      '"group":"A","room":"LC-3"}',
    );

    expect(confirmation.isConfirmed, isTrue);
    expect(confirmation.hasClassContext, isTrue);
    expect(confirmation.classId, 'group-42');
    expect(confirmation.classDisplayName, 'Redes · Grupo A');
    expect(confirmation.classroom, 'LC-3');
  });

  test('keeps compatibility with legacy confirmations', () {
    final confirmation = AttendanceConfirmation.fromGattMessage('CONFIRMED');

    expect(confirmation.isConfirmed, isTrue);
    expect(confirmation.hasClassContext, isFalse);
    expect(confirmation.classDisplayName, 'tu clase');
  });
}
