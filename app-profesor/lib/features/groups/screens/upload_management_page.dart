import 'dart:ui';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:table_calendar/table_calendar.dart';

import '../../../services/asistencia_local_service.dart';
import '../../../shared/models/asistencia_registro.dart';
import '../../../core/utils/utils.dart';
import '../../../services/api_service.dart';
import '../../../services/auth_storage_service.dart';
import '../../../services/sse_service.dart';
import '../../../services/sync_service.dart';
import '../../../shared/models/grupo.dart';

class UploadManagementPage extends StatefulWidget {
  const UploadManagementPage({super.key});

  @override
  State<UploadManagementPage> createState() => _UploadManagementPageState();
}

class _UploadManagementPageState extends State<UploadManagementPage> {
  final AsistenciaLocalService _asistenciaService = AsistenciaLocalService();
  final ApiService _apiService = ApiService();
  final AuthStorageService _authStorage = AuthStorageService();
  final SSEService _sseService = SSEService();
  final SyncService _syncService = SyncService();
  StreamSubscription<SyncEvent>? _sseSubscription;
  List<AsistenciaRegistro> _pendientes = [];
  List<AsistenciaRegistro> _sincronizadas = [];
  bool _isLoading = true;
  bool _isUploading = false;
  DateTime _focusedDay = DateTime.now();
  DateTime? _selectedDay;

  // Stepper-based progress tracking
  final ValueNotifier<List<_SyncStepData>> _stepsNotifier = ValueNotifier([]);

  @override
  void initState() {
    super.initState();
    _cargarAsistencias();
  }

  @override
  void dispose() {
    _sseSubscription?.cancel();
    _sseService.disconnect();
    _stepsNotifier.dispose();
    super.dispose();
  }

  Future<void> _cargarAsistencias() async {
    setState(() => _isLoading = true);
    try {
      // Mostrar datos locales de inmediato — sin esperar la red
      final pendientes = _asistenciaService.obtenerAsistenciasPendientes();
      final sincronizadas = _asistenciaService
          .obtenerAsistenciasSincronizadas();
      if (mounted) {
        setState(() {
          _pendientes = pendientes;
          _sincronizadas = sincronizadas;
          _isLoading = false;
        });
      }

      // Reconciliar con servidor en background (no bloquea la UI)
      if (pendientes.isNotEmpty) {
        _reconciliarEnBackground(pendientes);
      }
    } catch (e) {
      Logger.error('Error cargando asistencias', e, StackTrace.current);
      if (mounted) setState(() => _isLoading = false);
    }
  }

  /// Reconcilia con el servidor sin bloquear la UI.
  /// Si algo cambió, actualiza el estado silenciosamente.
  void _reconciliarEnBackground(List<AsistenciaRegistro> pendientes) {
    _reconciliarConServidor(pendientes)
        .then((_) {
          final pendientesActualizados = _asistenciaService
              .obtenerAsistenciasPendientes();
          final sincronizadasActualizadas = _asistenciaService
              .obtenerAsistenciasSincronizadas();
          if (mounted && pendientesActualizados.length != _pendientes.length) {
            setState(() {
              _pendientes = pendientesActualizados;
              _sincronizadas = sincronizadasActualizadas;
            });
          }
        })
        .catchError((e) {
          Logger.error(
            'Error en reconciliación en background',
            e,
            StackTrace.current,
          );
        });
  }

  /// Check the server for records that were already synced (e.g. app was closed during upload).
  /// Only reconciles if the local attendance data hasn't changed since the last sync.
  Future<void> _reconciliarConServidor(
    List<AsistenciaRegistro> pendientes,
  ) async {
    final token = _authStorage.getToken();
    if (token == null) return;

    final records = pendientes.map((r) {
      final dateStr =
          '${r.fecha.year}-${r.fecha.month.toString().padLeft(2, '0')}-${r.fecha.day.toString().padLeft(2, '0')}';
      return {'groupId': r.grupoId, 'date': dateStr};
    }).toList();

    final syncedMap = await _apiService.checkSyncedRecords(
      token: token,
      records: records,
    );

    if (syncedMap.isEmpty) return;

    for (final registro in pendientes) {
      final dateStr =
          '${registro.fecha.year}-${registro.fecha.month.toString().padLeft(2, '0')}-${registro.fecha.day.toString().padLeft(2, '0')}';
      final key = '${registro.grupoId}_$dateStr';
      if (syncedMap[key] == true) {
        // Only mark as synced if the local data hasn't changed since last sync
        if (registro.asistenciasSincronizadas == null ||
            _attendanceMatchesSyncedSnapshot(registro)) {
          Logger.info('Reconciliación: marcando como sincronizada $key');
          await _asistenciaService.marcarComoSincronizada(registro.id);
        } else {
          Logger.info(
            'Reconciliación: $key tiene cambios locales, mantener como pendiente',
          );
        }
      }
    }
  }

