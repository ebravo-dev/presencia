import '../../services/asistencia_local_service.dart';
import '../../services/auth_storage_service.dart';
import '../../shared/models/asistencia_registro.dart';
import '../../shared/models/grupo.dart';
import '../../shared/models/profesor.dart';

class UatLocalDataSource {
  final AuthStorageService authStorage;
  final AsistenciaLocalService asistenciaLocal;

  const UatLocalDataSource({
    required this.authStorage,
    required this.asistenciaLocal,
  });

  Profesor? getProfesor() => authStorage.getProfesor();

  String? getSessionId() => authStorage.getToken();

  Future<void> saveSession({
    required String sessionId,
    required Profesor profesor,
    List<Grupo>? grupos,
  }) {
    return authStorage.saveSession(
      token: sessionId,
      profesor: profesor,
      grupos: grupos,
    );
  }

  List<Grupo>? getGrupos() => authStorage.getGrupos();

  Future<void> saveGrupos(List<Grupo> grupos) => authStorage.saveGrupos(grupos);

  Future<void> saveBeacons(List<Map<String, dynamic>> beacons) {
    return authStorage.saveBeacons(beacons);
  }

  Future<void> markAsSynced(AsistenciaRegistro registro) {
    return asistenciaLocal.marcarComoSincronizada(registro.id);
  }
}
