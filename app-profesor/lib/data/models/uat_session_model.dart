import '../../shared/models/profesor.dart';
import '../../core/constants/api_constants.dart';

class UatSessionModel {
  final String sessionId;
  final bool authenticated;
  final Map<String, dynamic> login;
  final Map<String, dynamic> parametros;

  const UatSessionModel({
    required this.sessionId,
    required this.authenticated,
    required this.login,
    required this.parametros,
  });

  factory UatSessionModel.fromJson(Map<String, dynamic> json) {
    final login = _asMap(json['login']);
    final capabilities = _asMap(json['demoCapabilities']);
    ApiConstants.configureRuntimeMode(
      demoMode: json['demoMode'] == true,
      simulateRoomBeacon: capabilities['simulateRoomBeacon'] == true,
    );
    return UatSessionModel(
      sessionId: json['sessionId']?.toString() ?? '',
      authenticated: json['authenticated'] == true,
      login: login,
      parametros: _asMap(login['parametros']),
    );
  }

  Profesor toProfesor({required String fallbackEmail}) {
    final id =
        parametros['Id_Plantilla_AdmonUAT']?.toString() ??
        parametros['Id_Usuario_AdmonUAT']?.toString() ??
        fallbackEmail;
    final name =
        parametros['Txt_Usuario_AdmonUAT']?.toString() ??
        fallbackEmail.split('@').first;
    final email =
        parametros['Cve_Usuario_AdmonUAT']?.toString() ?? fallbackEmail;

    return Profesor(id: id, name: name, institutionalEmail: email);
  }
}

Map<String, dynamic> _asMap(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  return <String, dynamic>{};
}
