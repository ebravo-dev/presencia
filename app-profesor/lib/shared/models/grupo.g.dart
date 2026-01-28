// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'grupo.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Grupo _$GrupoFromJson(Map<String, dynamic> json) => Grupo(
      id: json['id'] as String,
      code: json['code'] as String?,
      group: json['group'] as String,
      classroom: json['classroom'] as String,
      name: json['name'] as String,
      level: json['level'] as String?,
      students: (json['students'] as List<dynamic>)
          .map((e) => Alumno.fromJson(e as Map<String, dynamic>))
          .toList(),
      schedule: (json['schedule'] as Map<String, dynamic>?)?.map(
        (k, e) => MapEntry(k, e as String?),
      ),
      studentsCount: (json['studentsCount'] as num?)?.toInt() ?? 0,
    );

Map<String, dynamic> _$GrupoToJson(Grupo instance) => <String, dynamic>{
      'id': instance.id,
      'code': instance.code,
      'group': instance.group,
      'classroom': instance.classroom,
      'name': instance.name,
      'level': instance.level,
      'students': instance.students,
      'schedule': instance.schedule,
      'studentsCount': instance.studentsCount,
    };
