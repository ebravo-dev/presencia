import 'package:app_alumno/services/student_session_request.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('buildStudentSessionRequest', () {
    test('always includes the stable phone identity', () {
      final payload = buildStudentSessionRequest(
        username: ' Alumno@UAT.EDU.MX ',
        password: 'secret',
        attendanceUuid: '12345678-1234-4234-9234-123456789ABC',
        deviceBindingId: '12345678-1234-4234-9234-123456789ABD',
        platform: 'Android',
        deviceInfo: 'Pixel 9',
      );

      expect(payload, {
        'username': 'Alumno@UAT.EDU.MX',
        'password': 'secret',
        'attendanceUuid': '12345678-1234-4234-9234-123456789abc',
        'deviceBindingId': '12345678-1234-4234-9234-123456789abd',
        'platform': 'android',
        'deviceInfo': 'Pixel 9',
      });
    });

    test('accepts iOS and rejects non-mobile platforms', () {
      final ios = buildStudentSessionRequest(
        username: 'alumno@uat.edu.mx',
        password: 'secret',
        attendanceUuid: '12345678-1234-4234-9234-123456789abc',
        deviceBindingId: '12345678-1234-4234-9234-123456789abd',
        platform: 'ios',
        deviceInfo: 'iPhone',
      );
      expect(ios['platform'], 'ios');
      expect(
        () => buildStudentSessionRequest(
          username: 'alumno@uat.edu.mx',
          password: 'secret',
          attendanceUuid: '12345678-1234-4234-9234-123456789abc',
          deviceBindingId: '12345678-1234-4234-9234-123456789abd',
          platform: 'web',
          deviceInfo: 'Browser',
        ),
        throwsArgumentError,
      );
    });

    test('rejects an empty device identity', () {
      expect(
        () => buildStudentSessionRequest(
          username: 'alumno@uat.edu.mx',
          password: 'secret',
          attendanceUuid: '',
          deviceBindingId: '',
          platform: 'android',
          deviceInfo: 'Pixel',
        ),
        throwsArgumentError,
      );
    });
  });
}
