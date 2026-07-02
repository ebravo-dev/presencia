import 'dart:async';

import '../core/permissions/permission_service.dart';
import '../core/utils/utils.dart';
import '../shared/models/asistencia_registro.dart';
import '../shared/models/grupo.dart';
import 'api_service.dart';
import 'asistencia_local_service.dart';
import 'auth_storage_service.dart';
import 'native_altbeacon_channel.dart';

class TeacherBeaconAttendanceService {
  static final TeacherBeaconAttendanceService _instance =
      TeacherBeaconAttendanceService._internal();
  factory TeacherBeaconAttendanceService() => _instance;
  TeacherBeaconAttendanceService._internal();

  final _beacons = NativeAltBeaconChannel();
  final _authStorage = AuthStorageService();
  final _asistenciaService = AsistenciaLocalService();
  final _apiService = ApiService();

  StreamSubscription<List<AltBeaconDetection>>? _subscription;
  Grupo? _activeGroup;
  String? _roomBeaconUuid;
  bool _starting = false;
  bool _professorEntryRecorded = false;
  final Set<String> _uploadedStudentBeaconUuids = {};
  Map<String, String> _studentIdByBeaconUuid = {};

  bool get isScanning => _subscription != null;

  Future<void> startForCurrentClass(List<Grupo> grupos) async {
    if (_starting) return;

    final currentGroup = _findCurrentClass(grupos);
    if (currentGroup == null) {
      await stop();
      return;
    }

    if (_activeGroup?.id == currentGroup.id && isScanning) {
      return;
    }

    _starting = true;
    try {
      await stop();
      _activeGroup = currentGroup;
      _roomBeaconUuid = _authStorage.getBeaconUuidForClassroom(
        currentGroup.classroom,
      );

      final granted = await PermissionService.requestBluetoothPermissions();
      if (!granted) {
        Logger.info('[BeaconFlow] Permisos Bluetooth no concedidos');
        return;
      }

      final existing = _asistenciaService.obtenerAsistenciaPorGrupoYFecha(
        currentGroup.id,
        DateTime.now(),
      );
      _professorEntryRecorded = existing?.horaEntrada != null;

      if (_professorEntryRecorded) {
        await _startStudentScan(currentGroup);
      } else {
        await _startRoomScan(currentGroup);
      }
    } finally {
      _starting = false;
    }
  }

  Future<void> stop() async {
    await _subscription?.cancel();
    _subscription = null;
    await _beacons.stopScanning();
    _activeGroup = null;
    _roomBeaconUuid = null;
    _professorEntryRecorded = false;
    _uploadedStudentBeaconUuids.clear();
    _studentIdByBeaconUuid = {};
  }

  Future<void> _startRoomScan(Grupo grupo) async {
    final uuid = _roomBeaconUuid;
    if (uuid == null || uuid.isEmpty) {
      Logger.info('[BeaconFlow] ${grupo.classroom} no tiene beacon asignado');
      return;
    }

    _subscription = _beacons.detectionsStream.listen((detections) async {
      AltBeaconDetection? match;
      for (final detection in detections) {
        if (_sameUuid(detection.uuid, uuid)) {
          match = detection;
          break;
        }
      }
      if (match == null || _professorEntryRecorded) return;

      await _recordProfessorEntry(grupo, match);
      await _startStudentScan(grupo);
    });

    await _beacons.startScanning(uuids: [uuid]);
    Logger.info('[BeaconFlow] Buscando beacon de salón ${grupo.classroom}');
  }

  Future<void> _startStudentScan(Grupo grupo) async {
    _studentIdByBeaconUuid = await _loadStudentBeaconBindings(grupo);
    final studentUuids = _studentIdByBeaconUuid.keys.toList();

    if (studentUuids.isEmpty) {
      Logger.info('[BeaconFlow] Grupo sin UUIDs de alumnos asignados');
      return;
    }

    await _subscription?.cancel();
    _subscription = _beacons.detectionsStream.listen((detections) {
      _recordStudentDetections(grupo, detections);
    });

    await _beacons.startScanning(uuids: studentUuids);
    Logger.info(
      '[BeaconFlow] Buscando ${studentUuids.length} beacons de alumnos',
    );
  }

