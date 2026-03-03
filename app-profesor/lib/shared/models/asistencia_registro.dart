import 'package:hive/hive.dart';

part 'asistencia_registro.g.dart';

@HiveType(typeId: 2)
class AsistenciaRegistro extends HiveObject {
  @HiveField(0)
  final String id;

  @HiveField(1)
  final String grupoId;

  @HiveField(2)
  final String profesorId;

  @HiveField(3)
  final DateTime fecha;

  @HiveField(4)
  final DateTime? horaEntrada;

  @HiveField(5)
  final DateTime? horaSalida;

  @HiveField(6)
  final Map<String, bool> asistenciasAlumnos; // Map<alumnoId, presente>

  @HiveField(7)
  final bool sincronizado;

  @HiveField(8)
  final DateTime fechaCreacion;

  @HiveField(9)
  final DateTime? fechaActualizacion;

  @HiveField(10)
  final String? nombreClase; // Nombre de la materia/clase

  @HiveField(11)
  final Map<String, bool>? asistenciasSincronizadas; // Snapshot of attendance at last sync

  @HiveField(12)
  final bool entradaVerificada; // true = beacon detected, false = manual with motivo

  @HiveField(13)
  final String? motivoEntrada; // Reason when beacon was not detected

  // ─── Stable server identifiers (no CUIDs) ─────────────────────────────────
  // These come from the portal/scraper and never change on DB resets.
  @HiveField(14)
  final String? grupoCode; // e.g. "RC.06061.2873.5"

  @HiveField(15)
  final String? grupoGroupLetter; // e.g. "M"

  @HiveField(16)
  final String? grupoPeriod; // e.g. "2025-1"

  AsistenciaRegistro({
    required this.id,
    required this.grupoId,
    required this.profesorId,
    required this.fecha,
    this.horaEntrada,
    this.horaSalida,
    required this.asistenciasAlumnos,
    this.sincronizado = false,
    required this.fechaCreacion,
    this.fechaActualizacion,
    this.nombreClase,
    this.asistenciasSincronizadas,
    this.entradaVerificada = true,
    this.motivoEntrada,
    this.grupoCode,
    this.grupoGroupLetter,
    this.grupoPeriod,
  });

  AsistenciaRegistro copyWith({
    String? id,
    String? grupoId,
    String? profesorId,
    DateTime? fecha,
    DateTime? horaEntrada,
    DateTime? horaSalida,
    Map<String, bool>? asistenciasAlumnos,
    bool? sincronizado,
    DateTime? fechaCreacion,
    DateTime? fechaActualizacion,
    String? nombreClase,
    Map<String, bool>? asistenciasSincronizadas,
    bool? entradaVerificada,
    String? motivoEntrada,
    String? grupoCode,
    String? grupoGroupLetter,
    String? grupoPeriod,
  }) {
    return AsistenciaRegistro(
      id: id ?? this.id,
      grupoId: grupoId ?? this.grupoId,
      profesorId: profesorId ?? this.profesorId,
      fecha: fecha ?? this.fecha,
      horaEntrada: horaEntrada ?? this.horaEntrada,
      horaSalida: horaSalida ?? this.horaSalida,
      asistenciasAlumnos: asistenciasAlumnos ?? this.asistenciasAlumnos,
      sincronizado: sincronizado ?? this.sincronizado,
      fechaCreacion: fechaCreacion ?? this.fechaCreacion,
      fechaActualizacion: fechaActualizacion ?? this.fechaActualizacion,
      nombreClase: nombreClase ?? this.nombreClase,
      asistenciasSincronizadas:
          asistenciasSincronizadas ?? this.asistenciasSincronizadas,
      entradaVerificada: entradaVerificada ?? this.entradaVerificada,
      motivoEntrada: motivoEntrada ?? this.motivoEntrada,
      grupoCode: grupoCode ?? this.grupoCode,
      grupoGroupLetter: grupoGroupLetter ?? this.grupoGroupLetter,
      grupoPeriod: grupoPeriod ?? this.grupoPeriod,
    );
  }
}
