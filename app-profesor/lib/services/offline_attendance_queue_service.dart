import 'dart:async';

import '../core/utils/utils.dart';
import '../shared/models/grupo.dart';
import 'api_service.dart';
import 'asistencia_local_service.dart';
import 'auth_storage_service.dart';
import 'attendance_batch_service.dart';

class OfflineAttendanceQueueResult {
  final int pending;
  final int uploaded;
  final int skipped;
  final int failed;

  const OfflineAttendanceQueueResult({
    required this.pending,
    required this.uploaded,
    required this.skipped,
    required this.failed,
  });

  bool get hasWork => pending > 0;
}

class OfflineAttendanceQueueService {
  static final OfflineAttendanceQueueService _instance =
      OfflineAttendanceQueueService._internal();

  factory OfflineAttendanceQueueService() => _instance;

  OfflineAttendanceQueueService._internal();

  final _asistenciaService = AsistenciaLocalService();
  final _authStorage = AuthStorageService();
  final _apiService = ApiService();
  late final _batchService = AttendanceBatchService(
    apiService: _apiService,
    localService: _asistenciaService,
  );

  Timer? _timer;
  bool _syncing = false;

  void start({Duration interval = const Duration(seconds: 45)}) {
    _timer?.cancel();
    scheduleMicrotask(syncPendingNow);
    _timer = Timer.periodic(interval, (_) => syncPendingNow());
    Logger.info('Cola offline de asistencias iniciada');
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
    Logger.info('Cola offline de asistencias detenida');
  }

  Future<OfflineAttendanceQueueResult> syncPendingNow() async {
    if (_syncing) {
      return const OfflineAttendanceQueueResult(
        pending: 0,
        uploaded: 0,
        skipped: 0,
        failed: 0,
      );
    }

    _syncing = true;
    try {
      var pending = _asistenciaService.obtenerAsistenciasPendientes();
      if (pending.isEmpty) {
        return const OfflineAttendanceQueueResult(
          pending: 0,
          uploaded: 0,
          skipped: 0,
          failed: 0,
        );
      }

      final token = _authStorage.getToken();
      final groups = _authStorage.getGrupos() ?? const <Grupo>[];
      if (token == null || token.isEmpty) {
        return OfflineAttendanceQueueResult(
          pending: pending.length,
          uploaded: 0,
          skipped: pending.length,
          failed: 0,
        );
      }

      final result = await _batchService.submitDirectToBackend(
        token: token,
        records: pending,
        groups: groups,
      );
      return OfflineAttendanceQueueResult(
        pending: pending.length,
        uploaded: result.uploaded,
        skipped: result.skipped,
        failed: result.failed,
      );
    } catch (e, stackTrace) {
      Logger.error(
        'Error procesando cola offline de asistencias',
        e,
        stackTrace,
      );
      return const OfflineAttendanceQueueResult(
        pending: 0,
        uploaded: 0,
        skipped: 0,
        failed: 1,
      );
    } finally {
      _syncing = false;
    }
  }
}
