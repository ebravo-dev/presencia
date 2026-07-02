import 'package:json_annotation/json_annotation.dart';
import 'package:equatable/equatable.dart';

part 'alumno.g.dart';

@JsonSerializable()
class Alumno extends Equatable {
  final String? id;
  final String? matricula;
  final String? beaconUuid;
  final int number;
  final String name;

  const Alumno({
    this.id,
    this.matricula,
    this.beaconUuid,
    required this.number,
    required this.name,
  });

  factory Alumno.fromJson(Map<String, dynamic> json) => _$AlumnoFromJson(json);

  Map<String, dynamic> toJson() => _$AlumnoToJson(this);

  @override
  List<Object?> get props => [id, matricula, beaconUuid, number, name];

  String get nombreCompleto => name;
  int get numeroLista => number;
}