  Future<void> _recordProfessorEntry(
    Grupo grupo,
    AltBeaconDetection detection,
  ) async {
    _professorEntryRecorded = true;
    final detectedAt = DateTime.now();
    final recordId = _recordId(grupo, detectedAt);
    final profesorId = _authStorage.getProfesor()?.id ?? 'unknown_professor';
    final existing = _asistenciaService.obtenerAsistencia(recordId);

    final registro = AsistenciaRegistro(
      id: recordId,
      grupoId: grupo.id,
      profesorId: profesorId,
      fecha: DateTime(detectedAt.year, detectedAt.month, detectedAt.day),
      horaEntrada: detectedAt,
      horaSalida: existing?.horaSalida,
      asistenciasAlumnos: existing?.asistenciasAlumnos ?? {},
      sincronizado: false,
      fechaCreacion: existing?.fechaCreacion ?? detectedAt,
      fechaActualizacion: detectedAt,
      nombreClase: grupo.subject,
      asistenciasSincronizadas: existing?.asistenciasSincronizadas,
      entradaVerificada: true,
      grupoCode: grupo.code,
      grupoGroupLetter: grupo.groupLetter,
      grupoPeriod: grupo.period,
    );

    await _asistenciaService.guardarAsistencia(registro);

    final token = _authStorage.getToken();
    if (token != null &&
        grupo.code != null &&
        grupo.groupLetter != null &&
        grupo.period != null) {
      await _apiService.recordProfessorBeaconEntry(
        token: token,
        code: grupo.code!,
        groupLetter: grupo.groupLetter!,
        period: grupo.period!,
        detectedAt: detectedAt,
        beaconUuid: detection.uuid,
        rssi: detection.rssi,
        distance: detection.distance,
        bluetoothAddress: detection.bluetoothAddress,
      );
    }
  }

  Future<void> _recordStudentDetections(
    Grupo grupo,
    List<AltBeaconDetection> detections,
  ) async {
    final byUuid = _studentIdByBeaconUuid.isNotEmpty
        ? _studentIdByBeaconUuid
        : await _loadStudentBeaconBindings(grupo);

    final matched = <AltBeaconDetection>[];
    final asistencia = <String, bool>{};

    for (final detection in detections) {
      final normalized = _normalizeUuid(detection.uuid);
      final studentId = byUuid[normalized];
      if (studentId == null) continue;

      asistencia[studentId] = true;
      if (_uploadedStudentBeaconUuids.add(normalized)) {
        matched.add(detection);
      }
    }

    if (asistencia.isEmpty) return;

    final now = DateTime.now();
    final recordId = _recordId(grupo, now);
    final existing = _asistenciaService.obtenerAsistencia(recordId);
    final merged = <String, bool>{
      if (existing != null) ...existing.asistenciasAlumnos,
      ...asistencia,
    };

    if (existing != null) {
      await _asistenciaService.guardarAsistencia(
        existing.copyWith(
          asistenciasAlumnos: merged,
          fechaActualizacion: now,
          sincronizado: false,
        ),
      );
    } else {
      await _asistenciaService.guardarAsistencia(
        AsistenciaRegistro(
          id: recordId,
          grupoId: grupo.id,
          profesorId: _authStorage.getProfesor()?.id ?? 'unknown_professor',
          fecha: DateTime(now.year, now.month, now.day),
          horaEntrada: now,
          asistenciasAlumnos: merged,
          sincronizado: false,
          fechaCreacion: now,
          fechaActualizacion: now,
          nombreClase: grupo.subject,
          entradaVerificada: true,
          grupoCode: grupo.code,
          grupoGroupLetter: grupo.groupLetter,
          grupoPeriod: grupo.period,
        ),
      );
    }

    final token = _authStorage.getToken();
    if (matched.isNotEmpty &&
        token != null &&
        grupo.code != null &&
        grupo.groupLetter != null &&
        grupo.period != null) {
      await _apiService.recordStudentBeaconDetections(
        token: token,
        code: grupo.code!,
        groupLetter: grupo.groupLetter!,
        period: grupo.period!,
        date: now,
        detections: matched.map((detection) => detection.toApiJson()).toList(),
      );
    }
  }

