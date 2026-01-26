import 'package:json_annotation/json_annotation.dart';
import 'package:equatable/equatable.dart';

part 'profesor.g.dart';

@JsonSerializable()
class Profesor extends Equatable {
  final String id;
  final String name;
  final String institutionalEmail;

  const Profesor({
    required this.id,
    required this.name,
    required this.institutionalEmail,
  });

  factory Profesor.fromJson(Map<String, dynamic> json) =>
      _$ProfesorFromJson(json);

  Map<String, dynamic> toJson() => _$ProfesorToJson(this);

  @override
  List<Object?> get props => [id, name, institutionalEmail];

  String get nombreCompleto => name;
  String get email => institutionalEmail; // Alias para compatibilidad
}

@JsonSerializable()
class LoginRequest extends Equatable {
  final String institutionalEmail;
  final String encryptedPassword;

  const LoginRequest({
    required this.institutionalEmail,
    required this.encryptedPassword,
  });

  factory LoginRequest.fromJson(Map<String, dynamic> json) =>
      _$LoginRequestFromJson(json);

  Map<String, dynamic> toJson() => _$LoginRequestToJson(this);

  @override
  List<Object> get props => [institutionalEmail, encryptedPassword];
}

@JsonSerializable()
class RegisterRequest extends Equatable {
  final String name;
  final String institutionalEmail;
  final String encryptedPassword;

  const RegisterRequest({
    required this.name,
    required this.institutionalEmail,
    required this.encryptedPassword,
  });

  factory RegisterRequest.fromJson(Map<String, dynamic> json) =>
      _$RegisterRequestFromJson(json);

  Map<String, dynamic> toJson() => _$RegisterRequestToJson(this);

  @override
  List<Object> get props => [name, institutionalEmail, encryptedPassword];
}

@JsonSerializable()
class LoginResponse extends Equatable {
  final String message;
  @JsonKey(name: 'data')
  final Profesor profesor;
  final String token;
  final String? currentPeriod;
  final bool? needsSync;

  const LoginResponse({
    required this.message,
    required this.profesor,
    required this.token,
    this.currentPeriod,
    this.needsSync,
  });

  factory LoginResponse.fromJson(Map<String, dynamic> json) =>
      _$LoginResponseFromJson(json);

  Map<String, dynamic> toJson() => _$LoginResponseToJson(this);

  @override
  List<Object?> get props => [
    message,
    profesor,
    token,
    currentPeriod,
    needsSync,
  ];
}
