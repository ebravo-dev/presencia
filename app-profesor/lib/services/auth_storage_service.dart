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
}
