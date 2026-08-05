import 'package:flutter_test/flutter_test.dart';
import 'package:appprofesoresuniversidad/features/authentication/providers/profesor_auth_provider.dart';
import 'package:appprofesoresuniversidad/shared/models/profesor.dart';

void main() {
  group('ApiService Tests', () {
    test('LoginResponse debe parsear correctamente el JSON del servidor', () {
      // JSON de respuesta real del servidor
      final jsonResponse = {
        "status": 200,
        "message": "Login successful",
        "data": {
          "id": "68f13ff5eb895057d6880da8",
          "name": "Dr. Eder Jahir Gonzalez Bravo",
          "institutionalEmail": "profesor.prueba@uat.edu.mx",
        },
        "token":
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4ZjEzZmY1ZWI4OTUwNTdkNjg4MGRhOCIsIm5hbWUiOiJEci4gRWRlciBKYWhpciBHb256YWxleiBCcmF2byIsImFwcCI6IlBST0ZFU1NPUl9TRVJWSUNFIiwiaWF0IjoxNzYwNjQxNTM1LCJleHAiOjE3NjEyNDYzMzV9.KuvHNqH2wQ8IROeQf6Cbx8HdBD9zKBkcHadOhQ4L0iA",
      };

      // Intentar parsear
      final loginResponse = LoginResponse.fromJson(jsonResponse);

      // Verificaciones
      //expect(loginResponse.status, 200);
      expect(loginResponse.message, "Login successful");
      expect(loginResponse.profesor.id, "68f13ff5eb895057d6880da8");
      expect(loginResponse.profesor.name, "Dr. Eder Jahir Gonzalez Bravo");
      expect(
        loginResponse.profesor.institutionalEmail,
        "profesor.prueba@uat.edu.mx",
      );
      expect(loginResponse.profesor.email, "profesor.prueba@uat.edu.mx");
      expect(loginResponse.token, isNotEmpty);
    });

    test('Profesor debe tener getter email que retorna institutionalEmail', () {
      final profesor = Profesor(
        id: "test-id",
        name: "Test Profesor",
        institutionalEmail: "test@uat.edu.mx",
      );

      expect(profesor.email, "test@uat.edu.mx");
      expect(profesor.institutionalEmail, "test@uat.edu.mx");
      expect(profesor.nombreCompleto, "Test Profesor");
    });

    test('el estado puede invalidar solo el token sin borrar al profesor', () {
      final profesor = Profesor(
        id: 'test-id',
        name: 'Test Profesor',
        institutionalEmail: 'test@uat.edu.mx',
      );
      final state = ProfesorAuthState(
        status: ProfesorAuthStatus.authenticated,
        profesor: profesor,
        token: 'uat-session',
        errorMessage: 'anterior',
      );

      final expired = state.copyWith(
        status: ProfesorAuthStatus.sessionExpired,
        token: null,
        errorMessage: null,
      );

      expect(expired.profesor, same(profesor));
      expect(expired.token, isNull);
      expect(expired.errorMessage, isNull);
    });
  });
}
