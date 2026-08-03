import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:hive_flutter/hive_flutter.dart';

import '../core/utils/utils.dart';
import '../shared/models/grupo.dart';
import '../shared/models/profesor.dart';

class AuthStorageService {
  static final AuthStorageService _instance = AuthStorageService._internal();
  factory AuthStorageService() => _instance;
  AuthStorageService._internal();

  static const String _authBox = 'auth';
  static const String _legacyTokenKey = 'jwt_token';
  static const String _legacyMainBackendTokenKey = 'main_backend_jwt_token';
  static const String _secureTokenKey = 'professor_session_token';
  static const String _secureMainBackendTokenKey =
      'professor_main_backend_token';
  static const String _profesorKey = 'profesor_data';
  static const String _gruposKey = 'grupos_data';
  static const String _syncInProgressKey = 'sync_in_progress';
  static const String _legacyPasswordKey = 'encrypted_password';
  static const String _beaconsKey = 'beacons_data';

  final FlutterSecureStorage _secureStorage = const FlutterSecureStorage();
  Box? _box;
  String? _cachedToken;
  String? _cachedMainBackendToken;
  String? _cachedUatPassword;

  Future<void> init() async {
    try {
      if (!Hive.isBoxOpen(_authBox)) {
        _box = await Hive.openBox(_authBox);
      } else {
        _box = Hive.box(_authBox);
      }
      // Versiones anteriores escribían la contraseña UAT en Hive. Nunca se
      // conserva una credencial institucional en almacenamiento persistente.
      // Se elimina antes de acceder al almacén seguro para que una falla del
      // Keychain/Keystore no deje la contraseña heredada en disco.
      if (_box?.containsKey(_legacyPasswordKey) == true) {
        await _box?.delete(_legacyPasswordKey);
        Logger.info('Credencial UAT heredada eliminada del almacenamiento');
      }
      await _loadAndMigrateSecureSessions();
      Logger.info('AuthStorageService inicializado correctamente');
    } catch (e, stackTrace) {
      Logger.error('Error al inicializar AuthStorageService', e, stackTrace);
    }
  }

  Future<void> saveToken(String token) async {
    try {
      _cachedToken = token;
      await _secureStorage.write(key: _secureTokenKey, value: token);
      await _box?.delete(_legacyTokenKey);
      Logger.info('Identificador de sesion guardado correctamente');
    } catch (e, stackTrace) {
      Logger.error('Error al guardar token', e, stackTrace);
    }
  }

  String? getToken() {
    if (_cachedToken != null) {
      Logger.debug('Identificador de sesion recuperado');
    }
    return _cachedToken;
  }

  Future<void> saveMainBackendToken(String token) async {
    try {
      _cachedMainBackendToken = token;
      await _secureStorage.write(key: _secureMainBackendTokenKey, value: token);
      await _box?.delete(_legacyMainBackendTokenKey);
      Logger.info('Sesion del backend principal guardada correctamente');
    } catch (e, stackTrace) {
      Logger.error(
        'Error al guardar sesion del backend principal',
        e,
        stackTrace,
      );
    }
  }

