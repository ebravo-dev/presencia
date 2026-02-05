import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:table_calendar/table_calendar.dart';

import '../../../services/asistencia_local_service.dart';
import '../../../shared/models/asistencia_registro.dart';
import '../../../core/utils/utils.dart';

class UploadManagementPage extends StatefulWidget {
  const UploadManagementPage({super.key});

  @override
  State<UploadManagementPage> createState() => _UploadManagementPageState();
}

class _UploadManagementPageState extends State<UploadManagementPage> {
  final AsistenciaLocalService _asistenciaService = AsistenciaLocalService();
  List<AsistenciaRegistro> _pendientes = [];
  List<AsistenciaRegistro> _sincronizadas = [];
  bool _isLoading = true;
  bool _isUploading = false;
  DateTime _focusedDay = DateTime.now();
  DateTime? _selectedDay;

  @override
  void initState() {
    super.initState();
    _cargarAsistencias();
  }

  Future<void> _cargarAsistencias() async {
    setState(() => _isLoading = true);
    try {
      final pendientes = _asistenciaService.obtenerAsistenciasPendientes();
      setState(() {
        _pendientes = pendientes;
        _sincronizadas = []; // TODO: Get synced ones from service
        _isLoading = false;
      });
    } catch (e) {
      Logger.error('Error cargando asistencias', e, StackTrace.current);
      setState(() => _isLoading = false);
    }
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

    setState(() => _isUploading = true);
    HapticFeedback.mediumImpact();

    try {
      // TODO: Implementar la lógica de subida al servidor
      await Future.delayed(const Duration(seconds: 2));

      // Marcar como sincronizadas
      for (final asistencia in _pendientes) {
        await _asistenciaService.marcarComoSincronizada(asistencia.id);
      }

      await _cargarAsistencias();

      if (mounted) {
        HapticFeedback.heavyImpact();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('¡Asistencias subidas correctamente!'),
            backgroundColor: Colors.green.shade700,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        );
      }
    } catch (e) {
      Logger.error('Error subiendo asistencias', e, StackTrace.current);
      if (mounted) {
        HapticFeedback.heavyImpact();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text(
              'Error al subir asistencias. Intenta de nuevo.',
            ),
            backgroundColor: Colors.red.shade700,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isUploading = false);
      }
    }
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
        ],
      ),
    );
  }

  Widget _buildContent() {
    return Column(
      children: [
        const SizedBox(height: 80),
        const Text(
          'Sincronización',
          style: TextStyle(
            color: Colors.white,
            fontSize: 34,
            fontWeight: FontWeight.bold,
            letterSpacing: 0.4,
          ),
        ),
        const SizedBox(height: 40),
        Expanded(
          child: _pendientes.isEmpty
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
        const SizedBox(height: 24),
        // Botón Ver calendario
        GestureDetector(
          onTap: () {
            HapticFeedback.lightImpact();
            _showCalendarModal();
          },
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.calendar_month, color: Colors.blue.shade400, size: 18),
              const SizedBox(width: 6),
              Text(
                'Ver calendario',
                style: TextStyle(
                  color: Colors.blue.shade400,
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 80),
      ],
    );
  }

  Widget _buildPendingState() {
    return Column(
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: const Color(0xFF1C1C1E),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.orange.withOpacity(0.3), width: 1),
          ),
          child: Column(
            children: [
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  color: Colors.orange.withOpacity(0.15),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.cloud_upload_rounded,
                  size: 44,
                  color: Colors.orange,
                ),
              ),
              const SizedBox(height: 20),
              const Text(
                'Tienes asistencias por subir',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                '${_pendientes.length} registro${_pendientes.length == 1 ? '' : 's'} pendiente${_pendientes.length == 1 ? '' : 's'}',
                style: TextStyle(color: Colors.grey.shade400, fontSize: 14),
              ),
              const SizedBox(height: 20),
              // Botón Ver calendario - abre modal
              GestureDetector(
                onTap: () {
                  HapticFeedback.lightImpact();
                  _showCalendarModal();
                },
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.calendar_month,
                      color: Colors.blue.shade400,
                      size: 18,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      'Ver calendario',
                      style: TextStyle(
                        color: Colors.blue.shade400,
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(width: 4),
                    Icon(
                      Icons.open_in_new,
                      color: Colors.blue.shade400,
                      size: 16,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const Spacer(),
        Container(
          width: double.infinity,
          height: 56,
          margin: const EdgeInsets.only(bottom: 40),
          child: ElevatedButton(
            onPressed: _isUploading ? null : _subirAsistencias,
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.blue,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
              elevation: 0,
            ),
            child: _isUploading
                ? const SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(
                      color: Colors.white,
                      strokeWidth: 2.5,
                    ),
                  )
                : const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.cloud_upload_rounded, size: 24),
                      SizedBox(width: 12),
                      Text(
                        'Subir Asistencias',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
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
