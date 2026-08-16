import 'package:app_alumno/models/attendance_confirmation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses student identity, subject and day sent through GATT', () {
    final confirmation = AttendanceConfirmation.fromGattMessage(
      '{"id":"2200000001","materia":"Redes","dia":"2026-08-16"}',
    );

    expect(confirmation.isConfirmed, isTrue);
    expect(confirmation.hasStudentContext, isTrue);
    expect(confirmation.matricula, '2200000001');
    expect(confirmation.attendanceDate, DateTime(2026, 8, 16));
    expect(
      confirmation.recordedAtForHistory(DateTime(2026, 8, 17, 9, 35)),
      DateTime(2026, 8, 16, 9, 35),
    );
    expect(confirmation.classDisplayName, 'Redes');
    expect(confirmation.belongsToMatricula(' 2200000001 '), isTrue);
    expect(confirmation.belongsToMatricula('2200000002'), isFalse);
  });

  test('rejects a malformed attendance day', () {
    final confirmation = AttendanceConfirmation.fromGattMessage(
      '{"id":"2200000001","materia":"Redes","dia":"2026-02-31"}',
    );

    expect(confirmation.isConfirmed, isFalse);
    expect(confirmation.attendanceDate, isNull);
  });

  test('does not assign an identity-less legacy confirmation to a student', () {
    final confirmation = AttendanceConfirmation.fromGattMessage('CONFIRMED');

    expect(confirmation.isConfirmed, isTrue);
    expect(confirmation.hasStudentContext, isFalse);
    expect(confirmation.belongsToMatricula('2200000001'), isFalse);
    expect(confirmation.classDisplayName, 'tu clase');
  });
}
