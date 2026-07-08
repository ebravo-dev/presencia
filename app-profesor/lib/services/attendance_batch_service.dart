import 'package:dartz/dartz.dart';

import '../data/models/uat_asistencia_model.dart';
import '../shared/models/asistencia_registro.dart';
import '../shared/models/grupo.dart';
import 'api_service.dart';
import 'asistencia_local_service.dart';

class PreparedAttendanceBatch {
  final List<Map<String, dynamic>> payload;
  final Map<String, AsistenciaRegistro> recordsById;
  final int skipped;

  const PreparedAttendanceBatch({
    required this.payload,
    required this.recordsById,
    required this.skipped,
  });
}

/// Single responsibility: translate local attendance snapshots into the
/// idempotent batch contract and transfer ownership to the server.
class AttendanceBatchService {
  final ApiService _apiService;
  final AsistenciaLocalService _localService;

  AttendanceBatchService({
    ApiService? apiService,
    AsistenciaLocalService? localService,
  }) : _apiService = apiService ?? ApiService(),
       _localService = localService ?? AsistenciaLocalService();

  PreparedAttendanceBatch prepare(
    List<AsistenciaRegistro> records,
    List<Grupo> groups,
  ) {
    final payload = <Map<String, dynamic>>[];
    final recordsById = <String, AsistenciaRegistro>{};
    var skipped = 0;

    for (final record in records) {
      final group = _resolveGroup(record, groups);
      final idGrupo = group == null
          ? null
          : int.tryParse(group.id) ?? int.tryParse(group.code ?? '');
      if (group == null || idGrupo == null || idGrupo <= 0) {
        skipped++;
        continue;
      }

      final students = <String, ({int id, int listNumber})>{};
      for (final entry in group.students.asMap().entries) {
        final student = entry.value;
        final id = int.tryParse(student.id ?? '');
        if (id == null || id <= 0) continue;
        final mapped = (id: id, listNumber: entry.key + 1);
        students[student.id!] = mapped;
        students[student.number.toString()] = mapped;
        final matricula = student.matricula;
        if (matricula != null && matricula.isNotEmpty) {
          students[matricula] = mapped;
        }
      }

      final attendances = <Map<String, dynamic>>[];
      record.asistenciasAlumnos.forEach((key, present) {
        final student = students[key];
        if (student == null) return;
        attendances.add({
          'id_alumno': student.id,
          'num_pase_lista': student.listNumber,
          'num_dia': record.fecha.weekday,
          'sn_asistencia': present,
        });
      });
      if (attendances.isEmpty) {
        skipped++;
        continue;
      }

      recordsById[record.id] = record;
      payload.add({
        'clientRecordId': record.id,
        'Id_Grupo': idGrupo,
        'Fec_Ini': formatUatWeekStart(record.fecha),
        'Asistencia': attendances,
      });
    }

    return PreparedAttendanceBatch(
      payload: payload,
      recordsById: recordsById,
      skipped: skipped,
    );
  }

  Future<Either<String, Map<String, dynamic>>> submit({
    required String token,
    required PreparedAttendanceBatch batch,
  }) async {
    final result = await _apiService.submitAttendanceBatch(
      token: token,
      records: batch.payload,
    );
    await result.fold((_) async {}, (_) async {
      for (final record in batch.recordsById.values) {
        await _localService.guardarSnapshotEnviado(record.id);
      }
    });
    return result;
  }

  /// Completes the local record only when it still matches the snapshot that
  /// was accepted by the server. Later edits remain pending as a new revision.
  Future<bool> markCompletedIfUnchanged(String clientRecordId) async {
    final matches = _localService.obtenerAsistenciasPendientes().where(
      (record) => record.id == clientRecordId,
    );
    if (matches.isEmpty) return true;

    final record = matches.first;
    final snapshot = record.asistenciasSincronizadas;
    if (snapshot != null) {
      if (snapshot.length != record.asistenciasAlumnos.length) return false;
      for (final entry in record.asistenciasAlumnos.entries) {
        if (snapshot[entry.key] != entry.value) return false;
      }
    }

    await _localService.marcarComoSincronizada(clientRecordId);
    return true;
  }

  Grupo? _resolveGroup(AsistenciaRegistro record, List<Grupo> groups) {
    for (final group in groups) {
      if (group.id == record.grupoId) return group;
    }
    for (final group in groups) {
      if (record.grupoCode != null &&
          record.grupoGroupLetter != null &&
          record.grupoPeriod != null &&
          group.code == record.grupoCode &&
          group.groupLetter == record.grupoGroupLetter &&
          group.period == record.grupoPeriod) {
        return group;
      }
    }
    return null;
  }
}
