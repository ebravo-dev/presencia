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

class DebugAttendanceBatchResult {
  final int uploaded;
  final int skipped;
  final int failed;

  const DebugAttendanceBatchResult({
    required this.uploaded,
    required this.skipped,
    required this.failed,
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

  Future<DebugAttendanceBatchResult> submitDebugReportOnly({
    required String token,
    required List<AsistenciaRegistro> records,
    required List<Grupo> groups,
  }) async {
    var uploaded = 0;
    var skipped = 0;
    var failed = 0;

    for (final record in records) {
      final group = _resolveGroup(record, groups);
      if (group == null) {
        skipped++;
        continue;
      }

      final result = await _apiService.uploadAttendance(
        token: token,
        groupId: group.id,
        code: group.code ?? record.grupoCode ?? '',
        groupLetter:
            group.groupLetter ?? record.grupoGroupLetter ?? group.group,
        period: group.period ?? record.grupoPeriod ?? '',
        date: record.fecha,
        attendances: _buildAttendances(record, group),
        groupName: group.name,
        classroom: group.classroom,
        level: group.level,
        schedule: group.schedule,
        professorEntryAt: record.horaEntrada,
        professorExitAt: record.horaSalida,
      );

      await result.fold(
        (_) async {
          failed++;
        },
        (_) async {
          await _localService.marcarComoSincronizada(record.id);
          uploaded++;
        },
      );
    }

    return DebugAttendanceBatchResult(
      uploaded: uploaded,
      skipped: skipped,
      failed: failed,
    );
  }

  Future<DebugAttendanceBatchResult> submitDirectToBackend({
    required String token,
    required List<AsistenciaRegistro> records,
    required List<Grupo> groups,
  }) async {
    var uploaded = 0;
    var skipped = 0;
    var failed = 0;

    for (final record in records) {
      final group = _resolveGroup(record, groups);
      if (group == null) {
        skipped++;
        continue;
      }

      final attendances = _buildAttendances(record, group);
      if (attendances.isEmpty) {
        skipped++;
        continue;
      }

      final result = await _apiService.uploadAttendance(
        token: token,
        groupId: group.id,
        code: group.code ?? record.grupoCode ?? '',
        groupLetter:
            group.groupLetter ?? record.grupoGroupLetter ?? group.group,
        period: group.period ?? record.grupoPeriod ?? '',
        date: record.fecha,
        attendances: attendances,
        groupName: group.name,
        classroom: group.classroom,
        level: group.level,
        schedule: group.schedule,
        professorEntryAt: record.horaEntrada,
        professorExitAt: record.horaSalida,
      );

      await result.fold(
        (_) async {
          failed++;
        },
        (_) async {
          await _localService.marcarComoSincronizada(record.id);
          uploaded++;
        },
      );
    }

    return DebugAttendanceBatchResult(
      uploaded: uploaded,
      skipped: skipped,
      failed: failed,
    );
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

  List<Map<String, dynamic>> _buildAttendances(
    AsistenciaRegistro record,
    Grupo group,
  ) {
    final students = <String, ({String id, int? numericId, int listNumber})>{};
    for (final entry in group.students.asMap().entries) {
      final student = entry.value;
      final id = student.id;
      if (id == null || id.isEmpty) continue;
      final parsedId = int.tryParse(id);
      final mapped = (
        id: id,
        numericId: parsedId != null && parsedId > 0 ? parsedId : null,
        listNumber: entry.key + 1,
      );
      students[id] = mapped;
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
        'studentId': student.id,
        if (student.numericId != null) 'id_alumno': student.numericId,
        'num_pase_lista': student.listNumber,
        'num_dia': record.fecha.weekday,
        'sn_asistencia': present,
        'status': present ? 'PRESENT' : 'ABSENT',
      });
    });
    return attendances;
  }
}
