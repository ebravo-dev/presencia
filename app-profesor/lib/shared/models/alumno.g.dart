// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'alumno.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Alumno _$AlumnoFromJson(Map<String, dynamic> json) => Alumno(
      id: json['id'] as String?,
      matricula: json['matricula'] as String?,
      number: (json['number'] as num).toInt(),
      name: json['name'] as String,
    );

Map<String, dynamic> _$AlumnoToJson(Alumno instance) => <String, dynamic>{
      'id': instance.id,
      'matricula': instance.matricula,
      'number': instance.number,
      'name': instance.name,
    };
