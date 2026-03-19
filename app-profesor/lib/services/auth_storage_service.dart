import 'package:hive_flutter/hive_flutter.dart';
import '../core/utils/utils.dart';
import '../shared/models/profesor.dart';
import '../shared/models/grupo.dart';
import 'dart:convert';

/// Servicio para almacenar y recuperar datos de autenticación
class AuthStorageService {
  static final AuthStorageService _instance = AuthStorageService._internal();
  factory AuthStorageService() => _instance;
  AuthStorageService._internal();

  static const String _authBox = 'auth';
  static const String _tokenKey = 'jwt_token';
  static const String _profesorKey = 'profesor_data';
  static const String _gruposKey = 'grupos_data';
  static const String _syncInProgressKey = 'sync_in_progress';
  static const String _encryptedPasswordKey = 'encrypted_password';
  static const String _beaconsKey = 'beacons_data';

  Box? _box;

  /// Inicializar el servicio
  Future<void> init() async {
    try {
      if (!Hive.isBoxOpen(_authBox)) {
        _box = await Hive.openBox(_authBox);
      } else {
        _box = Hive.box(_authBox);
      }
      Logger.info('AuthStorageService inicializado correctamente');
    } catch (e, stackTrace) {
      Logger.error('Error al inicializar AuthStorageService', e, stackTrace);
    }
  }

  /// Guardar token JWT
  Future<void> saveToken(String token) async {
    try {
      await _box?.put(_tokenKey, token);
      Logger.info('Token JWT guardado correctamente');
    } catch (e, stackTrace) {
      Logger.error('Error al guardar token', e, stackTrace);
    }
  }

  /// Obtener token JWT
  String? getToken() {
    try {
      final token = _box?.get(_tokenKey) as String?;
      if (token != null) {
        Logger.debug('Token JWT recuperado');
      }
      return token;
    } catch (e, stackTrace) {
      Logger.error('Error al obtener token', e, stackTrace);
      return null;
    }
  }

  /// Guardar datos del profesor
  Future<void> saveProfesor(Profesor profesor) async {
    try {
      final profesorJson = jsonEncode(profesor.toJson());
      await _box?.put(_profesorKey, profesorJson);
      Logger.info('Datos del profesor guardados correctamente');
    } catch (e, stackTrace) {
      Logger.error('Error al guardar datos del profesor', e, stackTrace);
    }
  }

  /// Obtener datos del profesor
  Profesor? getProfesor() {
    try {
      final profesorJson = _box?.get(_profesorKey) as String?;
      if (profesorJson != null) {
        final Map<String, dynamic> json = jsonDecode(profesorJson);
        Logger.debug('Datos del profesor recuperados');
        return Profesor.fromJson(json);
      }
      return null;
    } catch (e, stackTrace) {
      Logger.error('Error al obtener datos del profesor', e, stackTrace);
      return null;
    }
  }

  /// Guardar grupos del profesor
  Future<void> saveGrupos(List<Grupo> grupos) async {
    try {
      final gruposJson = jsonEncode(grupos.map((g) => g.toJson()).toList());
      await _box?.put(_gruposKey, gruposJson);
      Logger.info('${grupos.length} grupos guardados correctamente');
    } catch (e, stackTrace) {
      Logger.error('Error al guardar grupos', e, stackTrace);
    }
  }

  /// Obtener grupos del profesor
  List<Grupo>? getGrupos() {
    try {
      final gruposJson = _box?.get(_gruposKey) as String?;
      if (gruposJson != null) {
        final List<dynamic> jsonList = jsonDecode(gruposJson);
        final grupos = jsonList.map((json) => Grupo.fromJson(json)).toList();
        Logger.debug('${grupos.length} grupos recuperados del storage');
        return grupos;
      }
      return null;
    } catch (e, stackTrace) {
      Logger.error('Error al obtener grupos', e, stackTrace);
      return null;
    }
  }

  /// Limpiar grupos del storage (usado al iniciar nueva sincronización)
  Future<void> clearGrupos() async {
    try {
      await _box?.delete(_gruposKey);
      Logger.info('Grupos eliminados del storage');
    } catch (e, stackTrace) {
      Logger.error('Error al limpiar grupos', e, stackTrace);
    }
  }

  /// Guardar sesión completa (token + profesor)
  Future<void> saveSession({
    required String token,
    required Profesor profesor,
    List<Grupo>? grupos,
  }) async {
    await saveToken(token);
    await saveProfesor(profesor);
    if (grupos != null) {
      await saveGrupos(grupos);
    }
    Logger.info('Sesión guardada correctamente');
  }

  /// Verificar si hay una sesión activa
  bool hasActiveSession() {
    final token = getToken();
    final profesor = getProfesor();
    return token != null && profesor != null;
  }

