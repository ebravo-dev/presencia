import '../models/auth_models.dart';
import '../services/auth_service.dart';
import '../../../core/utils/utils.dart';

/// Implementación mock del servicio de autenticación
/// Simula comportamiento real de la API UAT con datos de profesores, grupos y alumnos
class AuthServiceMock implements AuthService {
  static int _tokenSequence = 0;
  // Datos mock de profesores UAT
  static final Map<String, Map<String, dynamic>> _mockProfessors = {
    'juan.perez@docentes.uat.edu.mx': {
      'password': 'uat2024',
      'user': User(
        id: 'prof_001',
        email: 'juan.perez@docentes.uat.edu.mx',
        name: 'Dr. Juan Carlos Pérez García',
        role: 'professor',
        employeeId: 'EMP001',
        department: 'Ingeniería en Sistemas',
      ),
      'groups': [
        Group(
          id: 'group_001',
          name: 'ISC-801 Grupo A',
          subject: 'Desarrollo de Aplicaciones Móviles',
          schedule: 'Lunes, Miércoles 08:00-10:00',
          classroom: 'Aula 201 - Edificio B',
          classroomUuid: 'UUID-AULA-201-B',
          professorId: 'prof_001',
          students: [
            Student(
              id: 'std_001',
              studentId: '2021030001',
              name: 'Ana María González López',
              email: 'ana.gonzalez@uat.edu.mx',
            ),
            Student(
              id: 'std_002',
              studentId: '2021030002',
              name: 'Carlos Eduardo Ramírez Torres',
              email: 'carlos.ramirez@uat.edu.mx',
            ),
            Student(
              id: 'std_003',
              studentId: '2021030003',
              name: 'María Elena Vásquez Morales',
              email: 'maria.vasquez@uat.edu.mx',
            ),
          ],
        ),
        Group(
          id: 'group_002',
          name: 'ISC-601 Grupo B',
          subject: 'Programación Web Avanzada',
          schedule: 'Martes, Jueves 10:00-12:00',
          classroom: 'Laboratorio 101 - Edificio A',
          classroomUuid: 'UUID-LAB-101-A',
          professorId: 'prof_001',
          students: [
            Student(
              id: 'std_004',
              studentId: '2022030001',
              name: 'Roberto Carlos Mendoza Silva',
              email: 'roberto.mendoza@uat.edu.mx',
            ),
            Student(
              id: 'std_005',
              studentId: '2022030002',
              name: 'Patricia Isabel Hernández Castro',
              email: 'patricia.hernandez@uat.edu.mx',
            ),
          ],
        ),
      ],
    },
    'maria.rodriguez@uat.edu.mx': {
      'password': 'uat2024',
      'user': User(
        id: 'prof_002',
        email: 'maria.rodriguez@uat.edu.mx',
        name: 'Dra. María Elena Rodríguez Sánchez',
        role: 'professor',
        employeeId: 'EMP002',
        department: 'Matemáticas Aplicadas',
      ),
      'groups': [
        Group(
          id: 'group_003',
          name: 'MAT-401 Grupo A',
          subject: 'Cálculo Diferencial e Integral',
          schedule: 'Lunes, Miércoles, Viernes 07:00-08:00',
          classroom: 'Aula 301 - Edificio C',
          classroomUuid: 'UUID-AULA-301-C',
          professorId: 'prof_002',
          students: [
            Student(
              id: 'std_006',
              studentId: '2023010001',
              name: 'Luis Fernando García Martínez',
              email: 'luis.garcia@uat.edu.mx',
            ),
            Student(
              id: 'std_007',
              studentId: '2023010002',
              name: 'Andrea Sofía López Reyes',
              email: 'andrea.lopez@uat.edu.mx',
            ),
          ],
        ),
      ],
    },
  };

  /// Simular delay de red realista
  Future<void> _simulateNetworkDelay() async {
    await Future.delayed(
      Duration(milliseconds: 1500 + (DateTime.now().millisecond % 1000)),
    );
  }

