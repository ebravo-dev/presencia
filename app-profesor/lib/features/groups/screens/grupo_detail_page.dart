import 'dart:ui';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../shared/models/grupo.dart';
import '../../../shared/models/asistencia_registro.dart';
import '../../../services/asistencia_local_service.dart';
import 'asistencias_pendientes_page.dart';

class GrupoDetailPage extends StatefulWidget {
  final Grupo grupo;
  final List<Color> gradientColors;
  final Color accentColor;
  final String horario;
  final String dias;
  final List<Grupo>? todosLosGrupos;

  const GrupoDetailPage({
    super.key,
    required this.grupo,
    required this.gradientColors,
    required this.accentColor,
    required this.horario,
    required this.dias,
    this.todosLosGrupos,
  });

  @override
  State<GrupoDetailPage> createState() => _GrupoDetailPageState();
}

class _GrupoDetailPageState extends State<GrupoDetailPage>
    with TickerProviderStateMixin {
  // Mapa para controlar el estado de asistencia de cada estudiante
  final Map<String, bool> _asistencias = {};
  late AnimationController _buttonAnimationController;
  late AnimationController _studentsAnimationController;
  late Animation<double> _studentsOpacity;
  late Animation<Offset> _studentsSlide;
  // Control del tab seleccionado (0 = Mi asistencia, 1 = Alumnos)
  int _selectedTab = 0;
  DateTime? _entradaProfesor;
  DateTime? _salidaProfesor;
  DateTime _selectedDateTime = DateTime.now();

  // Servicio de almacenamiento local
  final AsistenciaLocalService _asistenciaService = AsistenciaLocalService();

  // Estados de sincronización: 'synced', 'pending', 'syncing'
  String _syncStatus = 'synced';

  // Timer para actualizar la hora
  Timer? _timer;

  // Para detectar pull-to-dismiss
  final ScrollController _scrollController = ScrollController();

  // Control del botón flotante para volver arriba
  bool _showScrollToTopButton = false;

  @override
  void initState() {
    super.initState();
    // Configurar status bar transparente
    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
      ),
    );

    // Cargar asistencia existente
    _cargarAsistencia();

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
    _timer?.cancel();
    _scrollController.removeListener(_scrollListener);
    _buttonAnimationController.dispose();
    _studentsAnimationController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
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
                                              widget.grupo.group,
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
            // Botones flotantes izquierda (X y fecha)
            Positioned(
              top: MediaQuery.of(context).padding.top + 8,
              left: 12,
              child: Row(
                children: [
                  // Botón X
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
                          icon: const Icon(
                            Icons.close,
                            color: Colors.white,
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
                  const SizedBox(width: 8),
                  // Botón de fecha/hora
                  GestureDetector(
                    onTap: () {
                      HapticFeedback.lightImpact();
                      _showDateTimePicker();
                    },
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
                              Text(
                                _getFormattedDateTime(),
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                              const SizedBox(width: 6),
                              const Icon(
                                Icons.edit,
                                size: 16,
                                color: Colors.white,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            // Botones flotantes derecha
            Positioned(
              top: MediaQuery.of(context).padding.top + 8,
              right: 12,
              child: ClipRRect(
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
                        // Botón de sincronización con texto
                        GestureDetector(
                          onTap: () {
                            HapticFeedback.lightImpact();

                            // Navegar a la página de pendientes
                            Navigator.of(context)
                                .push(
                                  MaterialPageRoute(
                                    builder: (context) =>
                                        AsistenciasPendientesPage(
                                          claseActual: widget.grupo.subject,
                                          grupoActualId:
                                              widget.grupo.identificadorUnico,
                                          todosLosGrupos: widget.todosLosGrupos,
                                        ),
                                  ),
                                )
                                .then((_) {
                                  // Recargar estado al regresar
                                  _cargarAsistencia();
                                });
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8),
                            alignment: Alignment.center,
                            color: Colors.transparent,
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                _buildSyncIcon(),
                                const SizedBox(width: 6),
                                Text(
                                  _syncStatus == 'pending'
                                      ? 'Pendientes'
                                      : _syncStatus == 'synced'
                                      ? 'En la nube'
                                      : '',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
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
    return GestureDetector(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              color: isSelected ? Colors.white : Colors.white.withOpacity(0.4),
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
            color: const Color(0xFF1C1C1E),
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.2),
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
                        setState(() {
                          _entradaProfesor = DateTime.now();
                        });
                        _guardarAsistencia();
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
            color: const Color(0xFF1C1C1E),
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.2),
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
                        setState(() {
                          _salidaProfesor = DateTime.now();
                        });
                        _guardarAsistencia();
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
            color: const Color(0xFF1C1C1E),
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.2),
                blurRadius: 10,
                offset: const Offset(0, 5),
              ),
            ],
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: _entradaProfesor != null && _salidaProfesor != null
                  ? () {
                      HapticFeedback.mediumImpact();
                      _intentarSincronizarAsistencia();
                    }
                  : null,
              borderRadius: BorderRadius.circular(12),
              splashColor: widget.gradientColors[0].withOpacity(0.2),
              highlightColor: widget.gradientColors[0].withOpacity(0.1),
              child: Opacity(
                opacity: _entradaProfesor != null && _salidaProfesor != null
                    ? 1.0
                    : 0.6,
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
                            color:
                                _entradaProfesor != null &&
                                    _salidaProfesor != null
                                ? Colors.white.withOpacity(0.9)
                                : Colors.white.withOpacity(0.5),
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      // Icono de flecha
                      if (_entradaProfesor != null && _salidaProfesor != null)
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

  String _formatTime(DateTime dateTime) {
    final hour = dateTime.hour.toString().padLeft(2, '0');
    final minute = dateTime.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }

  // Cargar asistencia existente para la fecha seleccionada
  void _cargarAsistencia() {
    final registro = _asistenciaService.obtenerAsistenciaPorGrupoYFecha(
      widget.grupo.identificadorUnico,
      _selectedDateTime,
    );

    if (registro != null) {
      setState(() {
        _entradaProfesor = registro.horaEntrada;
        _salidaProfesor = registro.horaSalida;
        _asistencias.clear();
        _asistencias.addAll(registro.asistenciasAlumnos);
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

    _actualizarEstadoSincronizacion();
  }

  // Guardar asistencia localmente
  Future<void> _guardarAsistencia() async {
    final registroId =
        '${widget.grupo.identificadorUnico}_${_selectedDateTime.year}-${_selectedDateTime.month}-${_selectedDateTime.day}';

    final registro = AsistenciaRegistro(
      id: registroId,
      grupoId: widget.grupo.identificadorUnico,
      profesorId: 'profesor_id', // TODO: Obtener del auth provider
      fecha: _selectedDateTime,
      horaEntrada: _entradaProfesor,
      horaSalida: _salidaProfesor,
      asistenciasAlumnos: Map.from(_asistencias),
      sincronizado: false,
      fechaCreacion: DateTime.now(),
      fechaActualizacion: DateTime.now(),
      nombreClase: widget.grupo.subject,
    );

    await _asistenciaService.guardarAsistencia(registro);
  }

  // Intentar sincronizar asistencia a la nube
  Future<void> _intentarSincronizarAsistencia() async {
    // Mostrar diálogo de progreso
    if (!mounted) return;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) {
        return Dialog(
          backgroundColor: const Color(0xFF2C2C2E),
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
                const Text(
                  'Subiendo asistencia',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Estamos guardando la asistencia\nen la nube...',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white70, fontSize: 14),
                ),
              ],
            ),
          ),
        );
      },
    );

    // Simular intento de sincronización
    // TODO: Implementar llamada real al API
    await Future.delayed(const Duration(seconds: 2));

    // Cerrar diálogo
    if (mounted) {
      Navigator.of(context).pop();
    }

    // Simular éxito/fallo aleatorio para pruebas
    // TODO: Reemplazar con lógica real de sincronización
    final exito = DateTime.now().second % 2 == 0; // Simulación temporal

    if (exito) {
      // Éxito: actualizar estado y mostrar confirmación
      setState(() {
        _syncStatus = 'synced';
      });

      if (mounted) {
        _mostrarDialogoExito();
      }
    } else {
      // Error: mantener como pendiente y mostrar mensaje
      setState(() {
        _syncStatus = 'pending';
      });

      if (mounted) {
        _mostrarDialogoErrorSincronizacion();
      }
    }
  }

  // Mostrar diálogo de éxito
  void _mostrarDialogoExito() {
    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (BuildContext context) {
        return Dialog(
          backgroundColor: const Color(0xFF2C2C2E),
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
                const Text(
                  '¡Asistencia guardada!',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'La asistencia del profesor y los alumnos\nha sido subida exitosamente a la nube.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white70, fontSize: 14),
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
        return Dialog(
          backgroundColor: const Color(0xFF2C2C2E),
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
                const Text(
                  'No se pudo subir',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'La asistencia fue guardada localmente\npero no se pudo subir a la nube.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white70, fontSize: 14),
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

  // Actualizar estado de sincronización
  void _actualizarEstadoSincronizacion() {
    final hayPendientes = _asistenciaService.hayAsistenciasPendientes();
    setState(() {
      _syncStatus = hayPendientes ? 'pending' : 'synced';
    });
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
    final weekdaysConClase = widget.grupo.weekdaysConClase;
    if (weekdaysConClase.isEmpty)
      return true; // Si no hay horario, permitir cualquier día

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
    final inicioClase = _parseHorarioInicio();
    if (inicioClase == null) return true; // Si no se puede parsear, permitir

    final now = DateTime.now();
    final ventanaInicio = inicioClase.subtract(const Duration(minutes: 10));
    final ventanaFin = inicioClase.add(const Duration(minutes: 10));

    return now.isAfter(ventanaInicio) && now.isBefore(ventanaFin);
  }

  bool _puedeMarcarSalida() {
    final finClase = _parseHorarioFin();
    if (finClase == null) return true; // Si no se puede parsear, permitir

    final now = DateTime.now();
    final ventanaInicio = finClase.subtract(const Duration(minutes: 10));
    final ventanaFin = finClase.add(const Duration(minutes: 10));

    return now.isAfter(ventanaInicio) && now.isBefore(ventanaFin);
  }

  String _getMensajeVentanaEntrada() {
    final inicioClase = _parseHorarioInicio();
    if (inicioClase == null) return '';

    final ventanaInicio = inicioClase.subtract(const Duration(minutes: 10));
    final ventanaFin = inicioClase.add(const Duration(minutes: 10));

    final horaInicio = _formatTime(ventanaInicio);
    final horaFin = _formatTime(ventanaFin);

    return 'Puedes marcar entrada entre $horaInicio y $horaFin';
  }

  String _getMensajeVentanaSalida() {
    final finClase = _parseHorarioFin();
    if (finClase == null) return '';

    final ventanaInicio = finClase.subtract(const Duration(minutes: 10));
    final ventanaFin = finClase.add(const Duration(minutes: 10));

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

  Future<void> _showDateTimePicker() async {
    // Obtener la hora actual para mantenerla cuando se cambie la fecha
    final now = DateTime.now();

    final DateTime? pickedDate = await showDatePicker(
      context: context,
      initialDate: _selectedDateTime,
      firstDate: DateTime(2020),
      lastDate: now, // No permitir fechas futuras
      locale: const Locale('es', 'MX'),
      builder: (context, child) {
        return Theme(
          data: ThemeData.dark().copyWith(
            colorScheme: ColorScheme.dark(
              primary: widget.accentColor,
              onPrimary: Colors.black, // Texto negro sobre el círculo de color
              surface: const Color(0xFF1C1C1E),
              onSurface: Colors.white,
            ),
            textButtonTheme: TextButtonThemeData(
              style: TextButton.styleFrom(
                foregroundColor:
                    widget.accentColor, // Color de los botones Cancel/OK
              ),
            ),
            dialogTheme: DialogThemeData(
              backgroundColor: const Color(0xFF1C1C1E),
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

  Widget _buildSyncIcon() {
    switch (_syncStatus) {
      case 'synced':
        // Nube rellena con el color más oscuro del gradiente y check blanco
        return Stack(
          alignment: Alignment.center,
          children: [
            Icon(
              Icons.cloud,
              color: widget.gradientColors[1], // Color más oscuro del gradiente
              size: 32,
            ),
            Icon(
              Icons.check_rounded,
              color: Colors.white,
              size: 18,
              weight: 900,
            ),
          ],
        );
      case 'pending':
        // Nube rellena con el color más oscuro del gradiente y flecha arriba blanca
        return Stack(
          alignment: Alignment.center,
          children: [
            Icon(
              Icons.cloud,
              color: widget.gradientColors[1], // Color más oscuro del gradiente
              size: 32,
            ),
            Icon(
              Icons.arrow_upward_rounded,
              color: Colors.white,
              size: 18,
              weight: 900,
            ),
          ],
        );
      case 'syncing':
        return Stack(
          alignment: Alignment.center,
          children: [
            Icon(
              Icons.cloud,
              color: widget.gradientColors[1], // Color más oscuro del gradiente
              size: 32,
            ),
            const SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
              ),
            ),
          ],
        );
      default:
        return const Icon(Icons.cloud_off, color: Colors.grey, size: 32);
    }
  }

  Widget _buildAlumnosContent() {
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
                Icon(
                  Icons.info_outline,
                  color: Colors.orange,
                  size: 24,
                ),
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
        // NOTA: Botón temporalmente oculto - código preservado para uso futuro
        // _buildPassListBTButton(),
        // const SizedBox(height: 12),
        // Lista de alumnos
        Container(
          decoration: BoxDecoration(
            color: const Color(0xFF1C1C1E),
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.2),
                blurRadius: 10,
                offset: const Offset(0, 5),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Column(
              children: List.generate(
                widget.grupo.students.length,
                (index) => _buildStudentCard(
                  widget.grupo.students[index],
                  isLast: index == widget.grupo.students.length - 1,
                ),
              ),
            ),
          ),
        ),
        // Espacio adicional al final para mejor visualización del último alumno
        const SizedBox(height: 100),
      ],
    );
  }

  Widget _buildPassListBTButton() {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF1C1C1E),
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.2),
            blurRadius: 10,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: () {
            HapticFeedback.mediumImpact();
            // TODO: Navegar a pantalla de pasar lista con Bluetooth
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: const Text('Función de pasar lista BT en desarrollo'),
                backgroundColor: widget.gradientColors[0],
                behavior: SnackBarBehavior.floating,
              ),
            );
          },
          borderRadius: BorderRadius.circular(12),
          splashColor: widget.gradientColors[0].withOpacity(0.2),
          highlightColor: widget.gradientColors[0].withOpacity(0.1),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Texto del botón
                const Text(
                  'PASAR LISTA',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(width: 8),
                // Icono de Bluetooth en óvalo azul
                Container(
                  width: 22,
                  height: 28,
                  decoration: BoxDecoration(
                    color: const Color(0xFF4A90E2),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(
                    Icons.bluetooth,
                    color: Colors.white,
                    size: 16,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStudentCard(dynamic alumno, {bool isLast = false}) {
    final puedeMarcar = _puedeMarcarAsistenciaAlumnos();
    
    return Container(
      color: const Color(0xFF1C1C1E),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: puedeMarcar ? () async {
            HapticFeedback.mediumImpact();
            setState(() {
              final currentValue =
                  _asistencias[alumno.number.toString()] ?? false;
              _asistencias[alumno.number.toString()] = !currentValue;
            });
            // Guardar en almacenamiento local
            await _guardarAsistencia();
          } : null,
          splashColor: puedeMarcar ? widget.gradientColors[0].withOpacity(0.2) : Colors.transparent,
          highlightColor: puedeMarcar ? widget.gradientColors[0].withOpacity(0.1) : Colors.transparent,
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
                        style: const TextStyle(
                          color: Colors.white,
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
                        color: (_asistencias[alumno.number.toString()] ?? false)
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
                            color:
                                (_asistencias[alumno.number.toString()] ??
                                    false)
                                ? widget.gradientColors[0]
                                : Colors.transparent,
                            border: Border.all(
                              color:
                                  (_asistencias[alumno.number.toString()] ??
                                      false)
                                  ? widget.gradientColors[0]
                                  : Colors.grey.shade600,
                              width: 2.5,
                            ),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child:
                              (_asistencias[alumno.number.toString()] ?? false)
                              ? Icon(Icons.check, color: Colors.white, size: 20)
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
                  child: Container(
                    height: 0.5,
                    color: Colors.white.withOpacity(0.1),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _showOptionsMenu(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF1C1C1E),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => Container(
        padding: const EdgeInsets.symmetric(vertical: 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey[600],
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 20),
            _buildMenuOption(
              icon: Icons.insights_rounded,
              title: 'Ver estadísticas',
              subtitle: 'Asistencia y reportes del grupo',
              onTap: () {
                Navigator.pop(context);
                // TODO: Navegar a estadísticas
              },
            ),
            _buildMenuOption(
              icon: Icons.share_rounded,
              title: 'Compartir grupo',
              subtitle: 'Enviar información del grupo',
              onTap: () {
                Navigator.pop(context);
                // TODO: Compartir grupo
              },
            ),
            _buildMenuOption(
              icon: Icons.settings_rounded,
              title: 'Configuración',
              subtitle: 'Ajustes del grupo y notificaciones',
              onTap: () {
                Navigator.pop(context);
                // TODO: Abrir configuración
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMenuOption({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 20),
          child: Row(
            children: [
              Container(
                width: 50,
                height: 50,
                decoration: BoxDecoration(
                  color: widget.gradientColors[0].withOpacity(0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: widget.gradientColors[0], size: 24),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: TextStyle(color: Colors.grey[400], fontSize: 13),
                    ),
                  ],
                ),
              ),
              Icon(
                Icons.chevron_right_rounded,
                color: Colors.grey[600],
                size: 20,
              ),
            ],
          ),
        ),
      ),
    );
  }

  // Esta función _verificarAsistenciaProfesor fue eliminada porque no se usa
}
