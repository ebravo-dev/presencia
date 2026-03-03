// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'asistencia_registro.dart';

// **************************************************************************
// TypeAdapterGenerator
// **************************************************************************

class AsistenciaRegistroAdapter extends TypeAdapter<AsistenciaRegistro> {
  @override
  final int typeId = 2;

  @override
  AsistenciaRegistro read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return AsistenciaRegistro(
      id: fields[0] as String,
      grupoId: fields[1] as String,
      profesorId: fields[2] as String,
      fecha: fields[3] as DateTime,
      horaEntrada: fields[4] as DateTime?,
      horaSalida: fields[5] as DateTime?,
      asistenciasAlumnos: (fields[6] as Map).cast<String, bool>(),
      sincronizado: fields[7] as bool,
      fechaCreacion: fields[8] as DateTime,
      fechaActualizacion: fields[9] as DateTime?,
      nombreClase: fields[10] as String?,
      asistenciasSincronizadas: (fields[11] as Map?)?.cast<String, bool>(),
      entradaVerificada: fields[12] as bool,
      motivoEntrada: fields[13] as String?,
      grupoCode: fields[14] as String?,
      grupoGroupLetter: fields[15] as String?,
      grupoPeriod: fields[16] as String?,
    );
  }

  @override
  void write(BinaryWriter writer, AsistenciaRegistro obj) {
    writer
      ..writeByte(17)
      ..writeByte(0)
      ..write(obj.id)
      ..writeByte(1)
      ..write(obj.grupoId)
      ..writeByte(2)
      ..write(obj.profesorId)
      ..writeByte(3)
      ..write(obj.fecha)
      ..writeByte(4)
      ..write(obj.horaEntrada)
      ..writeByte(5)
      ..write(obj.horaSalida)
      ..writeByte(6)
      ..write(obj.asistenciasAlumnos)
      ..writeByte(7)
      ..write(obj.sincronizado)
      ..writeByte(8)
      ..write(obj.fechaCreacion)
      ..writeByte(9)
      ..write(obj.fechaActualizacion)
      ..writeByte(10)
      ..write(obj.nombreClase)
      ..writeByte(11)
      ..write(obj.asistenciasSincronizadas)
      ..writeByte(12)
      ..write(obj.entradaVerificada)
      ..writeByte(13)
      ..write(obj.motivoEntrada)
      ..writeByte(14)
      ..write(obj.grupoCode)
      ..writeByte(15)
      ..write(obj.grupoGroupLetter)
      ..writeByte(16)
      ..write(obj.grupoPeriod);
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AsistenciaRegistroAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}
