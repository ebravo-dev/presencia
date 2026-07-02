import 'dart:async';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/uat_colors.dart';
import '../../../../shared/models/grupo.dart';
import '../../../../services/asistencia_local_service.dart';
import '../../../../services/api_service.dart';
import '../../../../services/auth_storage_service.dart';
import '../../../../services/native_altbeacon_channel.dart';
import '../../../../services/teacher_beacon_attendance_service.dart';
import '../../../../core/permissions/permission_service.dart';
import '../../authentication/providers/profesor_auth_provider.dart';
import 'grupo_detail_page.dart';
import 'upload_management_page.dart';

class GruposPage extends ConsumerStatefulWidget {
  const GruposPage({super.key});

  @override
  ConsumerState<GruposPage> createState() => _GruposPageState();
}

class _GruposPageState extends ConsumerState<GruposPage>
    with SingleTickerProviderStateMixin {
  final ScrollController _scrollController = ScrollController();
  bool _isExpanded = false; // Control de expansión de tarjetas
  bool _showTitle = true; // Control de visibilidad del título
  late AnimationController _pulseController;
  int? _selectedCardIndex; // Índice de la tarjeta seleccionada para navegación
  Timer? _titleVisibilityTimer; // Controla el retraso para esconder el título

  static const List<List<Color>> _cardGradients = [
    [Color(0xFF8B5CF6), Color(0xFF7C3AED)],
    [Color(0xFFFF6B9D), Color(0xFFFF5A8F)],
    [Color(0xFF2DD4BF), Color(0xFF14B8A6)],
    [Color(0xFFFF8A65), Color(0xFFFF7043)],
    [Color(0xFF60A5FA), Color(0xFF3B82F6)],
    [Color(0xFFFF6B9D), Color(0xFFFF5A8F)],
  ];

  static const List<Color> _cardAccentColors = [
    Colors.white,
    Colors.white,
    Colors.white,
    Colors.white,
    Colors.white,
    Colors.white,
  ];

  @override
  void initState() {
    super.initState();

    // Animación pulsante para el indicador de clase actual
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat(reverse: true);

    // Listener para animar el título basado en scroll
    _scrollController.addListener(_handleScroll);

    // Configurar status bar para tema oscuro
    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
      ),
    );

    // Check sync status on startup
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkSyncOnStart();
    });
  }

  @override
  void dispose() {
    _titleVisibilityTimer?.cancel();
    _scrollController.removeListener(_handleScroll);
    _scrollController.dispose();
    _pulseController.dispose();
    TeacherBeaconAttendanceService().stop();
    super.dispose();
  }

  /// Checks sync status on app start and handles accordingly
  Future<void> _checkSyncOnStart() async {
    final authStorage = AuthStorageService();
    final apiService = ApiService();

    final token = authStorage.getToken();
    if (token == null) return;

    final result = await apiService.getSyncStatus(token);

    result.fold(
      (error) {
        // Ignore errors, just show current state
      },
      (status) {
        if (!mounted) return;

        if (status.isInProgress) {
          // Redirect to sync status screen
          context.push('/sync-status');
        } else if (status.isCompleted) {
          // Check if we have groups locally
          final grupos = ref.read(profesorGruposProvider);
          if (grupos.isEmpty) {
            // Download groups from server
            ref.read(profesorAuthProvider.notifier).refreshGrupos();
          }
        }
      },
    );

    // Check for pending uploads and show notification
    _checkPendingUploads();
  }

  bool _showPendingBanner = false;

  /// Checks for pending uploads and shows/hides the banner accordingly
  void _checkPendingUploads() {
    final asistenciaService = AsistenciaLocalService();
    final hasPending = asistenciaService.hayAsistenciasPendientes();

    if (mounted) {
      setState(() {
        _showPendingBanner = hasPending;
      });
    }
  }

  void _handleScroll() {
    final offset = _scrollController.offset;

    if (offset <= 20) {
      _titleVisibilityTimer?.cancel();
      _titleVisibilityTimer = null;
      if (!_showTitle) {
        setState(() {
          _showTitle = true;
        });
      }
      return;
    }

    if (_showTitle && _titleVisibilityTimer == null) {
      _titleVisibilityTimer = Timer(const Duration(milliseconds: 300), () {
        if (!mounted) return;
        setState(() {
          _showTitle = false;
        });
        _titleVisibilityTimer = null;
      });
    }
  }

  // Parsear horario de inicio (ej: "20:00-21:00" -> 20:00)
  DateTime? _parseHorarioInicio(String horario) {
    try {
      final horarioParts = horario.split('-');
      if (horarioParts.length != 2) return null;

      final inicioParts = horarioParts[0].trim().split(':');
      if (inicioParts.length != 2) return null;

      final now = DateTime.now();
      return DateTime(
        now.year,
        now.month,
        now.day,
        int.parse(inicioParts[0]),
        int.parse(inicioParts[1]),
      );
    } catch (e) {
      return null;
    }
  }

  // Parsear horario fin (ej: "20:00-21:00" -> 21:00)
  DateTime? _parseHorarioFin(String horario) {
    try {
      final horarioParts = horario.split('-');
      if (horarioParts.length != 2) return null;

      final finParts = horarioParts[1].trim().split(':');
      if (finParts.length != 2) return null;

      final now = DateTime.now();
      return DateTime(
        now.year,
        now.month,
        now.day,
        int.parse(finParts[0]),
        int.parse(finParts[1]),
      );
    } catch (e) {
      return null;
    }
  }

  // Parsear cadena de días (ej: 'L-J', 'Ma,J') a lista de weekdays (1=Lunes..7=Domingo)
  List<int> _parseDiasToWeekdays(String dias) {
    final mapping = {'l': 1, 'ma': 2, 'mi': 3, 'j': 4, 'v': 5, 's': 6, 'd': 7};

    final result = <int>{};
    final parts = dias.split(',');
    for (var part in parts) {
      part = part.trim();
      if (part.isEmpty) continue;
      if (part.contains('-')) {
        final range = part.split('-');
        if (range.length != 2) continue;
        final a = range[0].trim().toLowerCase();
        final b = range[1].trim().toLowerCase();
        final start = mapping[a] ?? mapping[a.substring(0, 1)] ?? 1;
        final end = mapping[b] ?? mapping[b.substring(0, 1)] ?? start;
        if (start <= end) {
          for (var d = start; d <= end; d++) result.add(d);
        } else {
          // wrap around week
          for (var d = start; d <= 7; d++) result.add(d);
          for (var d = 1; d <= end; d++) result.add(d);
        }
      } else {
        final key = part.toLowerCase();
        final day = mapping[key] ?? mapping[key.substring(0, 1)];
        if (day != null) result.add(day);
      }
    }
    return result.toList()..sort();
  }

  // Obtener el próximo DateTime de inicio para un conjunto de weekdays y horario
  DateTime _getNextStartForSchedule(
    DateTime now,
    List<int> weekdays,
    int inicioHour,
    int inicioMinute,
    int finHour,
    int finMinute,
  ) {
    // Buscar hasta 14 días por seguridad
    for (var add = 0; add < 14; add++) {
      final candidateDay = now.add(Duration(days: add));
      if (weekdays.contains(candidateDay.weekday)) {
        final candidateStart = DateTime(
          candidateDay.year,
          candidateDay.month,
          candidateDay.day,
          inicioHour,
          inicioMinute,
        );
        final candidateEnd = DateTime(
          candidateDay.year,
          candidateDay.month,
          candidateDay.day,
          finHour,
          finMinute,
        );
        final ventanaFin = candidateEnd.add(const Duration(minutes: 10));

        // Si el inicio está en el futuro, lo retornamos
        if (candidateStart.isAfter(now)) return candidateStart;

        // Si estamos dentro de la ventana (inicio <= now <= ventanaFin), considerar el inicio de hoy
        if (!now.isAfter(ventanaFin)) return candidateStart;
        // Si ya pasó la ventana, continuar buscando la siguiente ocurrencia
      }
    }

    // Fallback: devolver dentro de la próxima semana el primer día coincidente
    for (var add = 1; add <= 7; add++) {
      final candidateDay = now.add(Duration(days: add));
      if (weekdays.contains(candidateDay.weekday)) {
        return DateTime(
          candidateDay.year,
          candidateDay.month,
          candidateDay.day,
          inicioHour,
          inicioMinute,
        );
      }
    }

    // Si no se encuentra, devolver ahora como fallback
    return now;
  }

  // Ordenar grupos por proximidad a la próxima ocurrencia real (considerando días de la semana)
  List<MapEntry<Grupo, int>> _sortGruposByProximity(List<Grupo> grupos) {
    final now = DateTime.now();

    // Crear lista de entradas con grupo y su índice original
    final gruposWithIndex = grupos
        .asMap()
        .entries
        .map((e) => MapEntry(e.value, e.key))
        .toList();

    gruposWithIndex.sort((a, b) {
      final grupoA = a.key;
      final grupoB = b.key;

      // Obtener horarios y días desde el schedule real del grupo
      final horarioA = grupoA.horario ?? '00:00-00:00';
      final horarioB = grupoB.horario ?? '00:00-00:00';
      final weekdaysA = grupoA.weekdaysConClase;
      final weekdaysB = grupoB.weekdaysConClase;

      final inicioA = _parseHorarioInicio(horarioA);
      final finA = _parseHorarioFin(horarioA);
      final inicioB = _parseHorarioInicio(horarioB);
      final finB = _parseHorarioFin(horarioB);

      if (inicioA == null || finA == null || inicioB == null || finB == null) {
        return 0;
      }

      if (weekdaysA.isEmpty || weekdaysB.isEmpty) {
        return 0;
      }

      final nextA = _getNextStartForSchedule(
        now,
        weekdaysA,
        inicioA.hour,
        inicioA.minute,
        finA.hour,
        finA.minute,
      );

      final nextB = _getNextStartForSchedule(
        now,
        weekdaysB,
        inicioB.hour,
        inicioB.minute,
        finB.hour,
        finB.minute,
      );

      final diffA = nextA.difference(now).abs();
      final diffB = nextB.difference(now).abs();

      return diffA.compareTo(diffB);
    });

    // Revertir para que la más próxima esté al final (arriba en el stack)
    return gruposWithIndex.reversed.toList();
  }

  Future<void> _handleRefresh() async {
    HapticFeedback.lightImpact();
    // Refrescar datos desde el servidor
    await ref.read(profesorAuthProvider.notifier).refreshGrupos();
    // Forzar reordenamiento con setState
    if (mounted) setState(() {});
    // Pequeña pausa para animación
    await Future.delayed(const Duration(milliseconds: 300));
  }

  @override
  Widget build(BuildContext context) {
    final grupos = ref.watch(profesorGruposProvider);
    final isLoading = ref.watch(profesorAuthLoadingProvider);

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && grupos.isNotEmpty) {
        TeacherBeaconAttendanceService().startForCurrentClass(grupos);
      }
    });

    // Ordenar grupos por proximidad
    final sortedGruposWithIndex = _sortGruposByProximity(grupos);

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Content sin padding para que ocupe toda la pantalla
          isLoading && sortedGruposWithIndex.isEmpty
              ? _buildLoadingState()
              : sortedGruposWithIndex.isEmpty
              ? _buildEmptyState()
              : RefreshIndicator(
                  onRefresh: _handleRefresh,
                  color: Colors.white,
                  backgroundColor: const Color(0xFF2C2C2E),
                  child: _buildWalletCards(sortedGruposWithIndex, grupos),
                ),
          // Floating title
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            left: 12,
            child: AnimatedOpacity(
              opacity: _showTitle ? 1.0 : 0.0,
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeInOut,
              child: AnimatedSlide(
                offset: _showTitle ? Offset.zero : const Offset(0, -0.5),
                duration: const Duration(milliseconds: 300),
                curve: Curves.easeInOut,
                child: const Text(
                  'Mis Clases',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 34,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.4,
                    shadows: [
                      Shadow(
                        offset: Offset(0, 2),
                        blurRadius: 8,
                        color: Colors.black54,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          // Floating buttons
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            right: 12,
            child: Row(
              children: [
                // Botón de expandir/colapsar
                ClipRRect(
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
                        icon: Icon(
                          _isExpanded ? Icons.unfold_less : Icons.unfold_more,
                          color: Colors.white,
                          size: 20,
                        ),
                        onPressed: () {
                          HapticFeedback.lightImpact();
                          setState(() {
                            _isExpanded = !_isExpanded;
                          });
                        },
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                // Contenedor con tema y 3 puntos (como Wallet)
                ClipRRect(
                  borderRadius: BorderRadius.circular(22),
                  child: BackdropFilter(
                    filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                    child: Container(
                      height: 44,
                      decoration: BoxDecoration(
                        color: const Color(0xFF2C2C2E).withOpacity(0.72),
                        borderRadius: BorderRadius.circular(22),
                        border: Border.all(
                          color: Colors.white.withOpacity(0.1),
                          width: 0.5,
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // Botón de subida de asistencias
                          GestureDetector(
                            onTap: () {
                              HapticFeedback.lightImpact();
                              Navigator.of(context)
                                  .push(
                                    MaterialPageRoute(
                                      builder: (context) =>
                                          const UploadManagementPage(),
                                    ),
                                  )
                                  .then((_) => _checkPendingUploads());
                            },
                            child: Container(
                              width: 44,
                              height: 44,
                              alignment: Alignment.center,
                              color: Colors.transparent,
                              child: const Icon(
                                Icons.upload,
                                color: Colors.white,
                                size: 20,
                              ),
                            ),
                          ),
                          // Botón de más opciones
                          GestureDetector(
                            onTap: () {
                              HapticFeedback.lightImpact();
                              _showOptionsMenu(context);
                            },
                            child: Container(
                              width: 44,
                              height: 44,
                              alignment: Alignment.center,
                              color: Colors.transparent,
                              child: const Icon(
                                Icons.more_horiz,
                                color: Colors.white,
                                size: 20,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          // Pending attendance banner (glassmorphism style)
          if (_showPendingBanner)
            Positioned(
              bottom: MediaQuery.of(context).padding.bottom + 16,
              left: 20,
              right: 20,
              child: AnimatedSlide(
                offset: _showPendingBanner ? Offset.zero : const Offset(0, 2),
                duration: const Duration(milliseconds: 400),
                curve: Curves.easeOutCubic,
                child: AnimatedOpacity(
                  opacity: _showPendingBanner ? 1.0 : 0.0,
                  duration: const Duration(milliseconds: 400),
                  child: GestureDetector(
                    onTap: () {
                      HapticFeedback.lightImpact();
                      setState(() {
                        _showPendingBanner = false;
                      });
                      Navigator.of(context)
                          .push(
                            MaterialPageRoute(
                              builder: (context) =>
                                  const UploadManagementPage(),
                            ),
                          )
                          .then((_) => _checkPendingUploads());
                    },
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: BackdropFilter(
                        filter: ImageFilter.blur(sigmaX: 30, sigmaY: 30),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 14,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0xFF1C1C1E).withOpacity(0.78),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                              color: Colors.white.withOpacity(0.12),
                              width: 0.5,
                            ),
                          ),
                          child: Row(
                            children: [
                              // Pulsing indicator dot
                              AnimatedBuilder(
                                animation: _pulseController,
                                builder: (context, child) {
                                  return Container(
                                    width: 10,
                                    height: 10,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: Color.lerp(
                                        const Color(0xFFFF9500),
                                        const Color(0xFFFFCC00),
                                        _pulseController.value,
                                      ),
                                      boxShadow: [
                                        BoxShadow(
                                          color: const Color(0xFFFF9500)
                                              .withOpacity(
                                                0.4 +
                                                    (_pulseController.value *
                                                        0.3),
                                              ),
                                          blurRadius: 6,
                                          spreadRadius: 1,
                                        ),
                                      ],
                                    ),
                                  );
                                },
                              ),
                              const SizedBox(width: 12),
                              // Cloud icon
                              Icon(
                                Icons.cloud_upload_outlined,
                                color: Colors.white.withOpacity(0.9),
                                size: 20,
                              ),
                              const SizedBox(width: 10),
                              // Text
                              Expanded(
                                child: Text(
                                  'Asistencias pendientes por subir',
                                  style: TextStyle(
                                    color: Colors.white.withOpacity(0.92),
                                    fontSize: 14,
                                    fontWeight: FontWeight.w500,
                                    letterSpacing: -0.2,
                                  ),
                                ),
                              ),
                              // Chevron
                              Icon(
                                Icons.chevron_right_rounded,
                                color: Colors.white.withOpacity(0.5),
                                size: 22,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  List<Color> _gradientForCard(int index) =>
      _cardGradients[index % _cardGradients.length];

  Color _accentForCard(int index) =>
      _cardAccentColors[index % _cardAccentColors.length];

  Widget _buildLoadingState() {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircularProgressIndicator(color: Colors.white),
          SizedBox(height: 16),
          Text('Cargando grupos...', style: TextStyle(color: Colors.white70)),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 120,
              height: 120,
              decoration: BoxDecoration(
                color: Colors.grey.shade900,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.school_outlined,
                size: 64,
                color: Colors.grey,
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              'No tienes clases asignadas',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            Text(
              'Si iniciaste sincronización, revisa el progreso abajo.',
              style: TextStyle(fontSize: 16, color: Colors.grey.shade400),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            // Botón revisar sincronización
            TextButton.icon(
              onPressed: () {
                HapticFeedback.lightImpact();
                context.push('/sync-status');
              },
              icon: const Icon(Icons.cloud_sync, color: Colors.blueAccent),
              label: const Text(
                'Revisar sincronización',
                style: TextStyle(
                  color: Colors.blueAccent,
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 14,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildWalletCards(
    List<MapEntry<Grupo, int>> gruposWithIndex,
    List<Grupo> todosLosGrupos,
  ) {
    // Altura visible de cada tarjeta empalmada (como en Wallet)
    final cardPeekHeight = _isExpanded
        ? 180.0 // Modo expandido: mostrar hasta los valores de grupo y cantidad de estudiantes
        : 60.0; // Modo normal: suficiente para mostrar horario y días
    const cardHeight = 200.0;

    // Calcular altura total del contenido
    // Si hay una tarjeta seleccionada, agregar espacio extra para el desplazamiento
    final baseHeight =
        cardHeight + (gruposWithIndex.length - 1) * cardPeekHeight;
    final extraHeight = _selectedCardIndex != null
        ? (cardHeight - cardPeekHeight)
        : 0.0;
    final totalHeight = baseHeight + extraHeight;

    return SingleChildScrollView(
      controller: _scrollController,
      physics: const AlwaysScrollableScrollPhysics(
        parent: BouncingScrollPhysics(),
      ),
      child: Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: MediaQuery.of(context).padding.top + 81,
          bottom: MediaQuery.of(context).padding.bottom + 200,
        ),
        child: Column(
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 350),
              curve: Curves.fastOutSlowIn,
              height: totalHeight,
              child: Stack(
                clipBehavior: Clip.none,
                children: gruposWithIndex.asMap().entries.map((entry) {
                  final stackIndex = entry.key; // Posición en el stack
                  final grupoEntry = entry.value;
                  final grupo = grupoEntry.key;
                  final originalIndex =
                      grupoEntry.value; // Índice original para horarios
                  // La última tarjeta (la que está al frente) es la clase actual
                  final isCurrentClass =
                      stackIndex == gruposWithIndex.length - 1;

                  // Calcular posición: si hay una tarjeta seleccionada y esta está debajo,
                  // desplazarla hacia abajo
                  double topPosition = stackIndex * cardPeekHeight;
                  if (_selectedCardIndex != null &&
                      stackIndex > _selectedCardIndex!) {
                    // Desplazar tarjetas debajo hacia abajo (altura completa de la tarjeta)
                    topPosition += 200.0 - cardPeekHeight;
                  }

                  return AnimatedPositioned(
                    duration: const Duration(milliseconds: 350),
                    curve: Curves.fastOutSlowIn,
                    top: topPosition,
                    left: 0,
                    right: 0,
                    child: IgnorePointer(
                      ignoring: false,
                      child: _buildWalletCard(
                        grupo,
                        stackIndex,
                        originalIndex,
                        isCurrentClass,
                        todosLosGrupos,
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
            // Indicador sutil de próxima clase por atender
            const SizedBox(height: 12),
            Column(
              children: [
                Icon(
                  Icons.arrow_upward_rounded,
                  size: 16,
                  color: Colors.grey.shade600,
                ),
                const SizedBox(height: 4),
                Text(
                  'Próxima por atender',
                  style: TextStyle(
                    color: Colors.grey.shade600,
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildWalletCard(
    Grupo grupo,
    int stackIndex,
    int originalIndex,
    bool isCurrentClass,
    List<Grupo> todosLosGrupos,
  ) {
    // Obtiene los colores desde la configuración compartida para mantener coherencia visual
    final gradientColors = _gradientForCard(originalIndex);
    final accentColor = _accentForCard(originalIndex);

    return Container(
      height: 200,
      margin: _isExpanded
          ? const EdgeInsets.only(bottom: 5.0)
          : EdgeInsets.zero,
      child: TweenAnimationBuilder<double>(
        duration: Duration(milliseconds: 300 + (stackIndex * 100)),
        curve: Curves.easeOut,
        tween: Tween(begin: 0.0, end: 1.0),
        builder: (context, value, child) {
          // Clamp value to ensure it stays within valid range
          final clampedValue = value.clamp(0.0, 1.0);
          return Transform.scale(
            scale: 0.8 + (clampedValue * 0.2),
            child: Opacity(opacity: clampedValue, child: child),
          );
        },
        child: Stack(
          children: [
            // Tarjeta principal
            RepaintBoundary(
              child: Hero(
                tag: 'grupo_${grupo.group}_${grupo.subject}',
                flightShuttleBuilder:
                    (
                      BuildContext flightContext,
                      Animation<double> animation,
                      HeroFlightDirection flightDirection,
                      BuildContext fromHeroContext,
                      BuildContext toHeroContext,
                    ) {
                      return Material(
                        color: Colors.transparent,
                        elevation: 0,
                        child: toHeroContext.widget,
                      );
                    },
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    onTap: () async {
                      HapticFeedback.lightImpact();

                      // Establecer la tarjeta seleccionada y animar las demás hacia abajo
                      setState(() {
                        _selectedCardIndex = stackIndex;
                      });

                      // Esperar a que se complete la animación de desplazamiento
                      await Future.delayed(const Duration(milliseconds: 300));

                      // Navegar a la página de detalles
                      await Navigator.of(context).push(
                        PageRouteBuilder(
                          pageBuilder:
                              (context, animation, secondaryAnimation) =>
                                  GrupoDetailPage(
                                    grupo: grupo,
                                    gradientColors: gradientColors,
                                    accentColor: accentColor,
                                    horario: grupo.horario ?? '00:00-00:00',
                                    dias: grupo.diasClase ?? 'N/A',
                                    todosLosGrupos: todosLosGrupos,
                                  ),
                          transitionDuration: const Duration(milliseconds: 400),
                          reverseTransitionDuration: const Duration(
                            milliseconds: 350,
                          ),
                          transitionsBuilder:
                              (context, animation, secondaryAnimation, child) {
                                // Curva estilo iOS - suave y natural
                                final curvedAnimation = CurvedAnimation(
                                  parent: animation,
                                  curve: Curves.easeOut,
                                  reverseCurve: Curves.easeIn,
                                );
                                return FadeTransition(
                                  opacity: curvedAnimation,
                                  child: child,
                                );
                              },
                        ),
                      );

                      // IMPORTANTE: Esperar a que el Hero termine de regresar
                      // antes de restaurar las tarjetas de abajo
                      await Future.delayed(const Duration(milliseconds: 350));

                      // Al regresar, limpiar la selección para que las tarjetas vuelvan
                      if (mounted) {
                        setState(() {
                          _selectedCardIndex = null;
                        });
                      }
                    },
                    borderRadius: BorderRadius.circular(16),
                    child: Container(
                      constraints: const BoxConstraints(minHeight: 200),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: gradientColors,
                        ),
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: [
                          BoxShadow(
                            color: gradientColors[0].withOpacity(
                              isCurrentClass ? 0.3 : 0.2,
                            ),
                            blurRadius: isCurrentClass ? 20 : 15,
                            offset: const Offset(0, 6),
                          ),
                        ],
                      ),
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // Header con badge del grupo y hora
                          Stack(
                            clipBehavior: Clip.none,
                            children: [
                              Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 12,
                                      vertical: 6,
                                    ),
                                    decoration: BoxDecoration(
                                      color: accentColor.withOpacity(0.2),
                                      borderRadius: BorderRadius.circular(8),
                                      border: Border.all(
                                        color: accentColor.withOpacity(0.3),
                                      ),
                                    ),
                                    child: Text(
                                      grupo.aula,
                                      style: TextStyle(
                                        color: accentColor,
                                        fontSize: 12,
                                        fontWeight: FontWeight.bold,
                                        letterSpacing: 1.2,
                                      ),
                                    ),
                                  ),
                                  // Horario real desde el schedule
                                  Text(
                                    grupo.horario ?? 'Sin horario',
                                    style: TextStyle(
                                      color: accentColor.withOpacity(0.8),
                                      fontSize: 14,
                                      fontWeight: FontWeight.w600,
                                      letterSpacing: 0.5,
                                    ),
                                  ),
                                ],
                              ),
                              // Días flotando abajo a la derecha
                              Positioned(
                                right: 0,
                                top: 22,
                                child: Text(
                                  grupo.diasClase ?? 'N/A',
                                  style: TextStyle(
                                    color: accentColor.withOpacity(0.6),
                                    fontSize: 10,
                                    fontWeight: FontWeight.w500,
                                    letterSpacing: 0.5,
                                  ),
                                ),
                              ),
                            ],
                          ),

                          const SizedBox(height: 12),

                          // Nombre de la materia con altura mínima fija para consistencia
                          SizedBox(
                            height: 56, // Espacio para 2 líneas
                            child: Align(
                              alignment: Alignment.centerLeft,
                              child: Text(
                                grupo.materia
                                    .replaceAll(RegExp(r'\([^)]*\)\s*'), '')
                                    .trim(),
                                style: TextStyle(
                                  color: accentColor,
                                  fontSize: 20,
                                  fontWeight: FontWeight.bold,
                                  letterSpacing: 0.5,
                                  height: 1.2,
                                ),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ),

                          const SizedBox(height: 16),

                          // Info del grupo - posición fija
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'GRUPO',
                                    style: TextStyle(
                                      color: accentColor.withOpacity(0.7),
                                      fontSize: 10,
                                      fontWeight: FontWeight.w600,
                                      letterSpacing: 1,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    grupo.grupoLetra,
                                    style: TextStyle(
                                      color: accentColor,
                                      fontSize: 16,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(
                                    'ESTUDIANTES',
                                    style: TextStyle(
                                      color: accentColor.withOpacity(0.7),
                                      fontSize: 10,
                                      fontWeight: FontWeight.w600,
                                      letterSpacing: 1,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Row(
                                    children: [
                                      Icon(
                                        Icons.people_rounded,
                                        color: accentColor,
                                        size: 16,
                                      ),
                                      const SizedBox(width: 4),
                                      Text(
                                        '${grupo.totalAlumnos}',
                                        style: TextStyle(
                                          color: accentColor,
                                          fontSize: 16,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ],
                      ),
                    ), // Cierre Container
                  ), // Cierre InkWell
                ), // Cierre Material
              ), // Cierre Hero
            ), // Cierre RepaintBoundary
          ],
        ), // Cierre Stack
      ), // Cierre TweenAnimationBuilder
    ); // Cierre SizedBox
  }

  void _showSyncDialog(BuildContext context) {
    // Block sync if there are pending attendance uploads
    final asistenciaService = AsistenciaLocalService();
    if (asistenciaService.hayAsistenciasPendientes()) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text(
            'Sube las asistencias pendientes antes de sincronizar ciclo.',
          ),
          backgroundColor: Colors.orange.shade700,
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 4),
        ),
      );
      return;
    }

    bool isLoading = false;

    // Check if we have a stored password
    final authStorage = AuthStorageService();
    final storedPassword = authStorage.getEncryptedPassword();

    if (storedPassword == null) {
      // No stored password - show password dialog as fallback
      _showSyncDialogWithPassword(context);
      return;
    }

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            backgroundColor: Colors.grey.shade900,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
            ),
            title: const Row(
              children: [
                Icon(Icons.sync_rounded, color: Colors.blueAccent),
                SizedBox(width: 12),
                Text(
                  'Sincronizar Ciclo',
                  style: TextStyle(color: Colors.white),
                ),
              ],
            ),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Se descargarán tus clases actualizadas del portal UAT.',
                    style: TextStyle(fontSize: 14, color: Colors.white70),
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.orange.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.orange.withOpacity(0.3)),
                    ),
                    child: const Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.warning_amber_rounded,
                          color: Colors.orange,
                          size: 20,
                        ),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Las asistencias no subidas y los datos locales serán reemplazados con la información actualizada del portal.',
                            style: TextStyle(
                              fontSize: 13,
                              color: Colors.orange,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (isLoading) ...[
                    const SizedBox(height: 20),
                    const CircularProgressIndicator(color: Colors.blueAccent),
                    const SizedBox(height: 8),
                    const Text(
                      'Solicitando sincronización...',
                      style: TextStyle(color: Colors.white70, fontSize: 12),
                    ),
                  ],
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: isLoading ? null : () => Navigator.of(context).pop(),
                child: const Text(
                  'Cancelar',
                  style: TextStyle(color: Colors.white70),
                ),
              ),
              FilledButton(
                onPressed: isLoading
                    ? null
                    : () async {
                        setState(() => isLoading = true);

                        final result = await ref
                            .read(profesorAuthProvider.notifier)
                            .syncGroups(storedPassword);

                        if (context.mounted) {
                          Navigator.of(context).pop();

                          result.fold(
                            (error) =>
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text(error),
                                    backgroundColor: Colors.red,
                                    behavior: SnackBarBehavior.floating,
                                  ),
                                ),
                            (message) {
                              // Navegar a pantalla de estado de sincronización
                              context.push('/sync-status');
                            },
                          );
                        }
                      },
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.blueAccent,
                  foregroundColor: Colors.white,
                ),
                child: const Text('Sincronizar'),
              ),
            ],
          );
        },
      ),
    );
  }

  /// Fallback dialog when no stored password is available
  void _showSyncDialogWithPassword(BuildContext context) {
    final passwordController = TextEditingController();
    final formKey = GlobalKey<FormState>();
    bool obscureText = true;
    bool isLoading = false;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            backgroundColor: Colors.grey.shade900,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
            ),
            title: const Row(
              children: [
                Icon(Icons.sync_rounded, color: Colors.blueAccent),
                SizedBox(width: 12),
                Text(
                  'Sincronizar Ciclo',
                  style: TextStyle(color: Colors.white),
                ),
              ],
            ),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Ingresa tu contraseña de la UAT para descargar tus clases actualizadas.',
                    style: TextStyle(fontSize: 14, color: Colors.white70),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.orange.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.orange.withOpacity(0.3)),
                    ),
                    child: const Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.warning_amber_rounded,
                          color: Colors.orange,
                          size: 20,
                        ),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Las asistencias no subidas y los datos locales serán reemplazados con la información actualizada del portal.',
                            style: TextStyle(
                              fontSize: 13,
                              color: Colors.orange,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Form(
                    key: formKey,
                    child: TextFormField(
                      controller: passwordController,
                      obscureText: obscureText,
                      style: const TextStyle(color: Colors.black),
                      decoration: InputDecoration(
                        hintText: 'Contraseña UAT',
                        hintStyle: TextStyle(color: Colors.grey.shade600),
                        filled: true,
                        fillColor: Colors.white,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(color: Colors.grey.shade300),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(
                            color: Colors.blueAccent,
                            width: 2,
                          ),
                        ),
                        suffixIcon: IconButton(
                          icon: Icon(
                            obscureText
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined,
                            color: Colors.grey,
                          ),
                          onPressed: () {
                            setState(() => obscureText = !obscureText);
                          },
                        ),
                      ),
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Ingresa tu contraseña';
                        }
                        return null;
                      },
                    ),
                  ),
                  if (isLoading) ...[
                    const SizedBox(height: 20),
                    const CircularProgressIndicator(color: Colors.blueAccent),
                    const SizedBox(height: 8),
                    const Text(
                      'Solicitando sincronización...',
                      style: TextStyle(color: Colors.white70, fontSize: 12),
                    ),
                  ],
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: isLoading ? null : () => Navigator.of(context).pop(),
                child: const Text(
                  'Cancelar',
                  style: TextStyle(color: Colors.white70),
                ),
              ),
              FilledButton(
                onPressed: isLoading
                    ? null
                    : () async {
                        FocusScope.of(context).unfocus();
                        if (formKey.currentState!.validate()) {
                          setState(() => isLoading = true);

                          final result = await ref
                              .read(profesorAuthProvider.notifier)
                              .syncGroups(passwordController.text);

                          if (context.mounted) {
                            Navigator.of(context).pop();

                            result.fold(
                              (error) =>
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text(error),
                                      backgroundColor: Colors.red,
                                      behavior: SnackBarBehavior.floating,
                                    ),
                                  ),
                              (message) {
                                context.push('/sync-status');
                              },
                            );
                          }
                        }
                      },
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.blueAccent,
                  foregroundColor: Colors.white,
                ),
                child: const Text('Sincronizar'),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showOptionsMenu(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.grey.shade900,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        final profesor = ref.read(currentProfesorProvider);
        return Container(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Avatar y nombre
              Row(
                children: [
                  CircleAvatar(
                    radius: 24,
                    backgroundColor: UATColors.primary,
                    child: Text(
                      profesor?.email[0].toUpperCase() ?? 'P',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          profesor?.name ?? 'Profesor',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Text(
                          profesor?.email ?? '',
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

              const SizedBox(height: 24),
              const Divider(color: Colors.grey),
              const SizedBox(height: 8),

              // Opciones
              ListTile(
                leading: const Icon(
                  Icons.sync_rounded,
                  color: Colors.blueAccent,
                ),
                title: const Text(
                  'Sincronizar Ciclo',
                  style: TextStyle(color: Colors.white),
                ),
                subtitle: Text(
                  'Descargar clases actualizadas del portal',
                  style: TextStyle(color: Colors.grey.shade400, fontSize: 12),
                ),
                onTap: () {
                  Navigator.pop(context);
                  _showSyncDialog(context);
                },
              ),
              ListTile(
                leading: const Icon(Icons.delete_sweep, color: Colors.orange),
                title: const Text(
                  'Borrar Caché de Asistencias',
                  style: TextStyle(color: Colors.white),
                ),
                subtitle: Text(
                  'Eliminar asistencias guardadas localmente',
                  style: TextStyle(color: Colors.grey.shade400, fontSize: 12),
                ),
                onTap: () {
                  Navigator.pop(context);
                  _showClearCacheDialog(context);
                },
              ),
              if (kDebugMode)
                ListTile(
                  leading: const Icon(
                    Icons.bug_report,
                    color: Colors.greenAccent,
                  ),
                  title: const Text(
                    'Imprimir Salones',
                    style: TextStyle(color: Colors.greenAccent),
                  ),
                  subtitle: Text(
                    'Debug: ver configuración de aulas en consola',
                    style: TextStyle(color: Colors.grey.shade400, fontSize: 12),
                  ),
                  onTap: () {
                    Navigator.pop(context);
                    final beacons = AuthStorageService().getBeacons();
                    if (beacons == null || beacons.isEmpty) {
                      debugPrint('⚠️ No hay configuración de aulas almacenada');
                    } else {
                      debugPrint(
                        '🏫 Configuración de aulas (${beacons.length}):',
                      );
                      for (final b in beacons) {
                        debugPrint(
                          '  Salón: ${b['classroom']} → UUID: ${b['uuid']}',
                        );
                      }
                    }
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(
                          beacons == null || beacons.isEmpty
                              ? 'Sin configuración de aulas'
                              : '${beacons.length} aulas impresas en consola',
                        ),
                        duration: const Duration(seconds: 2),
                      ),
                    );

                    // Iniciar escaneo AltBeacon después de 2 segundos
                    if (beacons != null && beacons.isNotEmpty) {
                      Future.delayed(const Duration(seconds: 2), () async {
                        final altBeacon = NativeAltBeaconChannel();

                        // Request runtime permissions before scanning
                        final permGranted =
                            await PermissionService.requestBluetoothPermissions();
                        debugPrint(
                          '[ALTBEACON-TEST] Permisos: ${permGranted ? "OK" : "DENEGADOS"}',
                        );
                        if (!permGranted) {
                          debugPrint(
                            '[ALTBEACON-TEST] No se puede escanear sin permisos',
                          );
                          return;
                        }

                        debugPrint(
                          '══════════════════════════════════════════════',
                        );
                        debugPrint('[ALTBEACON-TEST] UUIDs en DB:');
                        for (final b in beacons) {
                          debugPrint(
                            '[ALTBEACON-TEST]   ${b['classroom']} → ${b['uuid']}',
                          );
                        }
                        debugPrint(
                          '══════════════════════════════════════════════',
                        );

                        debugPrint('[ALTBEACON-TEST] Buscando por UUID...');
                        final results = <String, bool>{};
                        for (final b in beacons) {
                          final uuid = b['uuid'] as String?;
                          final salon = b['classroom'] as String?;
                          if (uuid == null || uuid.isEmpty) continue;

                          debugPrint(
                            '──────────────────────────────────────────────',
                          );
                          debugPrint(
                            '[ALTBEACON-TEST] Buscando UUID: $uuid (Salón: $salon)',
                          );

                          bool found = false;
                          final rangingSub = altBeacon.detectionsStream.listen((
                            detections,
                          ) {
                            if (detections.isEmpty) return;
                            found = true;
                            for (final detection in detections) {
                              debugPrint(
                                '[ALTBEACON-TEST] DETECTADO: '
                                '${detection.uuid} | RSSI: ${detection.rssi} '
                                '| distancia: ${detection.distance}',
                              );
                            }
                          });
                          final started = await altBeacon.startScanning(
                            uuids: [uuid],
                          );
                          debugPrint(
                            '[ALTBEACON-TEST] startScanning → $started',
                          );
                          await Future.delayed(const Duration(seconds: 5));
                          await altBeacon.stopScanning();
                          await rangingSub.cancel();
                          results[salon ?? uuid] = found;
                          if (!found) {
                            debugPrint(
                              '[ALTBEACON-TEST] NO detectado: $salon ($uuid)',
                            );
                          }
                          await Future.delayed(
                            const Duration(milliseconds: 500),
                          );
                        }

                        debugPrint(
                          '══════════════════════════════════════════════',
                        );
                        debugPrint('[ALTBEACON-TEST] RESUMEN POR UUID:');
                        for (final entry in results.entries) {
                          final label = entry.value
                              ? 'DETECTADO'
                              : 'NO detectado';
                          debugPrint('[ALTBEACON-TEST]   $label ${entry.key}');
                        }
                        debugPrint(
                          '══════════════════════════════════════════════',
                        );
                      });
                    }
                  },
                ),
              ListTile(
                leading: const Icon(Icons.logout, color: Colors.red),
                title: const Text(
                  'Cerrar Sesión',
                  style: TextStyle(color: Colors.red),
                ),
                onTap: () {
                  Navigator.pop(context);
                  _showLogoutDialog(context);
                },
              ),

              SizedBox(height: MediaQuery.of(context).padding.bottom),
            ],
          ),
        );
      },
    );
  }

  void _showLogoutDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: Colors.grey.shade900,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Row(
          children: [
            Icon(Icons.logout_rounded, color: Colors.red),
            SizedBox(width: 12),
            Text('Cerrar Sesión', style: TextStyle(color: Colors.white)),
          ],
        ),
        content: const Text(
          '¿Estás seguro de que quieres cerrar sesión?',
          style: TextStyle(fontSize: 16, color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text(
              'Cancelar',
              style: TextStyle(color: Colors.white70),
            ),
          ),
          FilledButton(
            onPressed: () async {
              Navigator.of(context).pop();
              await ref.read(profesorAuthProvider.notifier).logout();
            },
            style: FilledButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            child: const Text('Cerrar Sesión'),
          ),
        ],
      ),
    );
  }

  void _showClearCacheDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: Colors.grey.shade900,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Row(
          children: [
            Icon(Icons.delete_sweep, color: Colors.orange),
            SizedBox(width: 12),
            Text('Borrar Caché', style: TextStyle(color: Colors.white)),
          ],
        ),
        content: const Text(
          '¿Estás seguro de que quieres eliminar todas las asistencias guardadas localmente?\n\nEsto solo afecta las asistencias no sincronizadas.',
          style: TextStyle(fontSize: 16, color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text(
              'Cancelar',
              style: TextStyle(color: Colors.white70),
            ),
          ),
          FilledButton(
            onPressed: () async {
              Navigator.of(context).pop();
              await _clearAsistenciasCache();
            },
            style: FilledButton.styleFrom(
              backgroundColor: Colors.orange,
              foregroundColor: Colors.white,
            ),
            child: const Text('Borrar Caché'),
          ),
        ],
      ),
    );
  }

  Future<void> _clearAsistenciasCache() async {
    try {
      final asistenciaService = AsistenciaLocalService();
      await asistenciaService.limpiarTodo();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Caché de asistencias eliminado correctamente'),
            backgroundColor: Colors.green,
            behavior: SnackBarBehavior.floating,
            duration: Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error al limpiar caché: $e'),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 3),
          ),
        );
      }
    }
  }
}
