import 'dart:ui';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../shared/models/grupo.dart';
import '../../../shared/models/alumno.dart';
import '../../../shared/models/asistencia_registro.dart';
import '../../../services/asistencia_local_service.dart';
import '../../../services/api_service.dart';
import '../../../services/ble_beacon_verification_service.dart';
import '../../../services/student_attendance_ble_service.dart';
import '../../../core/theme/uat_colors.dart';
import '../../../core/permissions/permission_service.dart';
import '../../../core/utils/utils.dart';

import '../../../services/auth_storage_service.dart';

class GrupoDetailPage extends StatefulWidget {
  final Grupo grupo;
  final List<Color> gradientColors;
  final Color accentColor;
  final String horario;
  final String dias;
  final List<Grupo>? todosLosGrupos;

  /// Fecha inicial para mostrar (si viene de "Mostrar en pantalla")
  final DateTime? initialDate;

  /// Si true, muestra un efecto neón parpadeante en el botón de fecha
  final bool highlightDateSelector;

  /// Color del efecto neón (normalmente el color del gradiente de la materia)
  final Color? highlightColor;

  const GrupoDetailPage({
    super.key,
    required this.grupo,
    required this.gradientColors,
    required this.accentColor,
    required this.horario,
    required this.dias,
    this.todosLosGrupos,
    this.initialDate,
    this.highlightDateSelector = false,
    this.highlightColor,
  });

  @override
  State<GrupoDetailPage> createState() => _GrupoDetailPageState();
}