  @override
  Future<AuthResult> login(String email, String password) async {
    try {
      Logger.info('Intentando login mock para: $email');

      // Simular delay de red
      await _simulateNetworkDelay();

      // Normalizar email (remover espacios y convertir a minúsculas)
      final normalizedEmail = email.trim().toLowerCase();

      // Verificar si el profesor existe en mock data
      if (!_mockProfessors.containsKey(normalizedEmail)) {
        Logger.error('Profesor no encontrado en mock data: $normalizedEmail');
        return AuthResult.failure(
          'Credenciales inválidas. Verifique su correo institucional UAT.',
        );
      }

      final professorData = _mockProfessors[normalizedEmail]!;

      // Verificar contraseña
      if (professorData['password'] != password) {
        Logger.error('Contraseña incorrecta para: $normalizedEmail');
        return AuthResult.failure('Contraseña incorrecta. Intente nuevamente.');
      }

      final user = professorData['user'] as User;
      final groups = professorData['groups'] as List<Group>;

      // Generar token JWT mock
      final token = _generateMockJWT(user);

      Logger.info('Login exitoso para: ${user.name}');
      Logger.info('Grupos asignados: ${groups.length}');

      return AuthResult.success(user: user, token: token, groups: groups);
    } catch (e, stackTrace) {
      Logger.error('Error durante login mock', e, stackTrace);
      return AuthResult.failure('Error inesperado. Intente nuevamente.');
    }
  }

  @override
  Future<AuthResult> logout() async {
    try {
      Logger.info('Cerrando sesión mock');
      await _simulateNetworkDelay();

      // En un escenario real, aquí se invalidaría el token en el servidor
      Logger.info('Sesión cerrada exitosamente');

      return AuthResult.success(
        user: const User(id: '', email: '', name: '', role: ''),
        token: '',
      );
    } catch (e, stackTrace) {
      Logger.error('Error durante logout mock', e, stackTrace);
      return AuthResult.failure('Error al cerrar sesión');
    }
  }

  @override
  Future<User?> getCurrentUser() async {
    try {
      // En implementación real, se decodificaría el JWT token
      Logger.info('Obteniendo usuario actual mock');

      // Simular que no hay usuario autenticado inicialmente
      return null;
    } catch (e, stackTrace) {
      Logger.error('Error obteniendo usuario actual', e, stackTrace);
      return null;
    }
  }

  @override
  Future<bool> isTokenValid(String token) async {
    try {
      await Future.delayed(Duration(milliseconds: 500));

      // Verificar formato básico del token mock
      if (token.isEmpty || !token.startsWith('mock_jwt_')) {
        return false;
      }

      // Simular que tokens expiran después de 24 horas
      final tokenParts = token.split('_');
      if (tokenParts.length >= 4) {
        final timestamp = int.tryParse(tokenParts[3]);
        if (timestamp != null) {
          final tokenDate = DateTime.fromMillisecondsSinceEpoch(timestamp);
          final now = DateTime.now();
          final difference = now.difference(tokenDate);

          return difference.inHours < 24;
        }
      }

      return false;
    } catch (e, stackTrace) {
      Logger.error('Error validando token', e, stackTrace);
      return false;
    }
  }

  @override
  Future<AuthResult> refreshToken(String token) async {
    try {
      Logger.info('Refrescando token mock');
      await _simulateNetworkDelay();

      if (!await isTokenValid(token)) {
        return AuthResult.failure('Token inválido o expirado');
      }

      // Generar nuevo token (en real se haría con el backend)
      final newToken = _generateMockJWT(null);

      return AuthResult.success(
        user: const User(id: '', email: '', name: '', role: ''),
        token: newToken,
      );
    } catch (e, stackTrace) {
      Logger.error('Error refrescando token', e, stackTrace);
      return AuthResult.failure('Error al refrescar token');
    }
  }

  @override
  Future<List<Group>> getUserGroups(String userId) async {
    try {
      Logger.info('Obteniendo grupos para usuario: $userId');
      await _simulateNetworkDelay();

      // Buscar grupos del profesor
      for (final professorData in _mockProfessors.values) {
        final user = professorData['user'] as User;
        if (user.id == userId) {
          final groups = professorData['groups'] as List<Group>;
          Logger.info('Grupos encontrados: ${groups.length}');
          return groups;
        }
      }

      Logger.info('No se encontraron grupos para el usuario: $userId');
      return [];
    } catch (e, stackTrace) {
      Logger.error('Error obteniendo grupos del usuario', e, stackTrace);
      return [];
    }
  }

  /// Generar token JWT mock para testing
  String _generateMockJWT(User? user) {
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final userId = user?.id ?? 'unknown';
    _tokenSequence += 1;
    return 'mock_jwt_${userId}_${timestamp}_$_tokenSequence';
  }

  /// Obtener credenciales de prueba para desarrollo
  static Map<String, String> getTestCredentials() {
    return {
      'Profesor ISC': 'juan.perez@docentes.uat.edu.mx / uat2024',
      'Profesora MAT': 'maria.rodriguez@uat.edu.mx / uat2024',
    };
  }
}
