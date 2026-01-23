import '../models/auth_models.dart';

/// Interfaz abstracta para servicios de autenticación
/// Permite cambiar fácilmente entre mock y API real
abstract class AuthService {
  /// Autenticar usuario con credenciales UAT
  /// [email] - Correo institucional UAT
  /// [password] - Contraseña UAT
  /// Retorna [AuthResult] con usuario, token y grupos asignados
  Future<AuthResult> login(String email, String password);

  /// Cerrar sesión del usuario
  Future<AuthResult> logout();

  /// Obtener usuario actual desde token almacenado
  Future<User?> getCurrentUser();

  /// Verificar si el token es válido
  Future<bool> isTokenValid(String token);

  /// Refrescar token de autenticación
  Future<AuthResult> refreshToken(String token);

  /// Obtener grupos del profesor actual
  Future<List<Group>> getUserGroups(String userId);
}
