class StudentAcademicProfile {
  final String matricula;
  final String institutionalEmail;
  final String displayName;
  final String? programName;
  final String? cycleName;
  final String? average;
  final String? approvedCredits;

  const StudentAcademicProfile({
    required this.matricula,
    required this.institutionalEmail,
    required this.displayName,
    this.programName,
    this.cycleName,
    this.average,
    this.approvedCredits,
  });

  factory StudentAcademicProfile.fromSessionResponse(
    Map<String, dynamic> response, {
    required String matricula,
    required String institutionalEmail,
  }) {
    final login = _map(response['login']);
    final loginParameters = _map(login?['parametros']);
    final selectedCareer = _map(response['selectedCareer']);
    final selectedParameters = _map(selectedCareer?['parametros']);
    final selectedPlan = _readString(selectedParameters, const [
      'Id_Plan_Estudio_AlumnosUAT',
      'Id_Plan_Estudio',
    ]);
    final careers = response['careers'];
    Map<String, dynamic>? career;
    if (careers is List) {
      for (final rawCareer in careers) {
        final candidate = _map(rawCareer);
        if (candidate == null) continue;
        final candidatePlan = _readString(candidate, const ['Id_Plan_Estudio']);
        if (career == null ||
            (selectedPlan != null && candidatePlan == selectedPlan)) {
          career = candidate;
        }
        if (selectedPlan != null && candidatePlan == selectedPlan) break;
      }
    }

    final normalizedEmail = institutionalEmail.trim().toLowerCase();
    return StudentAcademicProfile(
      matricula: matricula.trim().toUpperCase(),
      institutionalEmail: normalizedEmail,
      displayName:
          _readString(loginParameters, const [
            'Txt_Nombre_Alumno',
            'Txt_Alumno',
            'Txt_Usuario_AlumnosUAT',
            'Txt_Usuario',
          ]) ??
          normalizedEmail,
      programName: _readString(career, const [
        'Txt_Programa_Academico',
        'Programa_Academico',
      ]),
      cycleName: _readString(career, const [
        'CicloActivo',
        'Ciclo',
        'Txt_Ciclo_Escolar',
      ]),
      average: _readString(career, const ['Promedio', 'PROMEDIO']),
      approvedCredits: _readString(career, const [
        'CreditosAprobados',
        'Creditos_Aprobados',
      ]),
    );
  }
}

Map<String, dynamic>? _map(Object? value) {
  if (value is! Map) return null;
  return Map<String, dynamic>.from(value);
}

String? _readString(Map<String, dynamic>? json, List<String> keys) {
  if (json == null) return null;
  for (final key in keys) {
    final value = json[key];
    if (value is! String && value is! num) continue;
    final normalized = value.toString().trim();
    if (normalized.isNotEmpty) return normalized;
  }
  return null;
}
