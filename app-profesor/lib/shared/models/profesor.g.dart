// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'profesor.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Profesor _$ProfesorFromJson(Map<String, dynamic> json) => Profesor(
  id: json['id'] as String,
  name: json['name'] as String,
  institutionalEmail: json['institutionalEmail'] as String,
);

Map<String, dynamic> _$ProfesorToJson(Profesor instance) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'institutionalEmail': instance.institutionalEmail,
};

LoginResponse _$LoginResponseFromJson(Map<String, dynamic> json) =>
    LoginResponse(
      message: json['message'] as String,
      profesor: Profesor.fromJson(json['data'] as Map<String, dynamic>),
      token: json['token'] as String,
      currentPeriod: json['currentPeriod'] as String?,
      needsSync: json['needsSync'] as bool?,
    );

Map<String, dynamic> _$LoginResponseToJson(LoginResponse instance) =>
    <String, dynamic>{
      'message': instance.message,
      'data': instance.profesor,
      'token': instance.token,
      'currentPeriod': instance.currentPeriod,
      'needsSync': instance.needsSync,
    };
