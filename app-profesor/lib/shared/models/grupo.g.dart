// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'grupo.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Grupo _$GrupoFromJson(Map<String, dynamic> json) => Grupo(
      group: json['group'] as String,
      classroom: json['classroom'] as String,
      subject: json['subject'] as String,
      period: (json['period'] as num).toInt(),
      students: (json['students'] as List<dynamic>)
          .map((e) => Alumno.fromJson(e as Map<String, dynamic>))
          .toList(),
      schedule: (json['schedule'] as Map<String, dynamic>?)?.map(
        (k, e) => MapEntry(k, e as String?),
      ),
    );

Map<String, dynamic> _$GrupoToJson(Grupo instance) => <String, dynamic>{
      'group': instance.group,
      'classroom': instance.classroom,
      'subject': instance.subject,
      'period': instance.period,
      'students': instance.students,
      'schedule': instance.schedule,
    };