  /// Returns true if the current attendance data matches the last synced snapshot
  /// (meaning no local changes were made after the sync).
  bool _attendanceMatchesSyncedSnapshot(AsistenciaRegistro registro) {
    final synced = registro.asistenciasSincronizadas;
    if (synced == null)
      return false; // No snapshot = never synced or old record, don't auto-reconcile
    final current = registro.asistenciasAlumnos;
    if (current.length != synced.length) return false;
    for (final entry in current.entries) {
      if (synced[entry.key] != entry.value) return false;
    }
    return true;
  }

  // Get dates that have pending uploads
  Set<DateTime> get _pendingDates {
    return _pendientes.map((a) {
      return DateTime(a.fecha.year, a.fecha.month, a.fecha.day);
    }).toSet();
  }

  // Get dates that are synced
  Set<DateTime> get _syncedDates {
    return _sincronizadas.map((a) {
      return DateTime(a.fecha.year, a.fecha.month, a.fecha.day);
    }).toSet();
  }

  void _showCalendarModal() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _CalendarModal(
        pendingDates: _pendingDates,
        syncedDates: _syncedDates,
        focusedDay: _focusedDay,
        selectedDay: _selectedDay,
        onDaySelected: (selectedDay, focusedDay) {
          setState(() {
            _selectedDay = selectedDay;
            _focusedDay = focusedDay;
          });
        },
      ),
    );
  }

  Future<void> _subirAsistencias() async {
    if (_pendientes.isEmpty) return;

    // Check connectivity before starting
    final hasInternet = await _syncService.hasInternetConnection();
    if (!hasInternet) {
      if (mounted) {
        HapticFeedback.heavyImpact();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Sin conexión a internet. Tienes ${_pendientes.length} registro${_pendientes.length == 1 ? '' : 's'} guardado${_pendientes.length == 1 ? '' : 's'} localmente. Cuando tengas conexión podrás sincronizarlos.',
            ),
            backgroundColor: Colors.orange.shade800,
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 5),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        );
      }
      return;
    }

    setState(() => _isUploading = true);
    HapticFeedback.mediumImpact();

    // Initialize 4 fixed steps
    _stepsNotifier.value = [
      _SyncStepData(
        label: 'Conectando al servidor',
        status: _StepStatus.inProgress,
      ),
      _SyncStepData(label: 'Conectado', status: _StepStatus.pending),
      _SyncStepData(label: 'Subiendo asistencia', status: _StepStatus.pending),
      _SyncStepData(label: '¡Terminado!', status: _StepStatus.pending),
    ];

    final grupos = _authStorage.getGrupos() ?? [];
    int successCount = 0;
    final total = _pendientes.length;

    for (int i = 0; i < _pendientes.length; i++) {
      final reg = _pendientes[i];
      final grupo = _resolveGrupo(grupos, reg.grupoId);
      final className = reg.nombreClase ?? grupo?.name ?? reg.grupoId;

      // Update step 2 label with current class
      final classLabel = total > 1
          ? 'Subiendo: $className (${i + 1}/$total)'
          : 'Subiendo: $className';
      final step2Status = i == 0 ? _StepStatus.pending : _StepStatus.inProgress;
      _updateStep(2, step2Status, label: classLabel, subtitle: '');

      final success = await _subirRegistro(reg);
      if (success) {
        _updateStep(2, _StepStatus.completed);
        successCount++;
      } else {
        _updateStep(2, _StepStatus.failed);
      }
    }

    // Final step states
    if (successCount == total) {
      _updateStep(3, _StepStatus.completed);
      HapticFeedback.heavyImpact();
      await Future.delayed(const Duration(seconds: 2));
    } else if (successCount > 0) {
      _updateStep(
        3,
        _StepStatus.failed,
        subtitle:
            '$successCount de $total subidos. Los fallidos se pueden reintentar.',
      );
      HapticFeedback.heavyImpact();
      await Future.delayed(const Duration(seconds: 3));
    } else {
      _updateStep(2, _StepStatus.failed);
      _updateStep(
        3,
        _StepStatus.failed,
        subtitle: 'Error al subir asistencias. Intenta de nuevo.',
      );
      HapticFeedback.heavyImpact();
      await Future.delayed(const Duration(seconds: 3));
    }

    await _cargarAsistencias();
    if (mounted) {
      setState(() => _isUploading = false);
    }
  }

  void _updateStep(
    int index,
    _StepStatus status, {
    String? subtitle,
    String? label,
  }) {
    final steps = List<_SyncStepData>.from(_stepsNotifier.value);
    steps[index] = steps[index].copyWith(
      status: status,
      subtitle: subtitle,
      label: label,
    );
    _stepsNotifier.value = steps;
  }

  Widget _buildUploadingState() {
    return ValueListenableBuilder<List<_SyncStepData>>(
      valueListenable: _stepsNotifier,
      builder: (context, steps, _) {
        final allCompleted = steps.every(
          (s) => s.status == _StepStatus.completed,
        );
        final anyFailed = steps.any((s) => s.status == _StepStatus.failed);
        final activeStep = steps.cast<_SyncStepData?>().firstWhere(
          (s) => s!.status == _StepStatus.inProgress,
          orElse: () => null,
        );

        return Column(
          children: [
            // Stepper card
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: const Color(0xFF1C1C1E),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Header
                  Text(
                    allCompleted
                        ? '¡Sincronización completada!'
                        : anyFailed
                        ? 'Error en sincronización'
                        : 'Sincronizando...',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  if (activeStep?.subtitle != null &&
                      activeStep!.subtitle!.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      activeStep.subtitle!,
                      style: TextStyle(
                        color: Colors.grey.shade400,
                        fontSize: 14,
                      ),
                    ),
                  ],
                  const SizedBox(height: 32),
                  // Steps
                  for (int i = 0; i < steps.length; i++)
                    _buildStepItem(steps[i], i, steps.length),
                ],
              ),
            ),
            const Spacer(),
            // Bottom info bar
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.blue.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.blue.withValues(alpha: 0.2)),
              ),
              child: Row(
                children: [
                  Icon(Icons.cloud_done, color: Colors.blue.shade400),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'La sincronización continúa en la nube.\nPuedes cerrar la app.',
                      style: TextStyle(
                        color: Colors.blue.shade400,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 40),
          ],
        );
      },
    );
  }

  Widget _buildStepItem(_SyncStepData step, int index, int total) {
    final isLast = index == total - 1;
    final isActive = step.status == _StepStatus.inProgress;
    final isPast = step.status == _StepStatus.completed;
    final isFailed = step.status == _StepStatus.failed;

    Color circleColor;
    if (isPast) {
      circleColor = Colors.orange;
    } else if (isActive) {
      circleColor = Colors.orange;
    } else if (isFailed) {
      circleColor = Colors.red;
    } else {
      circleColor = Colors.grey.shade700;
    }

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Circle + line
          SizedBox(
            width: 40,
            child: Column(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isPast || isActive || isFailed
                        ? circleColor
                        : Colors.transparent,
                    border: Border.all(color: circleColor, width: 2),
                  ),
                  child: Center(
                    child: isPast
                        ? const Icon(Icons.check, color: Colors.white, size: 18)
                        : isActive
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(
                                Colors.white,
                              ),
                            ),
                          )
                        : isFailed
                        ? const Icon(Icons.close, color: Colors.white, size: 18)
                        : null,
                  ),
                ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      color: isPast ? Colors.orange : Colors.grey.shade800,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          // Text content with optional highlight for active step
          Expanded(
            child: Container(
              margin: EdgeInsets.only(bottom: isLast ? 0 : 24),
              padding: isActive
                  ? const EdgeInsets.all(12)
                  : const EdgeInsets.only(top: 4),
              decoration: isActive
                  ? BoxDecoration(
                      color: Colors.orange.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    )
                  : null,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    step.label,
                    style: TextStyle(
                      color: step.status == _StepStatus.pending
                          ? Colors.grey.shade600
                          : Colors.white,
                      fontWeight: isActive ? FontWeight.bold : FontWeight.w500,
                      fontSize: isActive ? 16 : 14,
                    ),
                  ),
                  if ((isActive || isFailed) &&
                      step.subtitle != null &&
                      step.subtitle!.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      step.subtitle!,
                      style: TextStyle(
                        color: isFailed
                            ? Colors.red.shade300
                            : Colors.grey.shade400,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<bool> _subirRegistro(AsistenciaRegistro registro) async {
    final token = _authStorage.getToken();
    final profesor = _authStorage.getProfesor();
    final grupos = _authStorage.getGrupos();

    if (token == null || profesor == null || grupos == null) {
      return false;
    }

    final grupo = _resolveGrupo(grupos, registro.grupoId);
    if (grupo == null) {
      return false;
    }

    final registroActualizado = await _migrarRegistroSiNecesario(
      registro,
      grupo,
    );

    final attendances = _buildAttendances(registroActualizado, grupo);
    if (attendances.isEmpty) {
      // No changes vs last synced state — just mark as synced locally
      await _asistenciaService.marcarComoSincronizada(registroActualizado.id);
      return true;
    }

    final storedPassword = _authStorage.getEncryptedPassword();
    if (storedPassword == null || storedPassword.isEmpty) {
      return false;
    }

    final encryptedPassword = _apiService.ensureEncryptedPassword(
      storedPassword,
    );

    final result = await _apiService.uploadAttendance(
      token: token,
      groupId: grupo.id,
      date: registroActualizado.fecha,
      attendances: attendances,
      encryptedPassword: encryptedPassword,
    );

    return await result.fold(
      (error) async {
        Logger.error('Error al subir: $error');
        return false;
      },
      (_) async {
        final syncSuccess = await _waitForSyncCompletion(profesor.id, token);
        if (syncSuccess) {
          await _asistenciaService.marcarComoSincronizada(
            registroActualizado.id,
          );
          return true;
        }
        return false;
      },
    );
  }

  Grupo? _resolveGrupo(List<Grupo> grupos, String grupoId) {
    final direct = grupos.firstWhere(
      (g) => g.id == grupoId,
      orElse: () => const Grupo(
        id: '',
        group: '',
        classroom: '',
        name: '',
        students: const [],
      ),
    );

    if (direct.id.isNotEmpty) return direct;

    final byLegacy = grupos.firstWhere(
      (g) => g.identificadorUnico == grupoId,
      orElse: () => const Grupo(
        id: '',
        group: '',
        classroom: '',
        name: '',
        students: const [],
      ),
    );

    return byLegacy.id.isNotEmpty ? byLegacy : null;
  }

  Future<AsistenciaRegistro> _migrarRegistroSiNecesario(
    AsistenciaRegistro registro,
    Grupo grupo,
  ) async {
    if (registro.grupoId == grupo.id) {
      return registro;
    }

    final nuevoId =
        '${grupo.id}_${registro.fecha.year}-${registro.fecha.month}-${registro.fecha.day}';
    final actualizado = registro.copyWith(grupoId: grupo.id, id: nuevoId);
    await _asistenciaService.guardarAsistencia(actualizado);
    await _asistenciaService.eliminarAsistencia(registro.id);
    return actualizado;
  }

  List<Map<String, dynamic>> _buildAttendances(
    AsistenciaRegistro registro,
    Grupo grupo,
  ) {
    final studentIdMap = <String, String>{};
    for (final student in grupo.students) {
      if (student.id != null) {
        studentIdMap[student.id!] = student.id!;
        studentIdMap[student.number.toString()] = student.id!;
      }
    }

    final synced = registro.asistenciasSincronizadas;
    final attendances = <Map<String, dynamic>>[];
    registro.asistenciasAlumnos.forEach((key, present) {
      final studentId = studentIdMap[key];
      if (studentId == null) {
        return;
      }
      // If we have a synced snapshot, only include students whose state changed
      if (synced != null && synced[key] == present) {
        return; // No change for this student, skip
      }
      attendances.add({
        'studentId': studentId,
        'status': present ? 'PRESENT' : 'ABSENT',
      });
    });

    return attendances;
  }

  void _showPendingDetailsModal() {
    // Sort: today first, then most recent
    final sorted = List<AsistenciaRegistro>.from(_pendientes)
      ..sort((a, b) => b.fecha.compareTo(a.fecha));

    final grupos = _authStorage.getGrupos() ?? [];
    // Build student name lookup: studentId -> name
    final studentNames = <String, String>{};
    for (final grupo in grupos) {
      for (final student in grupo.students) {
        if (student.id != null) {
          studentNames[student.id!] = student.name;
        }
      }
    }
    // Build grupo name lookup: grupoId -> Grupo
    final grupoMap = <String, Grupo>{};
    for (final grupo in grupos) {
      grupoMap[grupo.id] = grupo;
      grupoMap[grupo.identificadorUnico] = grupo;
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _PendingDetailsModal(
        pendientes: sorted,
        studentNames: studentNames,
        grupoMap: grupoMap,
      ),
    );
  }

  Future<bool> _waitForSyncCompletion(String professorId, String token) async {
    final completer = Completer<bool>();

    await _sseSubscription?.cancel();
    _sseSubscription = _sseService
        .connect(professorId, token)
        .listen(
          (event) {
            if (event.type == SyncEventType.connected) {
              // SSE handshake done → step 0 complete
              if (_stepsNotifier.value[0].status != _StepStatus.completed) {
                _updateStep(0, _StepStatus.completed);
              }
              if (_stepsNotifier.value[1].status != _StepStatus.completed) {
                _updateStep(
                  1,
                  _StepStatus.inProgress,
                  subtitle: 'Esperando al servidor...',
                );
              }
            } else if (event.type == SyncEventType.progress) {
              if (event.status == 'IN_PROGRESS') {
                // Worker picked up the job
                if (_stepsNotifier.value[1].status != _StepStatus.completed) {
                  _updateStep(1, _StepStatus.completed);
                }
                _updateStep(2, _StepStatus.inProgress, subtitle: event.message);
              } else if (event.message.isNotEmpty) {
                // PENDING state with a message
                if (_stepsNotifier.value[1].status != _StepStatus.completed) {
                  _updateStep(
                    1,
                    _StepStatus.inProgress,
                    subtitle: event.message,
                  );
                }
              }
            }

            if (event.isCompleted) {
              _updateStep(
                2,
                _StepStatus.completed,
                subtitle: 'Asistencia subida correctamente',
              );
              if (!completer.isCompleted) completer.complete(true);
            }
            if (event.isFailed) {
              _updateStep(2, _StepStatus.failed, subtitle: event.message);
              if (!completer.isCompleted) completer.complete(false);
            }
          },
          onError: (_) {
            if (!completer.isCompleted) completer.complete(false);
          },
        );

    final result = await completer.future.timeout(
      const Duration(minutes: 5),
      onTimeout: () => false,
    );

    _sseService.disconnect();
    return result;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: _isLoading
                  ? const Center(
                      child: CircularProgressIndicator(color: Colors.white),
                    )
                  : _buildContent(),
            ),
          ),
          // Botón de cerrar
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            left: 12,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(22),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                child: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: const Color(0xFF2C2C2E).withOpacity(0.72),
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(
                      color: Colors.white.withOpacity(0.1),
                      width: 0.5,
                    ),
                  ),
                  child: IconButton(
                    padding: EdgeInsets.zero,
                    icon: const Icon(
                      Icons.close,
                      color: Colors.white,
                      size: 24,
                    ),
                    onPressed: () {
                      HapticFeedback.lightImpact();
                      Navigator.of(context).pop();
                    },
                  ),
                ),
              ),
            ),
          ),
          // Botón Ver calendario — glassmorphism, esquina superior derecha
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            right: 12,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(22),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                child: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: const Color(0xFF2C2C2E).withOpacity(0.72),
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(
                      color: Colors.white.withOpacity(0.1),
                      width: 0.5,
                    ),
                  ),
                  child: IconButton(
                    padding: EdgeInsets.zero,
                    icon: const Icon(
                      Icons.calendar_month_rounded,
                      color: Colors.white,
                      size: 20,
                    ),
                    onPressed: () {
                      HapticFeedback.lightImpact();
                      _showCalendarModal();
                    },
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildContent() {
    return Column(
      children: [
        const SizedBox(height: 80),
        const Align(
          alignment: Alignment.centerLeft,
          child: Text(
            'Sincronización',
            style: TextStyle(
              color: Colors.white,
              fontSize: 34,
              fontWeight: FontWeight.bold,
              letterSpacing: 0.4,
            ),
          ),
        ),
        const SizedBox(height: 40),
        Expanded(
          child: _isUploading
              ? _buildUploadingState()
              : _pendientes.isEmpty
              ? _buildAllSyncedState()
              : _buildPendingState(),
        ),
      ],
    );
  }

  Widget _buildAllSyncedState() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: 120,
          height: 120,
          decoration: BoxDecoration(
            color: Colors.green.withOpacity(0.15),
            shape: BoxShape.circle,
          ),
          child: Icon(
            Icons.cloud_done_rounded,
            size: 64,
            color: Colors.green.shade400,
          ),
        ),
        const SizedBox(height: 32),
        const Text(
          '¡Estás al día!',
          style: TextStyle(
            color: Colors.white,
            fontSize: 28,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'Toda tu información está en la nube',
          style: TextStyle(color: Colors.grey.shade400, fontSize: 16),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 80),
      ],
    );
  }

  Widget _buildPendingState() {
    return Column(
      children: [
        GestureDetector(
          onTap: () {
            HapticFeedback.lightImpact();
            _showPendingDetailsModal();
          },
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: const Color(0xFF1C1C1E),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.06),
                width: 0.5,
              ),
            ),
            child: Column(
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: Colors.orange.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(
                        Icons.pending_actions_rounded,
                        size: 24,
                        color: Colors.orange,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Asistencias pendientes',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 17,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${_pendientes.length} registro${_pendientes.length == 1 ? '' : 's'} por subir',
                            style: TextStyle(
                              color: Colors.grey.shade400,
                              fontSize: 14,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.05),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.list_alt_rounded,
                        color: Colors.grey.shade300,
                        size: 16,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Revisar detalles',
                        style: TextStyle(
                          color: Colors.grey.shade300,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 24),
        // Botón Subir Asistencias — estilo card con ícono teal
        GestureDetector(
          onTap: _isUploading ? null : _subirAsistencias,
          child: Container(
            width: double.infinity,
            margin: const EdgeInsets.only(bottom: 40),
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            decoration: BoxDecoration(
              color: const Color(0xFF1C1C1E),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.06),
                width: 0.5,
              ),
            ),
            child: Row(
              children: [
                // Ícono teal
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E3A38),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: _isUploading
                      ? const Center(
                          child: SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              color: Color(0xFF4DB8A8),
                              strokeWidth: 2.5,
                            ),
                          ),
                        )
                      : const Icon(
                          Icons.cloud_upload_rounded,
                          color: Color(0xFF4DB8A8),
                          size: 24,
                        ),
                ),
                const SizedBox(width: 16),
                Text(
                  'Subir Asistencias',
                  style: TextStyle(
                    color: _isUploading ? Colors.grey.shade600 : Colors.white,
                    fontSize: 17,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// Modal bottom sheet for calendar view
class _CalendarModal extends StatefulWidget {
  final Set<DateTime> pendingDates;
  final Set<DateTime> syncedDates;
  final DateTime focusedDay;
  final DateTime? selectedDay;
  final Function(DateTime, DateTime) onDaySelected;

  const _CalendarModal({
    required this.pendingDates,
    required this.syncedDates,
    required this.focusedDay,
    required this.selectedDay,
    required this.onDaySelected,
  });

  @override
  State<_CalendarModal> createState() => _CalendarModalState();
}

class _CalendarModalState extends State<_CalendarModal> {
  late DateTime _focusedDay;
  DateTime? _selectedDay;

  @override
  void initState() {
    super.initState();
    _focusedDay = widget.focusedDay;
    _selectedDay = widget.selectedDay;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.7,
      decoration: const BoxDecoration(
        color: Color(0xFF1C1C1E),
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(20),
          topRight: Radius.circular(20),
        ),
      ),
      child: Column(
        children: [
          // Handle bar
          Container(
            margin: const EdgeInsets.only(top: 12),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey.shade600,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          // Title
          const Padding(
            padding: EdgeInsets.all(20),
            child: Text(
              'Calendario de Asistencias',
              style: TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          // Legend
          _buildLegend(),
          const SizedBox(height: 16),
          // Calendar
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TableCalendar(
                firstDay: DateTime.now().subtract(const Duration(days: 365)),
                lastDay: DateTime.now().add(const Duration(days: 30)),
                focusedDay: _focusedDay,
                selectedDayPredicate: (day) => isSameDay(_selectedDay, day),
                onDaySelected: (selectedDay, focusedDay) {
                  setState(() {
                    _selectedDay = selectedDay;
                    _focusedDay = focusedDay;
                  });
                  widget.onDaySelected(selectedDay, focusedDay);
                  HapticFeedback.selectionClick();
                },
                onPageChanged: (focusedDay) {
                  setState(() => _focusedDay = focusedDay);
                },
                locale: 'es_ES',
                startingDayOfWeek: StartingDayOfWeek.monday,
                headerStyle: HeaderStyle(
                  formatButtonVisible: false,
                  titleCentered: true,
                  titleTextStyle: const TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                  leftChevronIcon: const Icon(
                    Icons.chevron_left,
                    color: Colors.white,
                    size: 28,
                  ),
                  rightChevronIcon: const Icon(
                    Icons.chevron_right,
                    color: Colors.white,
                    size: 28,
                  ),
                ),
                daysOfWeekStyle: DaysOfWeekStyle(
                  weekdayStyle: TextStyle(
                    color: Colors.grey.shade400,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                  weekendStyle: TextStyle(
                    color: Colors.grey.shade600,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                calendarStyle: CalendarStyle(
                  defaultTextStyle: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                  ),
                  weekendTextStyle: TextStyle(
                    color: Colors.grey.shade500,
                    fontSize: 16,
                  ),
                  outsideTextStyle: TextStyle(
                    color: Colors.grey.shade700,
                    fontSize: 16,
                  ),
                  todayDecoration: BoxDecoration(
                    color: Colors.blue.withOpacity(0.3),
                    shape: BoxShape.circle,
                  ),
                  todayTextStyle: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                  selectedDecoration: BoxDecoration(
                    color: Colors.blue.shade600,
                    shape: BoxShape.circle,
                  ),
                  selectedTextStyle: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                  cellMargin: const EdgeInsets.all(6),
                ),
                calendarBuilders: CalendarBuilders(
                  defaultBuilder: (context, day, focusedDay) {
                    final normalizedDay = DateTime(
                      day.year,
                      day.month,
                      day.day,
                    );
                    final isPending = widget.pendingDates.contains(
                      normalizedDay,
                    );
                    final isSynced = widget.syncedDates.contains(normalizedDay);

                    if (isPending) {
                      return _buildDayWithIndicator(day, Colors.orange);
                    } else if (isSynced) {
                      return _buildDayWithIndicator(day, Colors.green);
                    }
                    return null;
                  },
                  todayBuilder: (context, day, focusedDay) {
                    final normalizedDay = DateTime(
                      day.year,
                      day.month,
                      day.day,
                    );
                    final isPending = widget.pendingDates.contains(
                      normalizedDay,
                    );
                    final isSynced = widget.syncedDates.contains(normalizedDay);

                    Color? indicatorColor;
                    if (isPending) {
                      indicatorColor = Colors.orange;
                    } else if (isSynced) {
                      indicatorColor = Colors.green;
                    }

                    return Container(
                      margin: const EdgeInsets.all(4),
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: Colors.blue.withOpacity(0.3),
                              shape: BoxShape.circle,
                            ),
                            child: Center(
                              child: Text(
                                '${day.day}',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 16,
                                ),
                              ),
                            ),
                          ),
                          if (indicatorColor != null)
                            Positioned(
                              bottom: 2,
                              child: Container(
                                width: 8,
                                height: 8,
                                decoration: BoxDecoration(
                                  color: indicatorColor,
                                  shape: BoxShape.circle,
                                ),
                              ),
                            ),
                        ],
                      ),
                    );
                  },
                  selectedBuilder: (context, day, focusedDay) {
                    final normalizedDay = DateTime(
                      day.year,
                      day.month,
                      day.day,
                    );
                    final isPending = widget.pendingDates.contains(
                      normalizedDay,
                    );
                    final isSynced = widget.syncedDates.contains(normalizedDay);
                    final indicatorColor = isPending
                        ? Colors.orange
                        : isSynced
                        ? Colors.green
                        : null;
                    return Container(
                      margin: const EdgeInsets.all(4),
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: Colors.blue.shade600,
                              shape: BoxShape.circle,
                            ),
                            child: Center(
                              child: Text(
                                '${day.day}',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 16,
                                ),
                              ),
                            ),
                          ),
                          if (indicatorColor != null)
                            Positioned(
                              bottom: 2,
                              child: Container(
                                width: 8,
                                height: 8,
                                decoration: BoxDecoration(
                                  color: indicatorColor,
                                  shape: BoxShape.circle,
                                ),
                              ),
                            ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ),
          ),
          // Close button
          Padding(
            padding: const EdgeInsets.all(20),
            child: SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton(
                onPressed: () => Navigator.of(context).pop(),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.grey.shade800,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text(
                  'Cerrar',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDayWithIndicator(DateTime day, Color indicatorColor) {
    return Container(
      margin: const EdgeInsets.all(4),
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            width: 40,
            height: 40,
            child: Center(
              child: Text(
                '${day.day}',
                style: const TextStyle(color: Colors.white, fontSize: 16),
              ),
            ),
          ),
          Positioned(
            bottom: 2,
            child: Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: indicatorColor,
                shape: BoxShape.circle,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLegend() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _buildLegendItem(Colors.orange, 'Pendiente'),
        const SizedBox(width: 32),
        _buildLegendItem(Colors.green, 'Sincronizado'),
      ],
    );
  }

  Widget _buildLegendItem(Color color, String label) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 12,
          height: 12,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 8),
        Text(
          label,
          style: TextStyle(color: Colors.grey.shade300, fontSize: 14),
        ),
      ],
    );
  }
}

/// Modal bottom sheet showing pending attendance details
class _PendingDetailsModal extends StatefulWidget {
  final List<AsistenciaRegistro> pendientes;
  final Map<String, String> studentNames;
  final Map<String, Grupo> grupoMap;

  const _PendingDetailsModal({
    required this.pendientes,
    required this.studentNames,
    required this.grupoMap,
  });

  @override
  State<_PendingDetailsModal> createState() => _PendingDetailsModalState();
}

class _PendingDetailsModalState extends State<_PendingDetailsModal> {
  final Set<int> _expandedIndices = {};

  String _formatFecha(DateTime fecha) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final fechaNorm = DateTime(fecha.year, fecha.month, fecha.day);
    final diff = today.difference(fechaNorm).inDays;

    final diasSemana = [
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
      'Sábado',
      'Domingo',
    ];
    final meses = [
      '',
      'Ene',
      'Feb',
      'Mar',
      'Abr',
      'May',
      'Jun',
      'Jul',
      'Ago',
      'Sep',
      'Oct',
      'Nov',
      'Dic',
    ];

    final diaSemana = diasSemana[fecha.weekday - 1];
    final fechaStr = '${fecha.day} ${meses[fecha.month]}';

    if (diff == 0) return 'Hoy · $diaSemana $fechaStr';
    if (diff == 1) return 'Ayer · $diaSemana $fechaStr';
    if (diff == 2) return 'Antier · $diaSemana $fechaStr';
    return '$diaSemana $fechaStr';
  }

  String _resolveStudentName(String key) {
    return widget.studentNames[key] ?? key;
  }

  /// Returns (className, groupMeta) where groupMeta is "Grupo K · Salón 301"
  (String, String?) _resolveGrupoMeta(AsistenciaRegistro registro) {
    final grupo = widget.grupoMap[registro.grupoId];
    if (grupo != null) {
      final className = registro.nombreClase ?? grupo.name;
      final meta = 'Grupo ${grupo.groupLetter} · ${grupo.classroom}';
      return (className, meta);
    }
    final fallback = registro.nombreClase ?? registro.grupoId;
    return (fallback, null);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.75,
      decoration: const BoxDecoration(
        color: Color(0xFF1C1C1E),
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(20),
          topRight: Radius.circular(20),
        ),
      ),
      child: Column(
        children: [
          // Handle bar
          Container(
            margin: const EdgeInsets.only(top: 12),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey.shade600,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          // Title
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 20, 20, 8),
            child: Text(
              'Asistencias Pendientes',
              style: TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              '${widget.pendientes.length} registro${widget.pendientes.length == 1 ? '' : 's'}',
              style: TextStyle(color: Colors.grey.shade400, fontSize: 14),
            ),
          ),
          const Divider(color: Color(0xFF3A3A3C), height: 1),
          // List
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: widget.pendientes.length,
              separatorBuilder: (_, __) => const Divider(
                color: Color(0xFF3A3A3C),
                height: 1,
                indent: 16,
                endIndent: 16,
              ),
              itemBuilder: (context, index) {
                final registro = widget.pendientes[index];
                final isExpanded = _expandedIndices.contains(index);
                return _buildRegistroTile(registro, index, isExpanded);
              },
            ),
          ),
          // Close button
          Padding(
            padding: const EdgeInsets.all(20),
            child: SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton(
                onPressed: () => Navigator.of(context).pop(),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.grey.shade800,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text(
                  'Cerrar',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Returns only entries that changed vs the last synced snapshot.
  /// If no snapshot exists, returns all entries (first-time upload).
  Map<String, bool> _changedEntries(AsistenciaRegistro registro) {
    final synced = registro.asistenciasSincronizadas;
    if (synced == null) return registro.asistenciasAlumnos;
    return Map.fromEntries(
      registro.asistenciasAlumnos.entries.where(
        (e) => synced[e.key] != e.value,
      ),
    );
  }

  Widget _buildRegistroTile(
    AsistenciaRegistro registro,
    int index,
    bool isExpanded,
  ) {
    final changed = _changedEntries(registro);
    final total = changed.length;
    final (className, grupoMeta) = _resolveGrupoMeta(registro);

    return Column(
      children: [
        // Header row (tappable)
        InkWell(
          onTap: () {
            HapticFeedback.selectionClick();
            setState(() {
              if (isExpanded) {
                _expandedIndices.remove(index);
              } else {
                _expandedIndices.add(index);
              }
            });
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              children: [
                // Orange dot
                Container(
                  width: 10,
                  height: 10,
                  decoration: const BoxDecoration(
                    color: Colors.orange,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 12),
                // Date + group info
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _formatFecha(registro.fecha),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        className,
                        style: TextStyle(
                          color: Colors.grey.shade400,
                          fontSize: 13,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (grupoMeta != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          grupoMeta,
                          style: TextStyle(
                            color: Colors.grey.shade600,
                            fontSize: 12,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                // Changed count chip
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.orange.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    total == 1 ? '$total cambio' : '$total cambios',
                    style: TextStyle(
                      color: Colors.orange.shade400,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                // Expand arrow
                AnimatedRotation(
                  turns: isExpanded ? 0.5 : 0,
                  duration: const Duration(milliseconds: 200),
                  child: Icon(
                    Icons.keyboard_arrow_down_rounded,
                    color: Colors.grey.shade400,
                    size: 24,
                  ),
                ),
              ],
            ),
          ),
        ),
        // Expandable details
        AnimatedCrossFade(
          alignment: Alignment.topCenter,
          firstChild: const SizedBox(width: double.infinity, height: 0),
          secondChild: SizedBox(
            width: double.infinity,
            child: _buildStudentList(registro),
          ),
          crossFadeState: isExpanded
              ? CrossFadeState.showSecond
              : CrossFadeState.showFirst,
          duration: const Duration(milliseconds: 200),
        ),
      ],
    );
  }

  Widget _buildStudentList(AsistenciaRegistro registro) {
    // Only show students whose attendance changed vs last synced snapshot
    final changed = _changedEntries(registro);
    final hasSnapshot = registro.asistenciasSincronizadas != null;

    // Sort: present (new) first, then absent
    final entries = changed.entries.toList()
      ..sort((a, b) {
        if (a.value != b.value) return a.value ? -1 : 1;
        return _resolveStudentName(a.key).compareTo(_resolveStudentName(b.key));
      });

    return Container(
      margin: const EdgeInsets.fromLTRB(38, 0, 16, 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF2C2C2E),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (hasSnapshot)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                'Cambios desde la última subida:',
                style: TextStyle(
                  color: Colors.grey.shade500,
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ...entries.map((entry) {
            final name = _resolveStudentName(entry.key);
            final present = entry.value;
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: Row(
                children: [
                  Icon(
                    present ? Icons.check_circle_rounded : Icons.cancel_rounded,
                    color: present
                        ? Colors.green.shade400
                        : Colors.red.shade400,
                    size: 18,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      name,
                      style: TextStyle(
                        color: present ? Colors.white : Colors.grey.shade500,
                        fontSize: 14,
                      ),
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}

// --- Stepper data models ---

enum _StepStatus { pending, inProgress, completed, failed }

class _SyncStepData {
  final String label;
  final _StepStatus status;
  final String? subtitle;

  const _SyncStepData({
    required this.label,
    required this.status,
    this.subtitle,
  });

  _SyncStepData copyWith({
    String? label,
    _StepStatus? status,
    String? subtitle,
  }) => _SyncStepData(
    label: label ?? this.label,
    status: status ?? this.status,
    subtitle: subtitle ?? this.subtitle,
  );
}
