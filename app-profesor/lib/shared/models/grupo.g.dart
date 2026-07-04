// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'grupo.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Grupo _$GrupoFromJson(Map<String, dynamic> json) => Grupo(
      id: json['id'] as String,
      code: json['code'] as String?,
      groupLetter: json['groupLetter'] as String?,
      period: json['period'] as String?,
      group: json['group'] as String,
      classroom: json['classroom'] as String,
      name: json['name'] as String,
      level: json['level'] as String?,
      students: (json['students'] as List<dynamic>)
          .map((e) => Alumno.fromJson(e as Map<String, dynamic>))
          .toList(),
      schedule: _scheduleFromJson(json['schedule']),
      studentsCount: (json['studentsCount'] as num?)?.toInt() ?? 0,
      source: json['source'] as String? ?? 'OFFICIAL',
      isShared: json['isShared'] as bool? ?? false,
      isSubstitute: json['isSubstitute'] as bool? ?? false,
      sharedAssignmentId: json['sharedAssignmentId'] as String?,
      primaryProfessor: json['primaryProfessor'] as Map<String, dynamic>?,
    );

Map<String, dynamic> _$GrupoToJson(Grupo instance) => <String, dynamic>{
      'id': instance.id,
      'code': instance.code,
      'groupLetter': instance.groupLetter,
      'period': instance.period,
      'group': instance.group,
      'classroom': instance.classroom,
      'name': instance.name,
      'level': instance.level,
      'students': instance.students,
      'schedule': _scheduleToJson(instance.schedule),
      'studentsCount': instance.studentsCount,
      'source': instance.source,
      'isShared': instance.isShared,
      'isSubstitute': instance.isSubstitute,
      'sharedAssignmentId': instance.sharedAssignmentId,
      'primaryProfessor': instance.primaryProfessor,
    };