  Future<Map<String, String>> _loadStudentBeaconBindings(Grupo grupo) async {
    final fallback = <String, String>{
      for (final student in grupo.students)
        if (student.beaconUuid != null &&
            student.beaconUuid!.isNotEmpty &&
            student.id != null)
          _normalizeUuid(student.beaconUuid!): student.id!,
    };

    final token = _authStorage.getToken();
    final code = grupo.code;
    final groupLetter = grupo.groupLetter ?? grupo.grupoLetra;
    final period = grupo.period;

    if (token == null ||
        code == null ||
        groupLetter.isEmpty ||
        period == null) {
      return fallback;
    }

    final result = await _apiService.getStudentBeaconBindings(
      token: token,
      code: code,
      groupLetter: groupLetter,
      period: period,
    );

    return result.fold(
      (error) {
        Logger.info('[BeaconFlow] Usando UUIDs cacheados: $error');
        return fallback;
      },
      (bindings) {
        final resolved = <String, String>{};
        for (final binding in bindings) {
          final studentId = binding['studentId'] as String?;
          final beaconUuid = binding['beaconUuid'] as String?;
          if (studentId == null || beaconUuid == null || beaconUuid.isEmpty) {
            continue;
          }
          resolved[_normalizeUuid(beaconUuid)] = studentId;
        }

        if (resolved.isEmpty) {
          return fallback;
        }

        Logger.info(
          '[BeaconFlow] UUIDs registrados para grupo: ${resolved.length}',
        );
        return resolved;
      },
    );
  }

  Grupo? _findCurrentClass(List<Grupo> grupos) {
    final now = DateTime.now();
    for (final grupo in grupos) {
      if (grupo.weekdaysConClase.isNotEmpty &&
          !grupo.weekdaysConClase.contains(now.weekday)) {
        continue;
      }

      final range = _scheduleRange(grupo);
      if (range == null) continue;

      final startWindow = range.start.subtract(const Duration(minutes: 10));
      final endWindow = range.end.add(const Duration(minutes: 10));
      if (!now.isBefore(startWindow) && !now.isAfter(endWindow)) {
        return grupo;
      }
    }
    return null;
  }

  ({DateTime start, DateTime end})? _scheduleRange(Grupo grupo) {
    final horario = grupo.horario;
    if (horario == null) return null;

    final parts = horario.split('-');
    if (parts.length != 2) return null;

    final startParts = parts[0].trim().split(':');
    final endParts = parts[1].trim().split(':');
    if (startParts.length != 2 || endParts.length != 2) return null;

    final now = DateTime.now();
    final start = DateTime(
      now.year,
      now.month,
      now.day,
      int.parse(startParts[0]),
      int.parse(startParts[1]),
    );
    var end = DateTime(
      now.year,
      now.month,
      now.day,
      int.parse(endParts[0]),
      int.parse(endParts[1]),
    );
    if (end.isBefore(start)) {
      end = end.add(const Duration(days: 1));
    }
    return (start: start, end: end);
  }

  String _recordId(Grupo grupo, DateTime date) {
    return '${grupo.id}_${date.year}-${date.month}-${date.day}';
  }

  bool _sameUuid(String a, String b) => _normalizeUuid(a) == _normalizeUuid(b);

  String _normalizeUuid(String uuid) {
    return uuid.replaceAll('-', '').toLowerCase().trim();
  }
}
