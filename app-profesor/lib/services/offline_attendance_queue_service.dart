import 'dart:async';

import '../core/utils/utils.dart';
import '../core/constants/api_constants.dart';
import '../shared/models/asistencia_registro.dart';
import '../shared/models/grupo.dart';
import 'api_service.dart';
import 'asistencia_local_service.dart';
import 'auth_storage_service.dart';

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
      final pending = _asistenciaService.obtenerAsistenciasPendientes();
      if (pending.isEmpty) {
        return const OfflineAttendanceQueueResult(
          pending: 0,
          uploaded: 0,
          skipped: 0,
          failed: 0,
        );
      }

      final token = _authStorage.getToken();
      final password = _authStorage.getEncryptedPassword();
      final groups = _authStorage.getGrupos() ?? const <Grupo>[];
      if (token == null ||
          token.isEmpty ||
          password == null ||
          password.isEmpty) {
        Logger.info(
          'Cola offline pausada: falta sesión o contraseña guardada para subir ${pending.length} asistencia(s)',
        );
        return OfflineAttendanceQueueResult(
          pending: pending.length,
          uploaded: 0,
          skipped: pending.length,
          failed: 0,
        );
      }

      var uploaded = 0;
      var skipped = 0;
      var failed = 0;

      for (final registro in pending) {
        final group = _resolveGroup(registro, groups);
        if (group == null) {
          skipped++;
          Logger.info('Cola offline: grupo no encontrado para ${registro.id}');
          continue;
        }

        final attendances = _buildAttendances(registro, group);
        final debugSkipUpload =
            ApiConstants.presenciaDebugMode ||
            ApiConstants.skipApiRestAttendanceUpload;
        if (attendances.isEmpty && !debugSkipUpload) {
          skipped++;
          Logger.info('Cola offline: sin alumnos mapeados para ${registro.id}');
          continue;
        }

        final result = await _apiService.uploadAttendance(
          token: token,
          groupId: group.id,
          code: group.code ?? registro.grupoCode ?? '',
          groupLetter:
              group.groupLetter ??
              registro.grupoGroupLetter ??
              group.grupoLetra,
          period: group.period ?? registro.grupoPeriod ?? '',
          date: registro.fecha,
          attendances: attendances,
          encryptedPassword: password,
        );

        await result.fold(
          (error) async {
            failed++;
            Logger.info(
              'Cola offline: ${registro.id} seguirá pendiente: $error',
            );
          },
          (_) async {
            uploaded++;
            await _asistenciaService.marcarComoSincronizada(registro.id);
          },
        );
      }

      if (uploaded > 0 || failed > 0 || skipped > 0) {
        Logger.info(
          'Cola offline procesada: $uploaded subidas, $failed fallidas, $skipped omitidas',
        );
      }

      return OfflineAttendanceQueueResult(
        pending: pending.length,
        uploaded: uploaded,
        skipped: skipped,
        failed: failed,
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

  Grupo? _resolveGroup(AsistenciaRegistro registro, List<Grupo> groups) {
    for (final group in groups) {
      if (group.id == registro.grupoId) return group;
    }

    for (final group in groups) {
      final sameStableIdentity =
          registro.grupoCode != null &&
          registro.grupoGroupLetter != null &&
          registro.grupoPeriod != null &&
          group.code == registro.grupoCode &&
          group.groupLetter == registro.grupoGroupLetter &&
          group.period == registro.grupoPeriod;
      if (sameStableIdentity) return group;
    }

    return null;
  }

  List<Map<String, dynamic>> _buildAttendances(
    AsistenciaRegistro registro,
    Grupo group,
  ) {
    final studentIdMap = <String, String>{};
    for (final student in group.students) {
      final studentId = student.id;
      if (studentId == null || studentId.isEmpty) continue;

      studentIdMap[studentId] = studentId;
      studentIdMap[student.number.toString()] = studentId;
      final matricula = student.matricula;
      if (matricula != null && matricula.isNotEmpty) {
        studentIdMap[matricula] = studentId;
      }
    }

    final attendances = <Map<String, dynamic>>[];
    registro.asistenciasAlumnos.forEach((key, present) {
      final studentId = studentIdMap[key];
      if (studentId == null) return;

      attendances.add({
        'studentId': studentId,
        'status': present ? 'PRESENT' : 'ABSENT',
      });
    });

    return attendances;
  }
}
