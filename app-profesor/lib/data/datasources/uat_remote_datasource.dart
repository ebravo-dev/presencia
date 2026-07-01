import 'package:dio/dio.dart';

import '../../core/constants/api_constants.dart';
import '../models/uat_asistencia_model.dart';
import '../models/uat_horario_model.dart';
import '../models/uat_session_model.dart';

class UatRemoteDataSource {
  final Dio _dio;

  const UatRemoteDataSource(this._dio);

  Future<UatSessionModel> createSession({
    required String username,
    required String password,
  }) async {
    final response = await _dio.post(
      ApiConstants.uatSessions,
      data: {'username': username, 'password': password},
    );

    return UatSessionModel.fromJson(_asMap(response.data));
  }

  Future<List<UatHorarioModel>> getHorarios({
    required int idCicloEscolar,
    required int idDes,
  }) async {
    final response = await _dio.get(
      ApiConstants.uatHorarios,
      queryParameters: {'Id_Ciclo_Escolar': idCicloEscolar, 'Id_DES': idDes},
    );

    return _dataList(response.data)
        .map((item) => UatHorarioModel.fromJson(_asMap(item)))
        .where((item) => item.idGrupo > 0)
        .toList();
  }

  Future<List<Map<String, dynamic>>> getExamenes({
    required int idCicloEscolar,
    required int idDes,
  }) async {
    final response = await _dio.get(
      ApiConstants.uatExamenes,
      queryParameters: {'Id_Ciclo_Escolar': idCicloEscolar, 'Id_DES': idDes},
    );

    return _dataList(response.data).map(_asMap).toList();
  }

  Future<List<UatGrupoModel>> getGruposProfesor({
    required int idDes,
    required int idCiclo,
    required int idPlantilla,
  }) async {
    final response = await _dio.get(
      ApiConstants.uatControlGrupos,
      queryParameters: {
        'Id_Des': idDes,
        'Id_Ciclo': idCiclo,
        'Id_Plantilla': idPlantilla,
      },
    );

    return _dataList(response.data)
        .map((item) => UatGrupoModel.fromJson(_asMap(item)))
        .where((item) => item.idGrupo > 0)
        .toList();
  }

  Future<List<UatSemanaModel>> getSemanasGrupo({required int idGrupo}) async {
    final response = await _dio.get(
      ApiConstants.uatControlSemanas,
      queryParameters: {'Id_Grupo': idGrupo},
    );

    return _dataList(response.data)
        .map((item) => UatSemanaModel.fromJson(_asMap(item)))
        .where((item) => item.isValid)
        .toList();
  }

  Future<UatAsistenciaGrupoModel> getAsistenciaGrupo({
    required int idGrupo,
    required String fecIni,
    required String fecFin,
  }) async {
    final response = await _dio.get(
      ApiConstants.uatControlAsistenciaGrupo,
      queryParameters: {
        'Id_Grupo': idGrupo,
        'fec_ini': fecIni,
        'fec_fin': fecFin,
      },
    );

    final envelope = _asMap(response.data);
    final data = _asMap(envelope['data']);
    return UatAsistenciaGrupoModel.fromJson(data.isNotEmpty ? data : envelope);
  }

  Future<Map<String, dynamic>> guardarAsistencias(
    UatGuardaAsistenciasRequest request,
  ) async {
    final response = await _dio.post(
      ApiConstants.uatControlGuardarAsistencias,
      data: request.toJson(),
    );

    return _asMap(response.data);
  }
}

List<dynamic> _dataList(Object? value) {
  final envelope = _asMap(value);
  final data = envelope['data'];
  if (data is List) return data;
  if (value is List) return value;
  return const [];
}

Map<String, dynamic> _asMap(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  return <String, dynamic>{};
}
