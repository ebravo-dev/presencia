import 'dart:convert';

import 'package:hive_flutter/hive_flutter.dart';

import '../core/utils/utils.dart';
import '../shared/models/grupo.dart';
import '../shared/models/profesor.dart';

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

  Future<void> saveToken(String token) async {
    try {
      await _box?.put(_tokenKey, token);
      Logger.info('Identificador de sesion guardado correctamente');
    } catch (e, stackTrace) {
      Logger.error('Error al guardar token', e, stackTrace);
    }
  }

  String? getToken() {
    try {
      final token = _box?.get(_tokenKey) as String?;
      if (token != null) {
        Logger.debug('Identificador de sesion recuperado');
      }
      return token;
    } catch (e, stackTrace) {
      Logger.error('Error al obtener token', e, stackTrace);
      return null;
    }
  }

  Future<void> saveProfesor(Profesor profesor) async {
    try {
      final profesorJson = jsonEncode(profesor.toJson());
      await _box?.put(_profesorKey, profesorJson);
      Logger.info('Datos del profesor guardados correctamente');
    } catch (e, stackTrace) {
      Logger.error('Error al guardar datos del profesor', e, stackTrace);
    }
  }

  Profesor? getProfesor() {
    try {
      final profesorJson = _box?.get(_profesorKey) as String?;
      if (profesorJson != null) {
        final json = jsonDecode(profesorJson) as Map<String, dynamic>;
        Logger.debug('Datos del profesor recuperados');
        return Profesor.fromJson(json);
      }
      return null;
    } catch (e, stackTrace) {
      Logger.error('Error al obtener datos del profesor', e, stackTrace);
      return null;
    }
  }

  Future<void> saveGrupos(List<Grupo> grupos) async {
    try {
      final gruposJson = jsonEncode(grupos.map((g) => g.toJson()).toList());
      await _box?.put(_gruposKey, gruposJson);
      Logger.info('${grupos.length} grupos guardados correctamente');
    } catch (e, stackTrace) {
      Logger.error('Error al guardar grupos', e, stackTrace);
    }
  }

  List<Grupo>? getGrupos() {
    try {
      final gruposJson = _box?.get(_gruposKey) as String?;
      if (gruposJson != null) {
        final jsonList = jsonDecode(gruposJson) as List<dynamic>;
        final grupos = jsonList
            .map((json) => Grupo.fromJson(json as Map<String, dynamic>))
            .toList();
        Logger.debug('${grupos.length} grupos recuperados del storage');
        return grupos;
      }
      return null;
    } catch (e, stackTrace) {
      Logger.error('Error al obtener grupos', e, stackTrace);
      return null;
    }
  }

  Future<void> clearGrupos() async {
    try {
      await _box?.delete(_gruposKey);
      Logger.info('Grupos eliminados del storage');
    } catch (e, stackTrace) {
      Logger.error('Error al limpiar grupos', e, stackTrace);
    }
  }

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
    Logger.info('Sesion guardada correctamente');
  }

  bool hasActiveSession() {
    final token = getToken();
    final profesor = getProfesor();
    return token != null && token.isNotEmpty && profesor != null;
  }

  Future<void> clearSession() async {
    try {
      await _box?.delete(_tokenKey);
      await _box?.delete(_profesorKey);
      await _box?.delete(_gruposKey);
      await _box?.delete(_syncInProgressKey);
      await _box?.delete(_encryptedPasswordKey);
      await _box?.delete(_beaconsKey);
      Logger.info('Sesion eliminada correctamente');
    } catch (e, stackTrace) {
      Logger.error('Error al limpiar sesion', e, stackTrace);
    }
  }

  bool isTokenValid() {
    final token = getToken();
    if (token == null || token.isEmpty) return false;

    try {
      final parts = token.split('.');
      if (parts.length != 3) {
        Logger.debug('Sesion backend-apirest detectada');
        return true;
      }

      final payload = parts[1];
      final normalizedPayload = base64Url.normalize(payload);
      final decodedPayload = utf8.decode(base64Url.decode(normalizedPayload));
      final payloadMap = jsonDecode(decodedPayload) as Map<String, dynamic>;

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
      Logger.debug('Token no JWT; se validara contra backend en la red', e);
      return true;
    }
  }

  Future<void> setSyncInProgress(bool value) async {
    try {
      await _box?.put(_syncInProgressKey, value);
      Logger.info('Sync in progress flag set to: $value');
    } catch (e, stackTrace) {
      Logger.error('Error setting sync in progress flag', e, stackTrace);
    }
  }

  bool isSyncInProgress() {
    try {
      return _box?.get(_syncInProgressKey, defaultValue: false) as bool? ??
          false;
    } catch (e) {
      Logger.error('Error getting sync in progress flag', e);
      return false;
    }
  }

  Future<void> saveEncryptedPassword(String encryptedPassword) async {
    try {
      await _box?.put(_encryptedPasswordKey, encryptedPassword);
      Logger.info('Contrasena guardada para reintento de sesion');
    } catch (e, stackTrace) {
      Logger.error('Error al guardar contrasena', e, stackTrace);
    }
  }

  String? getEncryptedPassword() {
    try {
      return _box?.get(_encryptedPasswordKey) as String?;
    } catch (e) {
      Logger.error('Error al obtener contrasena guardada', e);
      return null;
    }
  }

  Future<void> clearEncryptedPassword() async {
    try {
      await _box?.delete(_encryptedPasswordKey);
      Logger.info('Contrasena guardada eliminada');
    } catch (e, stackTrace) {
      Logger.error('Error al eliminar contrasena guardada', e, stackTrace);
    }
  }

  Future<void> saveLastEmail(String email) async {
    try {
      await _box?.put('last_email', email);
    } catch (e) {
      Logger.error('Error al guardar ultimo email', e);
    }
  }

  String? getLastEmail() {
    try {
      return _box?.get('last_email') as String?;
    } catch (e) {
      return null;
    }
  }

  Future<void> saveBeacons(List<Map<String, dynamic>> beacons) async {
    try {
      final beaconsJson = jsonEncode(beacons);
      await _box?.put(_beaconsKey, beaconsJson);
      Logger.info('${beacons.length} configuraciones de aulas guardadas');
    } catch (e, stackTrace) {
      Logger.error('Error al guardar beacons', e, stackTrace);
    }
  }

  List<Map<String, dynamic>>? getBeacons() {
    try {
      final beaconsJson = _box?.get(_beaconsKey) as String?;
      if (beaconsJson != null) {
        final jsonList = jsonDecode(beaconsJson) as List<dynamic>;
        return jsonList.map((item) => Map<String, dynamic>.from(item)).toList();
      }
      return null;
    } catch (e, stackTrace) {
      Logger.error('Error al obtener beacons', e, stackTrace);
      return null;
    }
  }

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
      Logger.error(
        'Error al buscar beacon para salon $classroom',
        e,
        stackTrace,
      );
      return null;
    }
  }
}
