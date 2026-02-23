import 'package:hive_flutter/hive_flutter.dart';
import '../shared/models/asistencia_registro.dart';
import '../core/utils/utils.dart';

class AsistenciaLocalService {
  static const String _boxName = 'asistencias';
  static AsistenciaLocalService? _instance;
  Box<AsistenciaRegistro>? _box;

  // Singleton pattern
  factory AsistenciaLocalService() {
    _instance ??= AsistenciaLocalService._internal();
    return _instance!;
  }

  AsistenciaLocalService._internal();

  Future<void> init() async {
    try {
      if (!Hive.isAdapterRegistered(2)) {
        Hive.registerAdapter(AsistenciaRegistroAdapter());
      }
      _box = await Hive.openBox<AsistenciaRegistro>(_boxName);
      Logger.info('AsistenciaLocalService initialized');
    } catch (e, stackTrace) {
      Logger.error('Error initializing AsistenciaLocalService', e, stackTrace);
      rethrow;
    }
  }

  Box<AsistenciaRegistro> get _safeBox {
    if (_box == null || !_box!.isOpen) {
      throw Exception('AsistenciaLocalService not initialized');
    }
    return _box!;
  }

  // Guardar o actualizar registro de asistencia
  Future<void> guardarAsistencia(AsistenciaRegistro registro) async {
    try {
      await _safeBox.put(registro.id, registro);
      Logger.info('Asistencia guardada localmente: ${registro.id}');
    } catch (e, stackTrace) {
      Logger.error('Error guardando asistencia', e, stackTrace);
      rethrow;
    }
  }

  // Obtener registro de asistencia por ID
  AsistenciaRegistro? obtenerAsistencia(String id) {
    try {
      return _safeBox.get(id);
    } catch (e, stackTrace) {
      Logger.error('Error obteniendo asistencia', e, stackTrace);
      return null;
    }
  }

  // Obtener registro por grupo y fecha
  AsistenciaRegistro? obtenerAsistenciaPorGrupoYFecha(
    String grupoId,
    DateTime fecha,
  ) {
    try {
      final fechaSinHora = DateTime(fecha.year, fecha.month, fecha.day);
      return _safeBox.values.firstWhere((registro) {
        final registroFechaSinHora = DateTime(
          registro.fecha.year,
          registro.fecha.month,
          registro.fecha.day,
        );
        return registro.grupoId == grupoId &&
            registroFechaSinHora == fechaSinHora;
      }, orElse: () => throw StateError('Not found'));
    } catch (e) {
      return null;
    }
  }

  // Obtener todas las asistencias de un grupo
  List<AsistenciaRegistro> obtenerAsistenciasPorGrupo(String grupoId) {
    try {
      return _safeBox.values
          .where((registro) => registro.grupoId == grupoId)
          .toList();
    } catch (e, stackTrace) {
      Logger.error('Error obteniendo asistencias por grupo', e, stackTrace);
      return [];
    }
  }

  // Obtener asistencias pendientes de sincronizar
  List<AsistenciaRegistro> obtenerAsistenciasPendientes() {
    try {
      return _safeBox.values
          .where((registro) => !registro.sincronizado)
          .toList();
    } catch (e, stackTrace) {
      Logger.error('Error obteniendo asistencias pendientes', e, stackTrace);
      return [];
    }
  }

  // Obtener asistencias ya sincronizadas
  List<AsistenciaRegistro> obtenerAsistenciasSincronizadas() {
    try {
      return _safeBox.values
          .where((registro) => registro.sincronizado)
          .toList();
    } catch (e, stackTrace) {
      Logger.error('Error obteniendo asistencias sincronizadas', e, stackTrace);
      return [];
    }
  }

  // Verificar si hay asistencias pendientes de sincronizar
  bool hayAsistenciasPendientes() {
    try {
      return _safeBox.values.any((registro) => !registro.sincronizado);
    } catch (e, stackTrace) {
      Logger.error('Error verificando asistencias pendientes', e, stackTrace);
      return false;
    }
  }

  /// Saves a snapshot of the current asistenciasAlumnos WITHOUT marking as synced.
  /// Called at HTTP-send time so reconciliation can later compare current data
  /// against what was actually sent to the server.
  Future<void> guardarSnapshotEnviado(String id) async {
    try {
      final registro = _safeBox.get(id);
      if (registro != null) {
        final actualizado = registro.copyWith(
          asistenciasSincronizadas: Map<String, bool>.from(
            registro.asistenciasAlumnos,
          ),
        );
        await _safeBox.put(id, actualizado);
      }
    } catch (e, stackTrace) {
      Logger.error('Error guardando snapshot enviado', e, stackTrace);
    }
  }

  // Marcar asistencia como sincronizada
  Future<void> marcarComoSincronizada(String id) async {
    try {
      final registro = _safeBox.get(id);
      if (registro != null) {
        final actualizado = registro.copyWith(
          sincronizado: true,
          fechaActualizacion: DateTime.now(),
          asistenciasSincronizadas: Map<String, bool>.from(
            registro.asistenciasAlumnos,
          ),
        );
        await _safeBox.put(id, actualizado);
        Logger.info('Asistencia marcada como sincronizada: $id');
      }
    } catch (e, stackTrace) {
      Logger.error(
        'Error marcando asistencia como sincronizada',
        e,
        stackTrace,
      );
    }
  }

  // Eliminar asistencia
  Future<void> eliminarAsistencia(String id) async {
    try {
      await _safeBox.delete(id);
      Logger.info('Asistencia eliminada: $id');
    } catch (e, stackTrace) {
      Logger.error('Error eliminando asistencia', e, stackTrace);
      rethrow;
    }
  }

  // Limpiar SOLO las asistencias ya sincronizadas (usada al re-sincronizar ciclo)
  // Preserva registros pendientes de subir para no perder trabajo del profesor.
  Future<void> limpiarSincronizadas() async {
    try {
      final sincronizadas = _safeBox.values
          .where((registro) => registro.sincronizado)
          .map((r) => r.id)
          .toList();
      for (final id in sincronizadas) {
        await _safeBox.delete(id);
      }
      Logger.info(
        'Asistencias sincronizadas eliminadas: ${sincronizadas.length} registros',
      );
    } catch (e, stackTrace) {
      Logger.error('Error limpiando asistencias sincronizadas', e, stackTrace);
    }
  }

  // Limpiar todas las asistencias (usar con precaución)
  Future<void> limpiarTodo() async {
    try {
      await _safeBox.clear();
      Logger.info('Todas las asistencias eliminadas');
    } catch (e, stackTrace) {
      Logger.error('Error limpiando asistencias', e, stackTrace);
      rethrow;
    }
  }

  // Cerrar el servicio
  Future<void> close() async {
    try {
      await _box?.close();
      Logger.info('AsistenciaLocalService closed');
    } catch (e, stackTrace) {
      Logger.error('Error closing AsistenciaLocalService', e, stackTrace);
    }
  }
}