  /// Limpiar toda la sesión (logout)
  Future<void> clearSession() async {
    try {
      await _box?.delete(_tokenKey);
      await _box?.delete(_profesorKey);
      await _box?.delete(_gruposKey);
      await _box?.delete(_syncInProgressKey);
      await _box?.delete(_encryptedPasswordKey);
      await _box?.delete(_beaconsKey);
      Logger.info('Sesión eliminada correctamente');
    } catch (e, stackTrace) {
      Logger.error('Error al limpiar sesión', e, stackTrace);
    }
  }

  /// Verificar si el token es válido (básico)
  bool isTokenValid() {
    final token = getToken();
    if (token == null) return false;

    try {
      // Decodificar el JWT (básico, sin validar firma)
      final parts = token.split('.');
      if (parts.length != 3) return false;

      // Decodificar el payload
      final payload = parts[1];
      final normalizedPayload = base64Url.normalize(payload);
      final decodedPayload = utf8.decode(base64Url.decode(normalizedPayload));
      final Map<String, dynamic> payloadMap = jsonDecode(decodedPayload);

      // Verificar expiración
      if (payloadMap.containsKey('exp')) {
        final exp = payloadMap['exp'] as int;
        final expirationDate = DateTime.fromMillisecondsSinceEpoch(exp * 1000);
        final isExpired = DateTime.now().isAfter(expirationDate);

        if (isExpired) {
          Logger.info('Token JWT expirado');
          return false;
        }
      }

      return true;
    } catch (e) {
      Logger.error('Error al validar token', e);
      return false;
    }
  }

  /// Set sync in progress flag
  Future<void> setSyncInProgress(bool value) async {
    try {
      await _box?.put(_syncInProgressKey, value);
      Logger.info('Sync in progress flag set to: $value');
    } catch (e, stackTrace) {
      Logger.error('Error setting sync in progress flag', e, stackTrace);
    }
  }

  /// Check if sync is in progress
  bool isSyncInProgress() {
    try {
      return _box?.get(_syncInProgressKey, defaultValue: false) as bool? ??
          false;
    } catch (e) {
      Logger.error('Error getting sync in progress flag', e);
      return false;
    }
  }

  /// Guardar contraseña encriptada (RSA) para retry de sync
  Future<void> saveEncryptedPassword(String encryptedPassword) async {
    try {
      await _box?.put(_encryptedPasswordKey, encryptedPassword);
      Logger.info('Contraseña encriptada guardada para retry');
    } catch (e, stackTrace) {
      Logger.error('Error al guardar contraseña encriptada', e, stackTrace);
    }
  }

  /// Obtener contraseña encriptada (RSA) para retry de sync
  String? getEncryptedPassword() {
    try {
      return _box?.get(_encryptedPasswordKey) as String?;
    } catch (e) {
      Logger.error('Error al obtener contraseña encriptada', e);
      return null;
    }
  }

  /// Borrar contraseña encriptada
  Future<void> clearEncryptedPassword() async {
    try {
      await _box?.delete(_encryptedPasswordKey);
      Logger.info('Contraseña encriptada eliminada');
    } catch (e, stackTrace) {
      Logger.error('Error al eliminar contraseña encriptada', e, stackTrace);
    }
  }

  /// Guardar último email usado (para pre-llenar login tras error)
  Future<void> saveLastEmail(String email) async {
    try {
      await _box?.put('last_email', email);
    } catch (e) {
      Logger.error('Error al guardar último email', e);
    }
  }

  /// Obtener último email usado
  String? getLastEmail() {
    try {
      return _box?.get('last_email') as String?;
    } catch (e) {
      return null;
    }
  }

  /// Guardar lista de beacons (uuid + classroom)
  Future<void> saveBeacons(List<Map<String, dynamic>> beacons) async {
    try {
      final beaconsJson = jsonEncode(beacons);
      await _box?.put(_beaconsKey, beaconsJson);
      Logger.info('${beacons.length} configuraciones de aulas guardadas');
    } catch (e, stackTrace) {
      Logger.error('Error al guardar beacons', e, stackTrace);
    }
  }

  /// Obtener lista de beacons
  List<Map<String, dynamic>>? getBeacons() {
    try {
      final beaconsJson = _box?.get(_beaconsKey) as String?;
      if (beaconsJson != null) {
        final List<dynamic> jsonList = jsonDecode(beaconsJson);
        return jsonList.cast<Map<String, dynamic>>();
      }
      return null;
    } catch (e, stackTrace) {
      Logger.error('Error al obtener beacons', e, stackTrace);
      return null;
    }
  }

  /// Obtener el UUID del beacon para un salón específico
  String? getBeaconUuidForClassroom(String classroom) {
    try {
      final beacons = getBeacons();
      if (beacons == null) return null;
      for (final beacon in beacons) {
        if (beacon['classroom'] == classroom) {
          return beacon['uuid'] as String?;
        }
      }
      return null;
    } catch (e, stackTrace) {
      Logger.error('Error al buscar beacon para salón $classroom', e, stackTrace);
      return null;
    }
  }
}