class _GrupoDetailPageState extends State<GrupoDetailPage>
    with TickerProviderStateMixin, WidgetsBindingObserver {
  // Mapa para controlar el estado de asistencia de cada estudiante
  final Map<String, bool> _asistencias = {};
  final AuthStorageService _authStorage = AuthStorageService();
  late AnimationController _buttonAnimationController;
  late AnimationController _studentsAnimationController;
  late Animation<double> _studentsOpacity;
  late Animation<Offset> _studentsSlide;
  // Control del tab seleccionado (0 = Mi asistencia, 1 = Alumnos)
  int _selectedTab = 0;
  DateTime? _entradaProfesor;
  DateTime? _salidaProfesor;
  DateTime _selectedDateTime = DateTime.now();

  // Controlador para el efecto neón parpadeante en el botón de fecha
  AnimationController? _neonAnimationController;
  Animation<double>? _neonAnimation;

  // Estado de verificación BLE
  bool _entradaVerificada = true;
  String? _motivoEntrada;

  // Servicio de almacenamiento local
  final AsistenciaLocalService _asistenciaService = AsistenciaLocalService();
  final ApiService _apiService = ApiService();

  // Servicio de verificación BLE beacon
  final BleBeaconVerificationService _bleBeaconService =
      BleBeaconVerificationService();
  final StudentAttendanceBleService _studentBeaconService =
      StudentAttendanceBleService();
  StreamSubscription<List<StudentAttendanceDetection>>?
  _studentBeaconSubscription;
  bool _isStudentBeaconScanning = false;
  bool _isLoadingStudentBeaconBindings = false;
  Map<String, String> _studentKeyByBeaconUuid = {};
  List<String> _studentBeaconScanUuids = [];
  final Set<String> _detectedStudentBeaconUuids = {};

  // Timer para actualizar la hora
  Timer? _timer;

  // Para detectar pull-to-dismiss
  final ScrollController _scrollController = ScrollController();

  // Control del botón flotante para volver arriba
  bool _showScrollToTopButton = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Configurar status bar transparente
    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(statusBarColor: Colors.transparent),
    );

    // Si se recibió una fecha inicial, usarla
    if (widget.initialDate != null) {
      _selectedDateTime = DateTime(
        widget.initialDate!.year,
        widget.initialDate!.month,
        widget.initialDate!.day,
        DateTime.now().hour,
        DateTime.now().minute,
      );
    }

    // Cargar asistencia existente
    _cargarAsistencia();

    // Efecto neón parpadeante si se solicitó
    if (widget.highlightDateSelector) {
      _neonAnimationController = AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 600),
      );
      _neonAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
        CurvedAnimation(
          parent: _neonAnimationController!,
          curve: Curves.easeInOut,
        ),
      );
      // Iniciar después de que termine la animación Hero
      Future.delayed(const Duration(milliseconds: 500), () {
        if (mounted && _neonAnimationController != null) {
          _neonAnimationController!.repeat(reverse: true);
          // Auto-detener después de ~3.5 segundos
          Future.delayed(const Duration(milliseconds: 3500), () {
            if (mounted && _neonAnimationController != null) {
              _neonAnimationController!.forward().then((_) {
                if (mounted) {
                  _neonAnimationController!.stop();
                  _neonAnimationController!.dispose();
                  _neonAnimationController = null;
                  setState(() {});
                }
              });
            }
          });
        }
      });
    }

    // Listener para detectar scroll y mostrar/ocultar botón flotante
    _scrollController.addListener(_scrollListener);

    // Timer para actualizar la hora cada minuto
    _timer = Timer.periodic(const Duration(minutes: 1), (timer) {
      if (mounted) {
        setState(() {
          // Esto forzará la actualización del widget con la nueva hora
        });
      }
    });

    _buttonAnimationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 400),
    );

    // Animación para estudiantes con delay
    _studentsAnimationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );

    _studentsOpacity = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _studentsAnimationController,
        curve: Curves.easeOut,
      ),
    );

    _studentsSlide =
        Tween<Offset>(begin: const Offset(0, 0.03), end: Offset.zero).animate(
          CurvedAnimation(
            parent: _studentsAnimationController,
            curve: Curves.easeOutCubic,
          ),
        );

    // Se eliminó la inicialización de _buttonAnimation porque no se usa
    // Esperar a que termine la animación del Hero
    Future.delayed(const Duration(milliseconds: 350), () {
      if (mounted) {
        _buttonAnimationController.forward();
      }
    });

    // Delay de 400ms antes de animar estudiantes
    Future.delayed(const Duration(milliseconds: 400), () {
      if (mounted) {
        _studentsAnimationController.forward();
      }
    });
  }

  void _scrollListener() {
    if (_scrollController.hasClients) {
      // Mostrar botón si scrolleamos más de 200 píxeles
      final shouldShow = _scrollController.offset > 200;
      if (shouldShow != _showScrollToTopButton) {
        setState(() {
          _showScrollToTopButton = shouldShow;
        });
      }
    }
  }

  void _scrollToTop() {
    HapticFeedback.mediumImpact();
    _scrollController.animateTo(
      0,
      duration: const Duration(milliseconds: 500),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    _scrollController.removeListener(_scrollListener);
    _buttonAnimationController.dispose();
    _studentsAnimationController.dispose();
    _neonAnimationController?.dispose();
    _scrollController.dispose();
    _bleBeaconService.dispose();
    _studentBeaconSubscription?.cancel();
    _studentBeaconService.stopScanning();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) {
      _bleBeaconService.cancelScan();
      _stopStudentBeaconScan();
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.uatPalette;

    return Scaffold(
      backgroundColor: palette.appBackground,
      body: NotificationListener<ScrollNotification>(
        onNotification: (ScrollNotification notification) {
          if (notification is ScrollUpdateNotification) {
            // Verificar si estamos en el top
            final isAtTop = notification.metrics.pixels <= 0;

            if (isAtTop && notification.metrics.pixels < 0) {
              // Hay overscroll negativo (estamos jalando hacia abajo desde el top)
              final distance = notification.metrics.pixels.abs();

              // Si supera el threshold, cerrar
              if (distance > 100) {
                HapticFeedback.mediumImpact();
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (mounted && Navigator.of(context).canPop()) {
                    Navigator.of(context).pop();
                  }
                });
                return true; // Consumir la notificación
              }
            }
          }
          return false;
        },
        child: Stack(
          children: [
            CustomScrollView(
              controller: _scrollController,
              // AlwaysScrollableScrollPhysics asegura que siempre se pueda hacer scroll
              // incluso cuando el contenido es pequeño, permitiendo el pull-to-dismiss
              physics: const AlwaysScrollableScrollPhysics(
                parent: BouncingScrollPhysics(),
              ),
              slivers: [
                SliverPadding(
                  padding: EdgeInsets.only(
                    top: MediaQuery.of(context).padding.top + 60,
                  ),
                ),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12.0,
                      vertical: 16.0,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Hero Card
                        RepaintBoundary(
                          child: Hero(
                            tag:
                                'grupo_${widget.grupo.group}_${widget.grupo.subject}',
                            child: Material(
                              color: Colors.transparent,
                              child: Container(
                                constraints: const BoxConstraints(
                                  minHeight: 200,
                                ),
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    begin: Alignment.topLeft,
                                    end: Alignment.bottomRight,
                                    colors: widget.gradientColors,
                                  ),
                                  borderRadius: BorderRadius.circular(16),
                                  boxShadow: [
                                    BoxShadow(
                                      color: widget.gradientColors[0]
                                          .withOpacity(0.3),
                                      blurRadius: 20,
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
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                    horizontal: 12,
                                                    vertical: 6,
                                                  ),
                                              decoration: BoxDecoration(
                                                color: widget.accentColor
                                                    .withOpacity(0.2),
                                                borderRadius:
                                                    BorderRadius.circular(8),
                                                border: Border.all(
                                                  color: widget.accentColor
                                                      .withOpacity(0.3),
                                                ),
                                              ),
                                              child: Text(
                                                widget.grupo.aula,
                                                style: TextStyle(
                                                  color: widget.accentColor,
                                                  fontSize: 12,
                                                  fontWeight: FontWeight.bold,
                                                  letterSpacing: 1.2,
                                                ),
                                              ),
                                            ),
                                            Text(
                                              widget.horario,
                                              style: TextStyle(
                                                color: widget.accentColor
                                                    .withOpacity(0.8),
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
                                            widget.dias,
                                            style: TextStyle(
                                              color: widget.accentColor
                                                  .withOpacity(0.6),
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
                                          widget.grupo.materia
                                              .replaceAll(
                                                RegExp(r'\([^)]*\)\s*'),
                                                '',
                                              )
                                              .trim(),
                                          style: TextStyle(
                                            color: widget.accentColor,
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
                                    // Info adicional - posición fija
                                    Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.spaceBetween,
                                      children: [
                                        Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              'GRUPO',
                                              style: TextStyle(
                                                color: widget.accentColor
                                                    .withOpacity(0.7),
                                                fontSize: 10,
                                                fontWeight: FontWeight.w600,
                                                letterSpacing: 1,
                                              ),
                                            ),
                                            const SizedBox(height: 2),
                                            Text(
                                              widget.grupo.grupoLetra,
                                              style: TextStyle(
                                                color: widget.accentColor,
                                                fontSize: 16,
                                                fontWeight: FontWeight.w600,
                                              ),
                                            ),
                                          ],
                                        ),
                                        Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.end,
                                          children: [
                                            Text(
                                              'ESTUDIANTES',
                                              style: TextStyle(
                                                color: widget.accentColor
                                                    .withOpacity(0.7),
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
                                                  color: widget.accentColor,
                                                  size: 18,
                                                ),
                                                const SizedBox(width: 4),
                                                Text(
                                                  '${widget.grupo.totalAlumnos}',
                                                  style: TextStyle(
                                                    color: widget.accentColor,
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
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 32),
                        // Tab menu y contenido con animación
                        FadeTransition(
                          opacity: _studentsOpacity,
                          child: SlideTransition(
                            position: _studentsSlide,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                // Tab Menu
                                _buildTabMenu(),
                                const SizedBox(height: 16),
                                // Contenido basado en el tab seleccionado
                                _selectedTab == 0
                                    ? _buildMiAsistenciaContent()
                                    : _buildAlumnosContent(),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 24),
                      ],
                    ),
                  ),
                ),
              ], // Cierre de slivers
            ), // Cierre CustomScrollView
            // Botón flotante izquierda (X)
            Positioned(
              top: MediaQuery.of(context).padding.top + 8,
              left: 12,
              child: // Botón X
              ClipRRect(
                borderRadius: BorderRadius.circular(22),
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                  child: Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: palette.controlBackground,
                      borderRadius: BorderRadius.circular(22),
                      border: Border.all(
                        color: palette.controlBorder,
                        width: 0.5,
                      ),
                    ),
                    child: IconButton(
                      padding: EdgeInsets.zero,
                      icon: Icon(
                        Icons.close,
                        color: palette.controlIcon,
                        size: 24,
                      ),
                      onPressed: () {
                        HapticFeedback.lightImpact();
                        if (Navigator.of(context).canPop()) {
                          Navigator.of(context).pop();
                        }
                      },
                    ),
                  ),
                ),
              ),
            ),
            // Botón flotante derecha (fecha)
            Positioned(
              top: MediaQuery.of(context).padding.top + 8,
              right: 12,
              child: GestureDetector(
                onTap: () {
                  HapticFeedback.lightImpact();
                  _showDateTimePicker();
                },
                child:
                    _neonAnimationController != null && _neonAnimation != null
                    ? AnimatedBuilder(
                        animation: _neonAnimation!,
                        builder: (context, child) {
                          final neonColor =
                              widget.highlightColor ?? widget.gradientColors[0];
                          final glowIntensity = _neonAnimation!.value;
                          return Container(
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(22),
                              boxShadow: [
                                BoxShadow(
                                  color: neonColor.withOpacity(
                                    0.7 * glowIntensity,
                                  ),
                                  blurRadius: 16 * glowIntensity,
                                  spreadRadius: 2 * glowIntensity,
                                ),
                                BoxShadow(
                                  color: neonColor.withOpacity(
                                    0.4 * glowIntensity,
                                  ),
                                  blurRadius: 30 * glowIntensity,
                                  spreadRadius: 4 * glowIntensity,
                                ),
                              ],
                            ),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(22),
                              child: BackdropFilter(
                                filter: ImageFilter.blur(
                                  sigmaX: 20,
                                  sigmaY: 20,
                                ),
                                child: Container(
                                  height: 44,
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 16,
                                  ),
                                  decoration: BoxDecoration(
                                    color: palette.controlBackground,
                                    borderRadius: BorderRadius.circular(22),
                                    border: Border.all(
                                      color: neonColor.withOpacity(
                                        0.3 + 0.5 * glowIntensity,
                                      ),
                                      width: 1.5,
                                    ),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                        _getFormattedDateTime(),
                                        style: TextStyle(
                                          color: palette.controlIcon,
                                          fontSize: 13,
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                      const SizedBox(width: 6),
                                      Icon(
                                        Icons.edit,
                                        size: 16,
                                        color: palette.controlIcon,
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          );
                        },
                      )
                    : ClipRRect(
                        borderRadius: BorderRadius.circular(22),
                        child: BackdropFilter(
                          filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                          child: Container(
                            height: 44,
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            decoration: BoxDecoration(
                              color: palette.controlBackground,
                              borderRadius: BorderRadius.circular(22),
                              border: Border.all(
                                color: palette.controlBorder,
                                width: 0.5,
                              ),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  _getFormattedDateTime(),
                                  style: TextStyle(
                                    color: palette.controlIcon,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Icon(
                                  Icons.edit,
                                  size: 16,
                                  color: palette.controlIcon,
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
              ),
            ),

            // Botón flotante para volver arriba
            if (_showScrollToTopButton)
              Positioned(
                bottom: 24,
                right: 16,
                child: TweenAnimationBuilder<double>(
                  duration: const Duration(milliseconds: 200),
                  tween: Tween<double>(begin: 0, end: 1),
                  builder: (context, value, child) {
                    return Transform.scale(
                      scale: value,
                      child: Opacity(opacity: value, child: child),
                    );
                  },
                  child: GestureDetector(
                    onTap: _scrollToTop,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(22),
                      child: BackdropFilter(
                        filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                        child: Container(
                          height: 44,
                          padding: const EdgeInsets.symmetric(horizontal: 16),
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
                              const Icon(
                                Icons.arrow_upward_rounded,
                                color: Colors.white,
                                size: 20,
                              ),
                              const SizedBox(width: 6),
                              const Text(
                                'Arriba',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ], // Cierre Stack children
        ), // Cierre Stack
      ), // Cierre NotificationListener
    ); // Cierre Scaffold
  }

  Widget _buildTabMenu() {
    return Row(
      children: [
        _buildTabButton(
          label: 'Mi asistencia',
          isSelected: _selectedTab == 0,
          onTap: () {
            HapticFeedback.lightImpact();
            setState(() => _selectedTab = 0);
          },
        ),
        const SizedBox(width: 24),
        _buildTabButton(
          label: 'Alumnos',
          isSelected: _selectedTab == 1,
          onTap: () {
            HapticFeedback.lightImpact();
            setState(() => _selectedTab = 1);
          },
        ),
      ],
    );
  }

  Widget _buildTabButton({
    required String label,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    final palette = context.uatPalette;

    return GestureDetector(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              color: isSelected ? palette.textPrimary : palette.textSecondary,
              fontSize: 24,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeInOut,
            height: 3,
            width: isSelected ? 40 : 0,
            decoration: BoxDecoration(
              color: widget.gradientColors[0],
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMiAsistenciaContent() {
    final palette = context.uatPalette;

    return Column(
      children: [
        // Mensaje de advertencia si no es día de clase
        if (_esFechaHoy() && !_esDiaDeClase()) ...[
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.orange.withOpacity(0.15),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: Colors.orange.withOpacity(0.3),
                width: 1,
              ),
            ),
            child: Row(
              children: [
                Icon(Icons.info_outline, color: Colors.orange, size: 24),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Hoy no hay clase de este grupo según el horario',
                    style: TextStyle(
                      color: Colors.orange.shade300,
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],
        // Botón de Entrada
        Container(
          decoration: BoxDecoration(
            color: palette.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: palette.border),
            boxShadow: [
              BoxShadow(
                color: palette.shadow,
                blurRadius: 10,
                offset: const Offset(0, 5),
              ),
            ],
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: _entradaProfesor == null && _puedeMarcarAsistenciaHoy()
                  ? () {
                      HapticFeedback.mediumImpact();
                      if (_puedeMarcarEntrada()) {
                        _verificarBeaconYMarcarEntrada();
                      } else {
                        _mostrarMensajeHorario(_getMensajeVentanaEntrada());
                      }
                    }
                  : null,
              borderRadius: BorderRadius.circular(12),
              splashColor: widget.gradientColors[0].withOpacity(0.2),
              highlightColor: widget.gradientColors[0].withOpacity(0.1),
              child: Opacity(
                opacity: _entradaProfesor == null && _puedeMarcarAsistenciaHoy()
                    ? 1.0
                    : 0.6,
                child: Padding(
                  padding: const EdgeInsets.all(20.0),
                  child: Row(
                    children: [
                      // Icono de entrada
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: widget.gradientColors[0].withOpacity(0.2),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: widget.gradientColors[0].withOpacity(0.3),
                          ),
                        ),
                        child: Icon(
                          Icons.login_rounded,
                          color: widget.gradientColors[0],
                          size: 24,
                        ),
                      ),
                      const SizedBox(width: 16),
                      // Texto
                      Expanded(
                        child: Text(
                          _entradaProfesor == null
                              ? 'Marcar Entrada'
                              : 'Entrada: ${_getFormattedDate(_entradaProfesor!)} ${_formatTime(_entradaProfesor!)}',
                          style: TextStyle(
                            color: Colors.white.withOpacity(0.9),
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      // Indicador de estado
                      if (_entradaProfesor != null)
                        Icon(
                          Icons.check_circle,
                          color: widget.gradientColors[0],
                          size: 28,
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        // Botón de Salida
        Container(
          decoration: BoxDecoration(
            color: palette.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: palette.border),
            boxShadow: [
              BoxShadow(
                color: palette.shadow,
                blurRadius: 10,
                offset: const Offset(0, 5),
              ),
            ],
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap:
                  _entradaProfesor != null &&
                      _salidaProfesor == null &&
                      _puedeMarcarAsistenciaHoy()
                  ? () {
                      HapticFeedback.mediumImpact();
                      if (_puedeMarcarSalida()) {
                        _verificarBeaconYMarcarSalida();
                      } else {
                        _mostrarMensajeHorario(_getMensajeVentanaSalida());
                      }
                    }
                  : null,
              borderRadius: BorderRadius.circular(12),
              splashColor: widget.gradientColors[0].withOpacity(0.2),
              highlightColor: widget.gradientColors[0].withOpacity(0.1),
              child: Opacity(
                opacity:
                    _entradaProfesor != null &&
                        _salidaProfesor == null &&
                        _puedeMarcarAsistenciaHoy()
                    ? 1.0
                    : 0.6,
                child: Padding(
                  padding: const EdgeInsets.all(20.0),
                  child: Row(
                    children: [
                      // Icono de salida
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: widget.gradientColors[0].withOpacity(0.2),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: widget.gradientColors[0].withOpacity(0.3),
                          ),
                        ),
                        child: Icon(
                          Icons.logout_rounded,
                          color: widget.gradientColors[0],
                          size: 24,
                        ),
                      ),
                      const SizedBox(width: 16),
                      // Texto
                      Expanded(
                        child: Text(
                          _salidaProfesor == null
                              ? 'Marcar Salida'
                              : 'Salida: ${_getFormattedDate(_salidaProfesor!)} ${_formatTime(_salidaProfesor!)}',
                          style: TextStyle(
                            color: _entradaProfesor == null
                                ? Colors.white.withOpacity(0.5)
                                : Colors.white.withOpacity(0.9),
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      // Indicador de estado
                      if (_salidaProfesor != null)
                        Icon(
                          Icons.check_circle,
                          color: widget.gradientColors[0],
                          size: 28,
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        // Botón de Subir Asistencia
        Container(
          decoration: BoxDecoration(
            color: palette.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: palette.border),
            boxShadow: [
              BoxShadow(
                color: palette.shadow,
                blurRadius: 10,
                offset: const Offset(0, 5),
              ),
            ],
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: _puedeSubirAsistencia()
                  ? () {
                      HapticFeedback.mediumImpact();
                      _intentarSincronizarAsistencia();
                    }
                  : null,
              borderRadius: BorderRadius.circular(12),
              splashColor: widget.gradientColors[0].withOpacity(0.2),
              highlightColor: widget.gradientColors[0].withOpacity(0.1),
              child: Opacity(
                opacity: _puedeSubirAsistencia() ? 1.0 : 0.6,
                child: Padding(
                  padding: const EdgeInsets.all(20.0),
                  child: Row(
                    children: [
                      // Icono de subir
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: widget.gradientColors[0].withOpacity(0.2),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: widget.gradientColors[0].withOpacity(0.3),
                          ),
                        ),
                        child: Icon(
                          Icons.cloud_upload_rounded,
                          color: widget.gradientColors[0],
                          size: 24,
                        ),
                      ),
                      const SizedBox(width: 16),
                      // Texto
                      Expanded(
                        child: Text(
                          'Subir Asistencia',
                          style: TextStyle(
                            color: _puedeSubirAsistencia()
                                ? Colors.white.withOpacity(0.9)
                                : Colors.white.withOpacity(0.5),
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      // Icono de flecha
                      if (_puedeSubirAsistencia())
                        Icon(
                          Icons.arrow_forward_rounded,
                          color: widget.gradientColors[0],
                          size: 24,
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  // ── Verificación BLE Beacon para entrada y salida ─────────────

  Future<void> _verificarBeaconYMarcarEntrada() async {
    final resultado = await _verificarBeaconDelSalon(permitirMotivo: true);
    if (!mounted || resultado == null || !resultado.debeMarcarAsistencia) {
      return;
    }

    HapticFeedback.heavyImpact();
    setState(() {
      _entradaProfesor = DateTime.now();
      _entradaVerificada = resultado.verificada;
      _motivoEntrada = resultado.motivo;
    });
    await _guardarAsistencia();
  }

  Future<void> _verificarBeaconYMarcarSalida() async {
    final resultado = await _verificarBeaconDelSalon(permitirMotivo: false);
    if (!mounted || resultado == null || !resultado.verificada) return;

    HapticFeedback.heavyImpact();
    setState(() {
      _salidaProfesor = DateTime.now();
    });
    await _guardarAsistencia();
    await _sincronizarSalidaProfesor();
  }

  Future<_BleDialogResult?> _verificarBeaconDelSalon({
    required bool permitirMotivo,
  }) async {
    // Buscar el UUID del beacon asignado al salón de este grupo
    final authStorage = AuthStorageService();
    var beaconUuid = authStorage.getBeaconUuidForClassroom(
      widget.grupo.classroom,
    );

    final result = await _apiService.resolveClassroomBeacons(
      classrooms: [widget.grupo.classroom],
    );
    await result.fold((_) async {}, (beacons) async {
      if (beacons.isEmpty) return;

      final existing = authStorage.getBeacons() ?? [];
      final merged = <String, Map<String, dynamic>>{
        for (final beacon in existing)
          if (AuthStorageService.classroomKey(
            beacon['classroomKey']?.toString() ??
                beacon['classroom']?.toString(),
          ).isNotEmpty)
            AuthStorageService.classroomKey(
              beacon['classroomKey']?.toString() ??
                  beacon['classroom']?.toString(),
            ): beacon,
      };

      for (final beacon in beacons) {
        final classroomKey = AuthStorageService.classroomKey(
          beacon['classroomKey']?.toString() ?? beacon['classroom']?.toString(),
        );
        if (classroomKey.isEmpty) continue;
        merged[classroomKey] = beacon;
      }

      await authStorage.saveBeacons(merged.values.toList());
      beaconUuid = authStorage.getBeaconUuidForClassroom(
        widget.grupo.classroom,
      );
    });

    final resolvedBeaconUuid = beaconUuid;
    if (resolvedBeaconUuid == null || resolvedBeaconUuid.isEmpty) {
      if (!mounted) return null;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'No hay beacon asignado al salón "${widget.grupo.classroom}". '
            'Contacta al administrador.',
          ),
          backgroundColor: Colors.orange,
          duration: const Duration(seconds: 4),
        ),
      );
      return null;
    }

    if (!mounted) return null;
    final resultado = await showDialog<_BleDialogResult>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => _BleBeaconScanDialog(
        bleService: _bleBeaconService,
        beaconUuid: resolvedBeaconUuid,
        gradientColors: widget.gradientColors,
        permitirMotivo: permitirMotivo,
      ),
    );

    return resultado;
  }

  String _formatTime(DateTime dateTime) {
    final hour = dateTime.hour.toString().padLeft(2, '0');
    final minute = dateTime.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }

  String _alumnoKey(Alumno alumno) {
    return alumno.id ?? alumno.number.toString();
  }

  Map<String, bool> _normalizarAsistencias(Map<String, bool> asistencias) {
    final numberToId = <String, String>{};
    for (final alumno in widget.grupo.students) {
      if (alumno.id != null) {
        numberToId[alumno.number.toString()] = alumno.id!;
      }
    }

    final normalized = <String, bool>{};
    asistencias.forEach((key, value) {
      final normalizedKey = numberToId[key] ?? key;
      normalized[normalizedKey] = value;
    });

    return normalized;
  }

  // Cargar asistencia existente para la fecha seleccionada
  void _cargarAsistencia() {
    final registroActual = _asistenciaService.obtenerAsistenciaPorGrupoYFecha(
      widget.grupo.id,
      _selectedDateTime,
    );
    final registroLegado = registroActual == null
        ? _asistenciaService.obtenerAsistenciaPorGrupoYFecha(
            widget.grupo.identificadorUnico,
            _selectedDateTime,
          )
        : null;
    final registro = registroActual ?? registroLegado;

    if (registro != null) {
      setState(() {
        _entradaProfesor = registro.horaEntrada;
        _salidaProfesor = registro.horaSalida;
        _entradaVerificada = registro.entradaVerificada;
        _motivoEntrada = registro.motivoEntrada;
        _asistencias.clear();
        _asistencias.addAll(
          _normalizarAsistencias(registro.asistenciasAlumnos),
        );
      });

      // Actualizar el nombre de la clase si está vacío (asistencias antiguas)
      if (registro.nombreClase == null || registro.nombreClase!.isEmpty) {
        final registroActualizado = registro.copyWith(
          nombreClase: widget.grupo.subject,
        );
        _asistenciaService.guardarAsistencia(registroActualizado);
      }
    } else {
      setState(() {
        _entradaProfesor = null;
        _salidaProfesor = null;
        _asistencias.clear();
      });
    }
  }

  // Guardar asistencia localmente
  String _registroAsistenciaId() {
    return '${widget.grupo.id}_${_selectedDateTime.year}-${_selectedDateTime.month}-${_selectedDateTime.day}';
  }

  List<Map<String, dynamic>> _buildAttendancesForUpload() {
    final studentIdMap = <String, String>{};
    for (final student in widget.grupo.students) {
      final studentId = student.id;
      if (studentId != null && studentId.isNotEmpty) {
        studentIdMap[studentId] = studentId;
        studentIdMap[student.number.toString()] = studentId;
        if (student.matricula != null) {
          studentIdMap[student.matricula!] = studentId;
        }
      }
    }

    final attendances = <Map<String, dynamic>>[];
    _asistencias.forEach((key, present) {
      final studentId = studentIdMap[key];
      if (studentId == null) return;

      attendances.add({
        'studentId': studentId,
        'num_pase_lista': 1,
        'num_dia': _selectedDateTime.weekday,
        'sn_asistencia': present,
      });
    });

    return attendances;
  }

  Future<void> _guardarAsistencia() async {
    final registroId = _registroAsistenciaId();

    final profesorId = _authStorage.getProfesor()?.id ?? 'unknown_professor';

    // Preserve the synced snapshot from the existing record so that
    // post-upload modifications are properly detected as "pending".
    final existente = _asistenciaService.obtenerAsistencia(registroId);

    final registro = AsistenciaRegistro(
      id: registroId,
      grupoId: widget.grupo.id,
      profesorId: profesorId,
      fecha: _selectedDateTime,
      horaEntrada: _entradaProfesor,
      horaSalida: _salidaProfesor,
      asistenciasAlumnos: Map.from(_asistencias),
      sincronizado: false,
      fechaCreacion: existente?.fechaCreacion ?? DateTime.now(),
      fechaActualizacion: DateTime.now(),
      nombreClase: widget.grupo.subject,
      asistenciasSincronizadas: existente?.asistenciasSincronizadas,
      entradaVerificada: _entradaVerificada,
      motivoEntrada: _motivoEntrada,
      grupoCode: widget.grupo.code,
      grupoGroupLetter: widget.grupo.groupLetter,
      grupoPeriod: widget.grupo.period,
    );

    await _asistenciaService.guardarAsistencia(registro);
  }

  Future<void> _sincronizarSalidaProfesor() async {
    final token = _authStorage.getToken();
    if (token == null || token.isEmpty) return;

    final salida = _salidaProfesor;
    if (salida == null) return;

    final result = await _apiService.recordProfessorExit(
      token: token,
      code: widget.grupo.code ?? '',
      groupLetter: widget.grupo.groupLetter ?? widget.grupo.grupoLetra,
      period: widget.grupo.period ?? '',
      detectedAt: salida,
    );

    result.fold(
      (error) => Logger.error(
        'No se pudo registrar salida del profesor en backend: $error',
      ),
      (_) => Logger.info('Salida del profesor registrada en backend.'),
    );
  }

  // Intentar sincronizar asistencia a la nube
  Future<void> _intentarSincronizarAsistencia() async {
    // Mostrar diálogo de progreso
    if (!mounted) return;

    await _guardarAsistencia();
    if (!mounted) return;

    final token = _authStorage.getToken();
    final attendances = _buildAttendancesForUpload();

    if (token == null || token.isEmpty || attendances.isEmpty) {
      if (mounted) {
        _mostrarDialogoErrorSincronizacion();
      }
      return;
    }

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) {
        final palette = context.uatPalette;

        return Dialog(
          backgroundColor: palette.surfaceElevated,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Icono de nube
                Stack(
                  alignment: Alignment.center,
                  children: [
                    Icon(
                      Icons.cloud,
                      color: widget.gradientColors[1],
                      size: 60,
                    ),
                    Icon(
                      Icons.arrow_upward_rounded,
                      color: Colors.white,
                      size: 28,
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                // Indicador de progreso
                SizedBox(
                  width: 40,
                  height: 40,
                  child: CircularProgressIndicator(
                    strokeWidth: 3,
                    valueColor: AlwaysStoppedAnimation<Color>(
                      widget.gradientColors[1],
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                Text(
                  'Subiendo asistencia',
                  style: TextStyle(
                    color: palette.textPrimary,
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Estamos guardando la asistencia\nen la nube...',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: palette.textSecondary, fontSize: 14),
                ),
              ],
            ),
          ),
        );
      },
    );

    final result = await _apiService.uploadAttendance(
      token: token,
      groupId: widget.grupo.id,
      code: widget.grupo.code ?? '',
      groupLetter: widget.grupo.groupLetter ?? widget.grupo.grupoLetra,
      period: widget.grupo.period ?? '',
      date: _selectedDateTime,
      attendances: attendances,
      encryptedPassword: _authStorage.getEncryptedPassword() ?? '',
      groupName: widget.grupo.name,
      classroom: widget.grupo.classroom,
      level: widget.grupo.level,
      schedule: widget.grupo.schedule,
      professorEntryAt: _entradaProfesor,
      professorExitAt: _salidaProfesor,
    );

    // Cerrar diálogo
    if (mounted) {
      Navigator.of(context).pop();
    }

    await result.fold(
      (_) async {
        if (mounted) {
          _mostrarDialogoErrorSincronizacion();
        }
      },
      (response) async {
        await _asistenciaService.marcarComoSincronizada(
          _registroAsistenciaId(),
        );
        if (mounted) {
          _mostrarDialogoExito(
            debugUpload: response['skippedApiRestUpload'] == true,
          );
        }
      },
    );
  }

  // Mostrar diálogo de éxito
  void _mostrarDialogoExito({bool debugUpload = false}) {
    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (BuildContext context) {
        final palette = context.uatPalette;

        return Dialog(
          backgroundColor: palette.surfaceElevated,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Icono de éxito
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: Colors.green.withOpacity(0.2),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.check_circle,
                    color: Colors.green,
                    size: 50,
                  ),
                ),
                const SizedBox(height: 20),
                Text(
                  debugUpload ? 'Modo debug activo' : '¡Asistencia guardada!',
                  style: TextStyle(
                    color: palette.textPrimary,
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  debugUpload
                      ? 'La asistencia quedó registrada para reportes.\nNo se envio a UAT/API REST externa.'
                      : 'La asistencia del profesor y los alumnos\nha sido subida exitosamente a la nube.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: palette.textSecondary, fontSize: 14),
                ),
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () => Navigator.of(context).pop(),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: const Text(
                      'Entendido',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  // Mostrar diálogo de error de sincronización
  void _mostrarDialogoErrorSincronizacion() {
    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (BuildContext context) {
        final palette = context.uatPalette;

        return Dialog(
          backgroundColor: palette.surfaceElevated,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Icono de advertencia
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: Colors.orange.withOpacity(0.2),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(Icons.cloud_off, color: Colors.orange, size: 50),
                ),
                const SizedBox(height: 20),
                Text(
                  'No se pudo subir',
                  style: TextStyle(
                    color: palette.textPrimary,
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'La asistencia fue guardada localmente\npero no se pudo subir a la nube.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: palette.textSecondary, fontSize: 14),
                ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.orange.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.orange.withOpacity(0.3)),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.info_outline, color: Colors.orange, size: 20),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Puede intentarlo más tarde usando el botón "Pendientes" en la esquina superior derecha.',
                          style: TextStyle(
                            color: Colors.orange.shade300,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () => Navigator.of(context).pop(),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.orange,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: const Text(
                      'Entendido',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  // Verificar si la fecha seleccionada es hoy
  bool _esFechaHoy() {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final selected = DateTime(
      _selectedDateTime.year,
      _selectedDateTime.month,
      _selectedDateTime.day,
    );
    return selected == today;
  }

  // Verificar si la fecha seleccionada es un día de clase válido
  bool _esDiaDeClase() {
    final weekdaysConClase = widget.grupo.weekdaysConHorarioValido;
    if (weekdaysConClase.isEmpty) {
      return true; // Si no hay horario, permitir cualquier día
    }

    // weekday: 1=Monday, 2=Tuesday, ..., 7=Sunday
    return weekdaysConClase.contains(_selectedDateTime.weekday);
  }

  // Verificar si se puede marcar asistencia (es hoy Y es día de clase)
  bool _puedeMarcarAsistenciaHoy() {
    return _esFechaHoy() && _esDiaDeClase();
  }

  // Para alumnos: permite marcar en cualquier fecha si es día de clase
  bool _puedeMarcarAsistenciaAlumnos() {
    return _esDiaDeClase();
  }

  bool _puedeSubirAsistencia() {
    final tieneAsistenciaProfesor =
        _entradaProfesor != null && _salidaProfesor != null;
    final tieneAsistenciaAlumnos =
        _puedeMarcarAsistenciaAlumnos() && _asistencias.isNotEmpty;

    return tieneAsistenciaProfesor || tieneAsistenciaAlumnos;
  }

  String _normalizeBeaconUuid(String uuid) {
    return uuid.replaceAll('-', '').trim().toLowerCase();
  }

  Future<Map<String, String>> _loadStudentBeaconBindingsForScan() async {
    final fallback = <String, String>{};
    _studentBeaconScanUuids = [];

    for (final alumno in widget.grupo.students) {
      final beaconUuid = alumno.beaconUuid;
      if (beaconUuid == null || beaconUuid.isEmpty) continue;
      final normalized = _normalizeBeaconUuid(beaconUuid);
      if (normalized.isEmpty) continue;
      fallback[normalized] = _alumnoKey(alumno);
      _studentBeaconScanUuids.add(beaconUuid);
    }

    final token = _authStorage.getToken();
    final code = widget.grupo.code;
    final groupLetter = widget.grupo.groupLetter;
    final period = widget.grupo.period;
    if (token == null ||
        token.isEmpty ||
        code == null ||
        groupLetter == null ||
        period == null) {
      return fallback;
    }

    final result = await _apiService.getStudentBeaconBindings(
      token: token,
      code: code,
      groupLetter: groupLetter,
      period: period,
    );

    return result.fold(
      (error) {
        Logger.info('[StudentBeaconScan] Usando UUIDs cacheados: $error');
        return fallback;
      },
      (bindings) {
        final resolved = <String, String>{};
        final scanUuids = <String>[];
        final studentKeys = {
          for (final alumno in widget.grupo.students)
            if (alumno.id != null) alumno.id!: _alumnoKey(alumno),
        };
        final studentKeysByMatricula = {
          for (final alumno in widget.grupo.students)
            if (alumno.matricula?.trim().isNotEmpty ?? false)
              alumno.matricula!.trim().toUpperCase(): _alumnoKey(alumno),
        };

        for (final binding in bindings) {
          final studentId = binding['studentId']?.toString();
          final matricula = binding['matricula']?.toString();
          final beaconUuid = binding['beaconUuid']?.toString();
          if (beaconUuid == null || beaconUuid.isEmpty) {
            continue;
          }
          final studentKey =
              (matricula == null || matricula.trim().isEmpty
                  ? null
                  : studentKeysByMatricula[matricula.trim().toUpperCase()]) ??
              (studentId == null || studentId.isEmpty
                  ? null
                  : studentKeys[studentId]) ??
              studentId;
          if (studentKey == null || studentKey.isEmpty) continue;
          final normalized = _normalizeBeaconUuid(beaconUuid);
          if (normalized.isEmpty) continue;
          resolved[normalized] = studentKey;
          scanUuids.add(beaconUuid);
        }

        if (resolved.isEmpty) return fallback;
        _studentBeaconScanUuids = scanUuids;
        return resolved;
      },
    );
  }

  Future<void> _startStudentBeaconScan() async {
    if (_isStudentBeaconScanning || _isLoadingStudentBeaconBindings) return;

    if (!_puedeMarcarAsistenciaAlumnos()) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No se puede pasar lista en este día.'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    setState(() {
      _isLoadingStudentBeaconBindings = true;
    });

    final granted =
        await PermissionService.requestStudentAttendanceBlePermissions();
    if (!mounted) return;

    if (!granted) {
      setState(() {
        _isLoadingStudentBeaconBindings = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Activa los permisos de Bluetooth para detectar alumnos.',
          ),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    final bindings = await _loadStudentBeaconBindingsForScan();
    if (!mounted) return;

    if (bindings.isEmpty || _studentBeaconScanUuids.isEmpty) {
      setState(() {
        _isLoadingStudentBeaconBindings = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No hay alumnos con UUID vinculado en este grupo.'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    await _studentBeaconSubscription?.cancel();
    _studentKeyByBeaconUuid = bindings;
    _detectedStudentBeaconUuids.clear();
    _studentBeaconSubscription = _studentBeaconService.detectionsStream.listen(
      _handleStudentBeaconDetections,
    );

    _bleBeaconService.cancelScan();
    bool started = false;
    try {
      started = await _studentBeaconService.startScanning(
        uuids: _studentBeaconScanUuids,
      );
    } on PlatformException catch (error) {
      Logger.info(
        '[StudentBeaconScan] No se pudo iniciar BLE: ${error.code} ${error.message}',
      );
      if (mounted) {
        setState(() {
          _isLoadingStudentBeaconBindings = false;
          _isStudentBeaconScanning = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              error.code == 'BLUETOOTH_OFF'
                  ? 'Activa Bluetooth para detectar alumnos.'
                  : 'Activa el permiso de Bluetooth en Configuración.',
            ),
            backgroundColor: Colors.orange,
          ),
        );
      }
      await _studentBeaconSubscription?.cancel();
      _studentBeaconSubscription = null;
      return;
    }
    if (!mounted) return;

    setState(() {
      _isLoadingStudentBeaconBindings = false;
      _isStudentBeaconScanning = started;
    });

    if (!started) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No se pudo iniciar la detección BLE.'),
          backgroundColor: Colors.red,
        ),
      );
      await _studentBeaconSubscription?.cancel();
      _studentBeaconSubscription = null;
    }
  }

  Future<void> _stopStudentBeaconScan() async {
    await _studentBeaconSubscription?.cancel();
    _studentBeaconSubscription = null;
    await _studentBeaconService.stopScanning();
    _studentKeyByBeaconUuid = {};
    _studentBeaconScanUuids = [];
    if (mounted) {
      setState(() {
        _isStudentBeaconScanning = false;
        _isLoadingStudentBeaconBindings = false;
      });
    } else {
      _isStudentBeaconScanning = false;
      _isLoadingStudentBeaconBindings = false;
    }
  }

  Future<void> _handleStudentBeaconDetections(
    List<StudentAttendanceDetection> detections,
  ) async {
    if (!_isStudentBeaconScanning || detections.isEmpty) return;

    final updates = <String, bool>{};

    for (final detection in detections) {
      final normalized = _normalizeBeaconUuid(detection.uuid);
      final studentKey = _studentKeyByBeaconUuid[normalized];
      if (studentKey == null) continue;
      if (!_detectedStudentBeaconUuids.add(normalized)) continue;
      updates[studentKey] = true;
    }

    if (updates.isEmpty) return;

    if (mounted) {
      setState(() {
        _asistencias.addAll(updates);
      });
    } else {
      _asistencias.addAll(updates);
    }

    await _guardarAsistencia();
  }

  String _getFormattedDate(DateTime dateTime) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final yesterday = today.subtract(const Duration(days: 1));
    final dayBeforeYesterday = today.subtract(const Duration(days: 2));
    final targetDate = DateTime(dateTime.year, dateTime.month, dateTime.day);

    if (targetDate == today) {
      return 'Hoy';
    } else if (targetDate == yesterday) {
      return 'Ayer';
    } else if (targetDate == dayBeforeYesterday) {
      return 'Antier';
    } else {
      final day = dateTime.day.toString().padLeft(2, '0');
      final months = [
        'ene',
        'feb',
        'mar',
        'abr',
        'may',
        'jun',
        'jul',
        'ago',
        'sep',
        'oct',
        'nov',
        'dic',
      ];
      final month = months[dateTime.month - 1];
      return '$day-$month';
    }
  }

  String _getFormattedDateTime() {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final yesterday = today.subtract(const Duration(days: 1));
    final dayBeforeYesterday = today.subtract(const Duration(days: 2));

    final currentDate = DateTime(
      _selectedDateTime.year,
      _selectedDateTime.month,
      _selectedDateTime.day,
    );
    final hour = _selectedDateTime.hour.toString().padLeft(2, '0');
    final minute = _selectedDateTime.minute.toString().padLeft(2, '0');
    final time = '$hour:$minute';

    if (currentDate == today) {
      return 'Hoy $time';
    } else if (currentDate == yesterday) {
      return 'Ayer $time';
    } else if (currentDate == dayBeforeYesterday) {
      return 'Antier $time';
    } else {
      final day = _selectedDateTime.day.toString().padLeft(2, '0');
      final months = [
        'ene',
        'feb',
        'mar',
        'abr',
        'may',
        'jun',
        'jul',
        'ago',
        'sep',
        'oct',
        'nov',
        'dic',
      ];
      final month = months[_selectedDateTime.month - 1];
      return '$day-$month $time';
    }
  }

  // Parsear el horario (ej: "20:00-21:00" -> DateTime de hoy con esas horas)
  DateTime? _parseHorarioInicio() {
    try {
      final horarioParts = widget.horario.split('-');
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

  DateTime? _parseHorarioFin() {
    try {
      final horarioParts = widget.horario.split('-');
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

  bool _puedeMarcarEntrada() {
    return true; // TODO: Restaurar restricción de horario después de testing BLE
    // final inicioClase = _parseHorarioInicio();
    // if (inicioClase == null) return true;
    // final now = DateTime.now();
    // final ventanaInicio = inicioClase.subtract(const Duration(minutes: 10));
    // final ventanaFin = inicioClase.add(const Duration(minutes: 30));
    // return now.isAfter(ventanaInicio) && now.isBefore(ventanaFin);
  }

  bool _puedeMarcarSalida() {
    return true; // TODO: Restaurar restricción de horario después de testing BLE
    // final finClase = _parseHorarioFin();
    // if (finClase == null) return true;
    // final now = DateTime.now();
    // final ventanaInicio = finClase.subtract(const Duration(minutes: 30));
    // final ventanaFin = finClase.add(const Duration(minutes: 30));
    // return now.isAfter(ventanaInicio) && now.isBefore(ventanaFin);
  }

  String _getMensajeVentanaEntrada() {
    final inicioClase = _parseHorarioInicio();
    if (inicioClase == null) return '';

    final ventanaInicio = inicioClase.subtract(const Duration(minutes: 10));
    final ventanaFin = inicioClase.add(const Duration(minutes: 30));

    final horaInicio = _formatTime(ventanaInicio);
    final horaFin = _formatTime(ventanaFin);

    return 'Puedes marcar entrada entre $horaInicio y $horaFin';
  }

  String _getMensajeVentanaSalida() {
    final finClase = _parseHorarioFin();
    if (finClase == null) return '';

    final ventanaInicio = finClase.subtract(const Duration(minutes: 30));
    final ventanaFin = finClase.add(const Duration(minutes: 30));

    final horaInicio = _formatTime(ventanaInicio);
    final horaFin = _formatTime(ventanaFin);

    return 'Puedes marcar salida entre $horaInicio y $horaFin';
  }

  void _mostrarMensajeHorario(String mensaje) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(mensaje),
        backgroundColor: Colors.orange[700],
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        margin: const EdgeInsets.all(16),
        duration: const Duration(seconds: 3),
      ),
    );
  }

  bool _esFechaSeleccionable(DateTime date) {
    final weekdays = widget.grupo.weekdaysConHorarioValido;
    if (weekdays.isEmpty) return true;
    return weekdays.contains(date.weekday);
  }

  DateTime _fechaInicialSeleccionable(DateTime candidate, DateTime lastDate) {
    if (_esFechaSeleccionable(candidate) && !candidate.isAfter(lastDate)) {
      return candidate;
    }

    var cursor = candidate.isAfter(lastDate) ? lastDate : candidate;
    for (var i = 0; i < 14; i++) {
      if (_esFechaSeleccionable(cursor)) return cursor;
      cursor = cursor.subtract(const Duration(days: 1));
    }

    cursor = candidate;
    for (var i = 0; i < 14; i++) {
      if (!cursor.isAfter(lastDate) && _esFechaSeleccionable(cursor)) {
        return cursor;
      }
      cursor = cursor.add(const Duration(days: 1));
    }

    return lastDate;
  }

  Future<void> _showDateTimePicker() async {
    // Obtener la hora actual para mantenerla cuando se cambie la fecha
    final now = DateTime.now();
    final initialDate = _fechaInicialSeleccionable(_selectedDateTime, now);
    final DateTime? pickedDate = await showDatePicker(
      context: context,
      initialDate: initialDate,
      firstDate: DateTime(2020),
      lastDate: now, // No permitir fechas futuras
      locale: const Locale('es', 'MX'),
      selectableDayPredicate: _esFechaSeleccionable,
      builder: (context, child) {
        final palette = context.uatPalette;
        final baseTheme = Theme.of(context);

        return Theme(
          data: baseTheme.copyWith(
            colorScheme: baseTheme.colorScheme.copyWith(
              primary: widget.accentColor,
              onPrimary: Colors.white,
              surface: palette.surfaceElevated,
              onSurface: palette.textPrimary,
              onSurfaceVariant: palette.textSecondary,
            ),
            textButtonTheme: TextButtonThemeData(
              style: TextButton.styleFrom(foregroundColor: widget.accentColor),
            ),
            datePickerTheme: DatePickerThemeData(
              backgroundColor: palette.surfaceElevated,
              headerBackgroundColor: palette.surfaceElevated,
              headerForegroundColor: palette.textPrimary,
              dividerColor: palette.border,
              dayForegroundColor: WidgetStateProperty.resolveWith((states) {
                if (states.contains(WidgetState.disabled)) {
                  return palette.textTertiary.withValues(alpha: 0.35);
                }
                if (states.contains(WidgetState.selected)) return Colors.white;
                return palette.textPrimary;
              }),
              dayBackgroundColor: WidgetStateProperty.resolveWith((states) {
                if (states.contains(WidgetState.selected)) {
                  return widget.accentColor;
                }
                if (states.contains(WidgetState.hovered)) {
                  return widget.accentColor.withValues(alpha: 0.12);
                }
                return null;
              }),
              todayForegroundColor: WidgetStateProperty.all(widget.accentColor),
              todayBorder: BorderSide(color: widget.accentColor),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24),
              ),
            ),
            dialogTheme: DialogThemeData(
              backgroundColor: palette.surfaceElevated,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24),
              ),
            ),
          ),
          child: child!,
        );
      },
    );

    if (pickedDate != null) {
      // Solo actualizar la fecha, mantener la hora actual
      setState(() {
        _selectedDateTime = DateTime(
          pickedDate.year,
          pickedDate.month,
          pickedDate.day,
          now.hour,
          now.minute,
        );
      });
      // Cargar la asistencia de la nueva fecha seleccionada
      _cargarAsistencia();
    }
  }

  Widget _buildStudentBeaconScanControls() {
    final palette = context.uatPalette;
    final detectedCount = _detectedStudentBeaconUuids.length;
    final linkedCount = _studentKeyByBeaconUuid.isNotEmpty
        ? _studentKeyByBeaconUuid.length
        : widget.grupo.students
              .where((alumno) => alumno.beaconUuid?.isNotEmpty ?? false)
              .length;
    final canScan = _puedeMarcarAsistenciaAlumnos();

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: _isStudentBeaconScanning
              ? widget.gradientColors[0].withOpacity(0.45)
              : palette.border,
        ),
        boxShadow: [
          BoxShadow(
            color: palette.shadow,
            blurRadius: 10,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: widget.gradientColors[0].withOpacity(0.14),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              _isStudentBeaconScanning
                  ? Icons.bluetooth_searching_rounded
                  : Icons.bluetooth_connected_rounded,
              color: widget.gradientColors[0],
              size: 24,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _isStudentBeaconScanning
                      ? 'Detectando alumnos'
                      : 'Beacons de alumnos',
                  style: TextStyle(
                    color: palette.textPrimary,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  _isStudentBeaconScanning
                      ? '$detectedCount detectados de $linkedCount vinculados'
                      : '$linkedCount alumnos con UUID vinculado',
                  style: TextStyle(
                    color: palette.textSecondary,
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          if (_isLoadingStudentBeaconBindings)
            SizedBox(
              width: 34,
              height: 34,
              child: CircularProgressIndicator(
                strokeWidth: 3,
                valueColor: AlwaysStoppedAnimation<Color>(
                  widget.gradientColors[0],
                ),
              ),
            )
          else
            FilledButton.icon(
              onPressed: canScan
                  ? (_isStudentBeaconScanning
                        ? _stopStudentBeaconScan
                        : _startStudentBeaconScan)
                  : null,
              icon: Icon(
                _isStudentBeaconScanning
                    ? Icons.stop_rounded
                    : Icons.sensors_rounded,
                size: 18,
              ),
              label: Text(_isStudentBeaconScanning ? 'Parar' : 'Escanear'),
              style: FilledButton.styleFrom(
                backgroundColor: _isStudentBeaconScanning
                    ? Colors.red.shade600
                    : widget.gradientColors[0],
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildAlumnosContent() {
    final palette = context.uatPalette;

    return Column(
      children: [
        // Mensaje de advertencia si no es día de clase
        if (!_esDiaDeClase()) ...[
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.orange.withOpacity(0.15),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: Colors.orange.withOpacity(0.3),
                width: 1,
              ),
            ),
            child: Row(
              children: [
                Icon(Icons.info_outline, color: Colors.orange, size: 24),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Este día no hay clase de este grupo según el horario',
                    style: TextStyle(
                      color: Colors.orange.shade300,
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],
        // Botón de pasar lista con Bluetooth
        _buildStudentBeaconScanControls(),
        const SizedBox(height: 12),
        // Lista de alumnos
        Container(
          decoration: BoxDecoration(
            color: palette.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: palette.border),
            boxShadow: [
              BoxShadow(
                color: palette.shadow,
                blurRadius: 10,
                offset: const Offset(0, 5),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Column(
              children: [
                if (_puedeMarcarAsistenciaAlumnos()) ...[
                  Material(
                    color: Colors.transparent,
                    child: InkWell(
                      onTap: () async {
                        HapticFeedback.lightImpact();
                        setState(() {
                          for (final alumno in widget.grupo.students) {
                            final key = _alumnoKey(alumno);
                            _asistencias[key] = !(_asistencias[key] ?? false);
                          }
                        });
                        await _guardarAsistencia();
                      },
                      splashColor: widget.gradientColors[0].withOpacity(0.15),
                      highlightColor: widget.gradientColors[0].withOpacity(
                        0.08,
                      ),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 14,
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            Text(
                              'Invertir',
                              style: TextStyle(
                                color: palette.textSecondary,
                                fontSize: 14,
                                fontWeight: FontWeight.w400,
                              ),
                            ),
                            const SizedBox(width: 32),
                            // Mismo ancho que el AnimatedContainer del checkbox (8+28+8)
                            SizedBox(
                              width: 44,
                              height: 44,
                              child: Center(
                                child: Icon(
                                  Icons.check_box_rounded,
                                  color: palette.textSecondary,
                                  size: 32,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Divider(height: 1, thickness: 1, color: palette.border),
                ],
                ...List.generate(
                  widget.grupo.students.length,
                  (index) => _buildStudentCard(
                    widget.grupo.students[index],
                    isLast: index == widget.grupo.students.length - 1,
                  ),
                ),
              ],
            ),
          ),
        ),
        // Espacio adicional al final para mejor visualización del último alumno
        const SizedBox(height: 100),
      ],
    );
  }

  Widget _buildStudentCard(dynamic alumno, {bool isLast = false}) {
    final puedeMarcar = _puedeMarcarAsistenciaAlumnos();
    final palette = context.uatPalette;

    return Container(
      color: palette.surface,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: puedeMarcar
              ? () async {
                  HapticFeedback.mediumImpact();
                  setState(() {
                    final currentValue =
                        _asistencias[_alumnoKey(alumno)] ?? false;
                    _asistencias[_alumnoKey(alumno)] = !currentValue;
                  });
                  // Guardar en almacenamiento local
                  await _guardarAsistencia();
                }
              : null,
          splashColor: puedeMarcar
              ? widget.gradientColors[0].withOpacity(0.2)
              : Colors.transparent,
          highlightColor: puedeMarcar
              ? widget.gradientColors[0].withOpacity(0.1)
              : Colors.transparent,
          child: Column(
            children: [
              Opacity(
                opacity: puedeMarcar ? 1.0 : 0.5,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 18,
                  ),
                  child: Row(
                    children: [
                      // Nombre del estudiante
                      Expanded(
                        child: Text(
                          alumno.name,
                          style: TextStyle(
                            color: palette.textPrimary,
                            fontSize: 16,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      // Checkbox de asistencia con animación
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        curve: Curves.easeInOut,
                        decoration: BoxDecoration(
                          color: (_asistencias[_alumnoKey(alumno)] ?? false)
                              ? widget.gradientColors[0].withOpacity(0.15)
                              : Colors.transparent,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.all(8.0),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            width: 28,
                            height: 28,
                            decoration: BoxDecoration(
                              color: (_asistencias[_alumnoKey(alumno)] ?? false)
                                  ? widget.gradientColors[0]
                                  : Colors.transparent,
                              border: Border.all(
                                color:
                                    (_asistencias[_alumnoKey(alumno)] ?? false)
                                    ? widget.gradientColors[0]
                                    : palette.border,
                                width: 2.5,
                              ),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: (_asistencias[_alumnoKey(alumno)] ?? false)
                                ? const Icon(
                                    Icons.check,
                                    color: Colors.white,
                                    size: 20,
                                  )
                                : null,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              // Línea separadora alineada con el contenido (excepto para el último elemento)
              if (!isLast)
                Padding(
                  padding: const EdgeInsets.only(left: 16, right: 16),
                  child: Container(height: 0.5, color: palette.border),
                ),
            ],
          ),
        ),
      ),
    );
  }

  // Esta función _verificarAsistenciaProfesor fue eliminada porque no se usa
}

// ══════════════════════════════════════════════════════════════════
// Resultado del diálogo BLE
// ══════════════════════════════════════════════════════════════════

class _BleDialogResult {
  final bool debeMarcarAsistencia;
  final bool verificada;
  final String? motivo;

  const _BleDialogResult({
    required this.debeMarcarAsistencia,
    required this.verificada,
    this.motivo,
  });

  /// Beacon detectado — asistencia verificada
  factory _BleDialogResult.verified() =>
      const _BleDialogResult(debeMarcarAsistencia: true, verificada: true);

  /// Beacon no detectado — entrada parcial con motivo
  factory _BleDialogResult.withMotivo(String motivo) => _BleDialogResult(
    debeMarcarAsistencia: true,
    verificada: false,
    motivo: motivo,
  );
}

// ══════════════════════════════════════════════════════════════════
// Motivos predefinidos
// ══════════════════════════════════════════════════════════════════

const List<String> _motivosPredefinidos = [
  'Estoy en el salón pero no detecta el sensor',
  'No estoy en el salón pero sí asistí',
  'Estoy con mis alumnos en otro salón',
];

// ══════════════════════════════════════════════════════════════════
// Widget: BLE Beacon Scan Dialog
// ══════════════════════════════════════════════════════════════════

class _BleBeaconScanDialog extends StatefulWidget {
  final BleBeaconVerificationService bleService;
  final String beaconUuid;
  final List<Color> gradientColors;
  final bool permitirMotivo;

  const _BleBeaconScanDialog({
    required this.bleService,
    required this.beaconUuid,
    required this.gradientColors,
    required this.permitirMotivo,
  });

  @override
  State<_BleBeaconScanDialog> createState() => _BleBeaconScanDialogState();
}

class _BleBeaconScanDialogState extends State<_BleBeaconScanDialog>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  _ScanPhase _phase = _ScanPhase.scanning;
  String _statusText = 'Buscando beacon del salón...';
  String? _lastDeviceFound;
  StreamSubscription<String>? _progressSub;

  // Para la fase de motivo
  final TextEditingController _otroMotivoController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 0.85, end: 1.15).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    _progressSub = widget.bleService.progressStream.listen((deviceName) {
      if (mounted) {
        setState(() => _lastDeviceFound = deviceName);
      }
    });

    _startScan();
  }

  Future<void> _startScan() async {
    setState(() {
      _phase = _ScanPhase.scanning;
      _statusText = 'Buscando beacon del salón...';
      _lastDeviceFound = null;
    });

    debugPrint(
      '[BLE-Dialog] Iniciando verificación con UUID: ${widget.beaconUuid}',
    );
    final result = await widget.bleService.verifyBeaconPresence(
      beaconUuid: widget.beaconUuid,
    );
    debugPrint('[BLE-Dialog] Resultado: $result');
    if (!mounted) return;

    switch (result) {
      case BeaconVerificationResult.detected:
        setState(() {
          _phase = _ScanPhase.success;
          _statusText = '¡Beacon detectado!';
        });
        _pulseController.stop();
        HapticFeedback.heavyImpact();
        await Future.delayed(const Duration(milliseconds: 800));
        if (mounted) {
          Navigator.of(context).pop(_BleDialogResult.verified());
        }
        break;

      case BeaconVerificationResult.timeout:
        setState(() {
          _phase = _ScanPhase.failed;
          _statusText = 'No se detectó el beacon';
        });
        _pulseController.stop();
        HapticFeedback.mediumImpact();
        break;

      case BeaconVerificationResult.bluetoothUnavailable:
        setState(() {
          _phase = _ScanPhase.failed;
          _statusText = 'Bluetooth no disponible';
        });
        _pulseController.stop();
        break;

      case BeaconVerificationResult.error:
        setState(() {
          _phase = _ScanPhase.failed;
          _statusText = 'Error durante el escaneo';
        });
        _pulseController.stop();
        break;
    }
  }

  void _seleccionarMotivo(String motivo) {
    Navigator.of(context).pop(_BleDialogResult.withMotivo(motivo));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    widget.bleService.cancelScan();
    _pulseController.dispose();
    _progressSub?.cancel();
    _otroMotivoController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) {
      widget.bleService.cancelScan();
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.uatPalette;

    return Dialog(
      backgroundColor: palette.surfaceElevated,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(28.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildIcon(),
              const SizedBox(height: 24),
              Text(
                _statusText,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: palette.textPrimary,
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              _buildContent(),
            ],
          ),
        ),
      ),
    );
  }

  // ── Ícono central ──
  Widget _buildIcon() {
    switch (_phase) {
      case _ScanPhase.scanning:
        return ScaleTransition(
          scale: _pulseAnimation,
          child: Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              color: widget.gradientColors[0].withOpacity(0.2),
              shape: BoxShape.circle,
            ),
            child: Icon(
              Icons.bluetooth_searching_rounded,
              color: widget.gradientColors[0],
              size: 44,
            ),
          ),
        );
      case _ScanPhase.success:
        return Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            color: Colors.green.withOpacity(0.2),
            shape: BoxShape.circle,
          ),
          child: const Icon(
            Icons.check_circle_rounded,
            color: Colors.green,
            size: 50,
          ),
        );
      case _ScanPhase.failed:
        return Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            color: Colors.orange.withOpacity(0.2),
            shape: BoxShape.circle,
          ),
          child: const Icon(
            Icons.bluetooth_disabled_rounded,
            color: Colors.orange,
            size: 44,
          ),
        );
      case _ScanPhase.motivo:
        return Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            color: widget.gradientColors[0].withOpacity(0.15),
            shape: BoxShape.circle,
          ),
          child: Icon(
            Icons.edit_note_rounded,
            color: widget.gradientColors[0],
            size: 44,
          ),
        );
    }
  }

  // ── Contenido por fase ──
  Widget _buildContent() {
    switch (_phase) {
      case _ScanPhase.scanning:
        return _buildScanningContent();
      case _ScanPhase.success:
        return const Text(
          'Presencia confirmada ✓',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.green, fontSize: 14),
        );
      case _ScanPhase.failed:
        return _buildFailedContent();
      case _ScanPhase.motivo:
        return _buildMotivoContent();
    }
  }

  Widget _buildScanningContent() {
    final palette = context.uatPalette;

    return Column(
      children: [
        Text(
          'Verificando tu ubicación en el salón...',
          textAlign: TextAlign.center,
          style: TextStyle(color: palette.textSecondary, fontSize: 14),
        ),
        if (_lastDeviceFound != null) ...[
          const SizedBox(height: 8),
          Text(
            'Último: $_lastDeviceFound',
            textAlign: TextAlign.center,
            style: TextStyle(color: palette.textTertiary, fontSize: 12),
          ),
        ],
        const SizedBox(height: 16),
        SizedBox(
          width: 28,
          height: 28,
          child: CircularProgressIndicator(
            strokeWidth: 2.5,
            valueColor: AlwaysStoppedAnimation<Color>(widget.gradientColors[0]),
          ),
        ),
        const SizedBox(height: 20),
        TextButton(
          onPressed: () {
            widget.bleService.cancelScan();
            Navigator.of(context).pop();
          },
          child: Text(
            'Cancelar',
            style: TextStyle(color: palette.textSecondary, fontSize: 16),
          ),
        ),
      ],
    );
  }

  Widget _buildFailedContent() {
    final palette = context.uatPalette;

    return Column(
      children: [
        Text(
          widget.permitirMotivo
              ? 'No pudimos verificar tu ubicación.\nPuedes reintentar o indicar un motivo.'
              : 'No pudimos verificar tu ubicación.\nAcércate al beacon e inténtalo de nuevo.',
          textAlign: TextAlign.center,
          style: TextStyle(color: palette.textSecondary, fontSize: 14),
        ),
        const SizedBox(height: 20),
        // Reintentar
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: () {
              _pulseController.repeat(reverse: true);
              _startScan();
            },
            icon: const Icon(Icons.refresh_rounded, size: 20),
            label: const Text(
              'Reintentar',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
            style: ElevatedButton.styleFrom(
              backgroundColor: widget.gradientColors[0],
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
        ),
        if (widget.permitirMotivo) ...[
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () {
                setState(() {
                  _phase = _ScanPhase.motivo;
                  _statusText = 'Indica el motivo';
                });
              },
              icon: const Icon(Icons.edit_note_rounded, size: 20),
              label: const Text(
                'Marcar con motivo',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
              ),
              style: OutlinedButton.styleFrom(
                foregroundColor: palette.textSecondary,
                side: BorderSide(color: palette.border),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
        ],
        const SizedBox(height: 8),
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(
            'Cancelar',
            style: TextStyle(color: palette.textTertiary, fontSize: 14),
          ),
        ),
      ],
    );
  }

  Widget _buildMotivoContent() {
    final palette = context.uatPalette;

    return Column(
      children: [
        Text(
          'Selecciona el motivo por el cual\nno se detectó el sensor:',
          textAlign: TextAlign.center,
          style: TextStyle(color: palette.textSecondary, fontSize: 14),
        ),
        const SizedBox(height: 16),
        // Motivos predefinidos
        ..._motivosPredefinidos.map(
          (motivo) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: () => _seleccionarMotivo(motivo),
                style: OutlinedButton.styleFrom(
                  foregroundColor: palette.textPrimary,
                  side: BorderSide(color: palette.border),
                  padding: const EdgeInsets.symmetric(
                    vertical: 14,
                    horizontal: 16,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  backgroundColor: palette.surfaceMuted,
                ),
                child: Text(
                  motivo,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ),
          ),
        ),
        // Campo "Otro"
        const SizedBox(height: 4),
        Container(
          decoration: BoxDecoration(
            color: palette.surfaceMuted,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: palette.border),
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _otroMotivoController,
                  style: TextStyle(color: palette.textPrimary, fontSize: 14),
                  decoration: InputDecoration(
                    hintText: 'Otro motivo...',
                    hintStyle: TextStyle(color: palette.textTertiary),
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 14,
                    ),
                  ),
                ),
              ),
              IconButton(
                onPressed: () {
                  final texto = _otroMotivoController.text.trim();
                  if (texto.isNotEmpty) {
                    _seleccionarMotivo(texto);
                  }
                },
                icon: Icon(
                  Icons.send_rounded,
                  color: widget.gradientColors[0],
                  size: 22,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        TextButton(
          onPressed: () {
            setState(() {
              _phase = _ScanPhase.failed;
              _statusText = 'No se detectó el beacon';
            });
          },
          child: Text(
            'Volver',
            style: TextStyle(color: palette.textTertiary, fontSize: 14),
          ),
        ),
      ],
    );
  }
}

enum _ScanPhase { scanning, success, failed, motivo }
