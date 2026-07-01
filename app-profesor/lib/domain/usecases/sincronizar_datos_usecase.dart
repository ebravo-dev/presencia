import '../../shared/models/grupo.dart';
import '../repositories/i_uat_repository.dart';

class SincronizarDatosUseCase {
  final IUatRepository repository;

  const SincronizarDatosUseCase(this.repository);

  Future<List<Grupo>> call({required String sessionId}) {
    return repository.sincronizarDatos(sessionId: sessionId);
  }
}
