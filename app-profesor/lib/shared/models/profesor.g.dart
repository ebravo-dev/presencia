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

LoginRequest _$LoginRequestFromJson(Map<String, dynamic> json) => LoginRequest(
      institutionalEmail: json['institutionalEmail'] as String,
      encryptedPassword: json['encryptedPassword'] as String,
    );

Map<String, dynamic> _$LoginRequestToJson(LoginRequest instance) =>
    <String, dynamic>{
      'institutionalEmail': instance.institutionalEmail,
      'encryptedPassword': instance.encryptedPassword,
    };

RegisterRequest _$RegisterRequestFromJson(Map<String, dynamic> json) =>
    RegisterRequest(
      name: json['name'] as String,
      institutionalEmail: json['institutionalEmail'] as String,
      encryptedPassword: json['encryptedPassword'] as String,
    );

Map<String, dynamic> _$RegisterRequestToJson(RegisterRequest instance) =>
    <String, dynamic>{
      'name': instance.name,
      'institutionalEmail': instance.institutionalEmail,
      'encryptedPassword': instance.encryptedPassword,
    };

LoginResponse _$LoginResponseFromJson(Map<String, dynamic> json) =>
    LoginResponse(
      status: (json['status'] as num).toInt(),
      message: json['message'] as String,
      profesor: Profesor.fromJson(json['data'] as Map<String, dynamic>),
      token: json['token'] as String,
    );

Map<String, dynamic> _$LoginResponseToJson(LoginResponse instance) =>
    <String, dynamic>{
      'status': instance.status,
      'message': instance.message,
      'data': instance.profesor,
      'token': instance.token,
    };