  String? getMainBackendToken() {
    return _cachedMainBackendToken;
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
      await _secureStorage.delete(key: _secureTokenKey);
      await _secureStorage.delete(key: _secureMainBackendTokenKey);
      await _box?.delete(_legacyTokenKey);
      await _box?.delete(_legacyMainBackendTokenKey);
      await _box?.delete(_profesorKey);
      await _box?.delete(_gruposKey);
      await _box?.delete(_syncInProgressKey);
      await _box?.delete(_legacyPasswordKey);
      await _box?.delete(_beaconsKey);
      Logger.info('Sesion eliminada correctamente');
    } catch (e, stackTrace) {
      Logger.error('Error al limpiar sesion', e, stackTrace);
    } finally {
      _cachedToken = null;
      _cachedMainBackendToken = null;
      _cachedUatPassword = null;
    }
  }

  Future<void> _loadAndMigrateSecureSessions() async {
    _cachedToken = await _secureStorage.read(key: _secureTokenKey);
    _cachedMainBackendToken = await _secureStorage.read(
      key: _secureMainBackendTokenKey,
    );

    final legacyToken = _box?.get(_legacyTokenKey) as String?;
    final legacyMainToken = _box?.get(_legacyMainBackendTokenKey) as String?;
    if ((_cachedToken == null || _cachedToken!.isEmpty) &&
        legacyToken != null &&
        legacyToken.isNotEmpty) {
      await saveToken(legacyToken);
    }
    if ((_cachedMainBackendToken == null || _cachedMainBackendToken!.isEmpty) &&
        legacyMainToken != null &&
        legacyMainToken.isNotEmpty) {
      await saveMainBackendToken(legacyMainToken);
    }

    await _box?.delete(_legacyTokenKey);
    await _box?.delete(_legacyMainBackendTokenKey);
  }

  bool isTokenValid() {
    final token = getToken();
    if (token == null || token.isEmpty) return false;

    try {
      final parts = token.split('.');
      if (parts.length != 3) {
        Logger.debug('Sesion REST detectada');
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

  Future<void> cacheUatPasswordForProcess(String password) async {
    _cachedUatPassword = password;
    // Defensa adicional para instalaciones actualizadas desde una versión
    // que persistía esta credencial.
    try {
      await _box?.delete(_legacyPasswordKey);
    } catch (error, stackTrace) {
      Logger.error(
        'No se pudo limpiar la credencial UAT heredada',
        error,
        stackTrace,
      );
    }
    Logger.info('Credencial UAT disponible solo durante este proceso');
  }

  String? getCachedUatPassword() => _cachedUatPassword;

  Future<void> clearCachedUatPassword() async {
    _cachedUatPassword = null;
    try {
      await _box?.delete(_legacyPasswordKey);
    } catch (error, stackTrace) {
      Logger.error(
        'No se pudo limpiar la credencial UAT heredada',
        error,
        stackTrace,
      );
    }
    Logger.info('Credencial UAT eliminada de memoria');
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

  static String classroomKey(String? classroom) {
    if (classroom == null) return '';
    return classroom.trim().toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');
  }

  Map<String, dynamic> _normalizeBeacon(Map<String, dynamic> beacon) {
    final normalized = Map<String, dynamic>.from(beacon);
    final classroom = normalized['classroom']?.toString();
    final key = classroomKey(
      normalized['classroomKey']?.toString() ?? classroom,
    );
    if (classroom != null) {
      normalized['classroom'] = classroom.trim().toUpperCase();
    }
    if (key.isNotEmpty) {
      normalized['classroomKey'] = key;
    }
    return normalized;
  }

  Future<void> saveBeacons(List<Map<String, dynamic>> beacons) async {
    try {
      final byClassroom = <String, Map<String, dynamic>>{};
      final withoutClassroom = <Map<String, dynamic>>[];

      for (final beacon in beacons) {
        final normalized = _normalizeBeacon(beacon);
        final key = classroomKey(
          normalized['classroomKey']?.toString() ??
              normalized['classroom']?.toString(),
        );
        if (key.isEmpty) {
          withoutClassroom.add(normalized);
          continue;
        }
        byClassroom[key] = normalized;
      }

      final normalizedBeacons = [...byClassroom.values, ...withoutClassroom];
      final beaconsJson = jsonEncode(normalizedBeacons);
      await _box?.put(_beaconsKey, beaconsJson);
      Logger.info(
        '${normalizedBeacons.length} configuraciones de aulas guardadas',
      );
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
    return getBeaconForClassroom(classroom)?['uuid'] as String?;
  }

  Map<String, dynamic>? getBeaconForClassroom(String classroom) {
    try {
      final beacons = getBeacons();
      if (beacons == null) return null;
      final targetKey = classroomKey(classroom);
      if (targetKey.isEmpty) return null;

      for (final beacon in beacons) {
        final beaconKey = classroomKey(
          beacon['classroomKey']?.toString() ?? beacon['classroom']?.toString(),
        );
        if (beaconKey == targetKey) {
          return beacon;
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
