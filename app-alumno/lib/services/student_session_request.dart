Map<String, dynamic> buildStudentSessionRequest({
  required String username,
  required String password,
  required String attendanceUuid,
  required String deviceBindingId,
  required String platform,
  required String deviceInfo,
}) {
  final normalizedPlatform = platform.trim().toLowerCase();
  if (username.trim().isEmpty || password.isEmpty) {
    throw ArgumentError('Las credenciales institucionales son obligatorias.');
  }
  if (attendanceUuid.trim().isEmpty || deviceBindingId.trim().isEmpty) {
    throw ArgumentError('La identidad estable del celular es obligatoria.');
  }
  if (normalizedPlatform != 'android' && normalizedPlatform != 'ios') {
    throw ArgumentError.value(platform, 'platform', 'Plataforma no soportada.');
  }

  return {
    'username': username.trim(),
    'password': password,
    'attendanceUuid': attendanceUuid.trim().toLowerCase(),
    'deviceBindingId': deviceBindingId.trim().toLowerCase(),
    'platform': normalizedPlatform,
    'deviceInfo': deviceInfo.trim(),
  };
}
