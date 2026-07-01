import '../../shared/models/asistencia_registro.dart';
import '../../shared/models/grupo.dart';
import '../../shared/models/profesor.dart';

class UatLoginResult {
  final String sessionId;
  final Profesor profesor;
  final String message;

  const UatLoginResult({
    required this.sessionId,
    required this.profesor,
    required this.message,
  });
}

abstract class IUatRepository {
  Future<UatLoginResult> iniciarSesion({
    required String email,
    required String password,
  });

  Future<List<Grupo>> sincronizarDatos({required String sessionId});

  Future<Map<String, dynamic>> guardarAsistencia({
    required String sessionId,
    required Grupo grupo,
    required AsistenciaRegistro registro,
  });

  Future<Map<String, dynamic>> guardarAsistenciaDirecta({
    required String sessionId,
    required String groupId,
    required DateTime date,
    required List<Map<String, dynamic>> attendances,
  });
}
