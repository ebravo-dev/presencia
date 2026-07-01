import '../../shared/models/asistencia_registro.dart';
import '../../shared/models/grupo.dart';
import '../repositories/i_uat_repository.dart';

class GuardarAsistenciaUseCase {
  final IUatRepository repository;

  const GuardarAsistenciaUseCase(this.repository);

  Future<Map<String, dynamic>> call({
    required String sessionId,
    required Grupo grupo,
    required AsistenciaRegistro registro,
  }) {
    return repository.guardarAsistencia(
      sessionId: sessionId,
      grupo: grupo,
      registro: registro,
    );
  }
}
