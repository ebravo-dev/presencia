import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/usecases/sincronizar_datos_usecase.dart';
import '../../shared/models/grupo.dart';

enum SyncStage { idle, loading, completed, failed }

class SyncState {
  final SyncStage stage;
  final List<Grupo> grupos;
  final String? message;

  const SyncState({
    this.stage = SyncStage.idle,
    this.grupos = const [],
    this.message,
  });

  SyncState copyWith({SyncStage? stage, List<Grupo>? grupos, String? message}) {
    return SyncState(
      stage: stage ?? this.stage,
      grupos: grupos ?? this.grupos,
      message: message,
    );
  }
}

class SyncNotifier extends StateNotifier<SyncState> {
  final SincronizarDatosUseCase sincronizarDatos;

  SyncNotifier({required this.sincronizarDatos}) : super(const SyncState());

  Future<void> sincronizar({required String sessionId}) async {
    state = state.copyWith(stage: SyncStage.loading, message: null);
    try {
      final grupos = await sincronizarDatos(sessionId: sessionId);
      state = SyncState(
        stage: SyncStage.completed,
        grupos: grupos,
        message: 'Información actualizada',
      );
    } catch (e) {
      state = SyncState(stage: SyncStage.failed, message: e.toString());
    }
  }
}
