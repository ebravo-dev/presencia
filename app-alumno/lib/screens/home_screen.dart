import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../services/attendance_session_service.dart';
import '../services/ble_advertiser_service.dart';
import '../services/local_storage_service.dart';
import '../services/student_auth_service.dart';

const _bg = Color(0xFFF7FAFE);
const _surface = Color(0xFFFFFFFF);
const _text = Color(0xFF131825);
const _muted = Color(0xFF65728B);
const _blue = Color(0xFF2348ED);
const _blue2 = Color(0xFF5081FF);
const _green = Color(0xFF10AF74);
const _yellow = Color(0xFFF59E0B);
const _red = Color(0xFFED4444);
const _line = Color(0xFFDAE2F0);
const _softBlue = Color(0xFFE0ECFF);

class HomeScreen extends StatefulWidget {
  final LocalStorageService storage;
  final BleAdvertiserService bleService;
  final AttendanceSessionService attendanceSession;
  final StudentAuthService studentAuthService;

  const HomeScreen({
    super.key,
    required this.storage,
    required this.bleService,
    required this.attendanceSession,
    required this.studentAuthService,
  });

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  int _tabIndex = 0;
  AdvertiserState _advState = AdvertiserState.idle;
  AttendanceSessionState _sessionState = AttendanceSessionState.idle;
  String _statusText = 'Listo para pasar lista';
  String? _lastConfirmation;
  DateTime? _lastConfirmationAt;
  bool _syncingAcademicInfo = false;
  String? _academicSyncMessage;
  bool _academicSyncError = false;

  StreamSubscription<AdvertiserState>? _stateSub;
  StreamSubscription<String>? _confirmSub;
  StreamSubscription<AttendanceSessionSnapshot>? _sessionSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    _stateSub = widget.bleService.stateStream.listen((state) {
      if (!mounted) return;
      setState(() {
        _advState = state;
        if (_sessionState != AttendanceSessionState.broadcasting) {
          _statusText = _textForAdvertiser(state);
        }
      });
    });

    _confirmSub = widget.bleService.confirmationStream.listen((message) {
      if (!mounted) return;
      setState(() {
        _lastConfirmation = message;
        _lastConfirmationAt = DateTime.now();
        _statusText = 'Asistencia registrada';
      });
      Future.delayed(const Duration(seconds: 5), () {
        if (!mounted || _lastConfirmation != message) return;
        setState(() {
          _lastConfirmation = null;
          _statusText = _textForSession(_sessionState);
        });
      });
    });

    _sessionSub = widget.attendanceSession.stateStream.listen((snapshot) {
      if (!mounted) return;
      setState(() {
        _sessionState = snapshot.state;
        _statusText = snapshot.message ?? _textForSession(snapshot.state);
      });
    });

    _advState = widget.bleService.currentState;
    _sessionState = widget.attendanceSession.currentState;
    _statusText = _textForSession(_sessionState);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused && _isActive) {
      widget.attendanceSession.stop();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _stateSub?.cancel();
    _confirmSub?.cancel();
    _sessionSub?.cancel();
    super.dispose();
  }

  bool get _isActive => _advState == AdvertiserState.advertising;
  bool get _isChecking => _sessionState == AttendanceSessionState.checkingRoom;
  bool get _isConfirmed => _lastConfirmation != null;
  bool get _isBusy => _isActive || _isChecking;
  bool get _hasError =>
      _advState == AdvertiserState.error ||
      _sessionState == AttendanceSessionState.error ||
      _sessionState == AttendanceSessionState.roomNotFound ||
      _sessionState == AttendanceSessionState.missingRoomBeacon;
  bool get _bluetoothOff =>
      _advState == AdvertiserState.bluetoothOff ||
      _sessionState == AttendanceSessionState.bluetoothOff;

  String _textForAdvertiser(AdvertiserState state) {
    switch (state) {
      case AdvertiserState.advertising:
        return 'Esperando confirmación';
      case AdvertiserState.bluetoothOff:
        return 'Activa Bluetooth';
      case AdvertiserState.error:
        return 'Revisa permisos y Bluetooth';
      case AdvertiserState.idle:
        return 'Listo para pasar lista';
    }
  }

  String _textForSession(AttendanceSessionState state) {
    switch (state) {
      case AttendanceSessionState.checkingRoom:
        return 'Validando aula';
      case AttendanceSessionState.roomVerified:
        return 'Aula validada';
      case AttendanceSessionState.broadcasting:
        return 'Esperando confirmación';
      case AttendanceSessionState.bluetoothOff:
        return 'Activa Bluetooth';
      case AttendanceSessionState.missingRoomBeacon:
      case AttendanceSessionState.roomNotFound:
        return 'No pudimos validar tu clase';
      case AttendanceSessionState.error:
        return 'Revisa permisos y Bluetooth';
      case AttendanceSessionState.idle:
        return 'Listo para pasar lista';
    }
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      _buildHomeTab(),
      _buildDashboardTab(),
      _buildScheduleTab(),
      _buildStatsTab(),
      _buildProfileTab(),
    ];

    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        child: Stack(
          children: [
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 220),
              child: KeyedSubtree(
                key: ValueKey(_tabIndex),
                child: pages[_tabIndex],
              ),
            ),
            Align(
              alignment: Alignment.bottomCenter,
              child: _StudentBottomNav(
                index: _tabIndex,
                onChanged: (index) {
                  HapticFeedback.selectionClick();
                  setState(() => _tabIndex = index);
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHomeTab() {
    final visual = _visualState;
    return _PageShell(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _TopHeader(
            title: 'Hola, $_studentName',
            subtitle: _todayLabel(),
            trailing: const _NotificationButton(),
          ),
          const SizedBox(height: 18),
          _ClassCard(
            label: _isActive ? 'Clase actual' : 'Siguiente clase',
            subject: 'Arquitectura de software',
            detail: 'Aula B-204 | 10:00 - 11:30',
            chip: _classChipLabel,
            chipColor: visual.accent,
          ),
          const SizedBox(height: 22),
          Text(
            _guideMessage,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: _muted,
              fontSize: 14,
              fontWeight: FontWeight.w600,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 22),
          Center(
            child: _AttendanceButton(
              label: _primaryActionLabel,
              icon: visual.icon,
              active: _isBusy,
              confirmed: _isConfirmed,
              danger: _isActive,
              disabled: false,
              onPressed: _toggleAttendance,
            ),
          ),
          const SizedBox(height: 24),
          _StatusCard(
            statusText: _statusText,
            title: _statusTitle,
            body: _statusBody,
            color: visual.accent,
            icon: visual.smallIcon,
          ),
          const SizedBox(height: 14),
          _LastAttendanceCard(lastTime: _lastConfirmationAt, percentage: 92),
        ],
      ),
    );
  }

  Widget _buildDashboardTab() {
    return _PageShell(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _TopHeader(
            title: 'Panel',
            subtitle: 'Resumen del semestre',
            trailing: _SmallCircleIcon(icon: Icons.insights_rounded),
          ),
          const SizedBox(height: 18),
          const _OverviewCard(),
          const SizedBox(height: 14),
          Row(
            children: const [
              Expanded(
                child: _MetricCard(
                  label: 'Asistencias',
                  value: '42',
                  icon: Icons.check_circle_rounded,
                  color: _green,
                ),
              ),
              SizedBox(width: 12),
              Expanded(
                child: _MetricCard(
                  label: 'Faltas',
                  value: '3',
                  icon: Icons.cancel_rounded,
                  color: _red,
                ),
              ),
              SizedBox(width: 12),
              Expanded(
                child: _MetricCard(
                  label: 'Retardos',
                  value: '2',
                  icon: Icons.schedule_rounded,
                  color: _yellow,
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          const _SectionTitle('Materias'),
          const SizedBox(height: 10),
          const _SubjectProgress(
            subject: 'Base de datos II',
            percent: 0.96,
            color: _green,
          ),
          const SizedBox(height: 10),
          const _SubjectProgress(subject: 'Redes', percent: 0.90, color: _blue),
          const SizedBox(height: 10),
          const _SubjectProgress(
            subject: 'Probabilidad',
            percent: 0.84,
            color: _yellow,
          ),
        ],
      ),
    );
  }

  Widget _buildScheduleTab() {
    return _PageShell(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _TopHeader(
            title: 'Horario',
            subtitle: 'Clases de hoy',
            trailing: _SmallCircleIcon(icon: Icons.calendar_month_rounded),
          ),
          const SizedBox(height: 18),
          const _DaySelector(),
          const SizedBox(height: 18),
          const _TimelineItem(
            time: '08:00',
            subject: 'Base de datos II',
            room: 'Lab C-102',
            status: 'Registrada',
            color: _green,
            first: true,
          ),
          const _TimelineItem(
            time: '10:00',
            subject: 'Arquitectura de software',
            room: 'Aula B-204',
            status: 'Pendiente',
            color: _blue,
          ),
          const _TimelineItem(
            time: '12:00',
            subject: 'Redes',
            room: 'Aula A-110',
            status: 'Próxima',
            color: _yellow,
          ),
          const _TimelineItem(
            time: '14:00',
            subject: 'Probabilidad',
            room: 'Aula D-008',
            status: 'Sin iniciar',
            color: _muted,
            last: true,
          ),
        ],
      ),
    );
  }

  Widget _buildStatsTab() {
    return _PageShell(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _TopHeader(
            title: 'Stats',
            subtitle: 'Tendencia y riesgo',
            trailing: _SmallCircleIcon(icon: Icons.bar_chart_rounded),
          ),
          const SizedBox(height: 18),
          const _WeeklyChartCard(),
          const SizedBox(height: 14),
          const _RiskCard(),
          const SizedBox(height: 14),
          const _HeatmapCard(),
        ],
      ),
    );
  }

  Widget _buildProfileTab() {
    return _PageShell(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _TopHeader(
            title: 'Perfil',
            subtitle: 'Credencial y ajustes',
            trailing: _SmallCircleIcon(icon: Icons.person_rounded),
          ),
          const SizedBox(height: 18),
          _ProfileCard(
            name: _studentName,
            email: widget.storage.institutionalEmail,
            matricula: widget.storage.matricula,
          ),
          const SizedBox(height: 14),
          _DigitalCredential(
            matricula: widget.storage.matricula,
            uuid: widget.storage.attendanceUuid,
          ),
          const SizedBox(height: 14),
          _AcademicSyncPanel(
            syncing: _syncingAcademicInfo,
            message: _academicSyncMessage,
            hasError: _academicSyncError,
            onSync: _syncAcademicInfo,
          ),
          const SizedBox(height: 14),
          const _SettingsList(),
        ],
      ),
    );
  }

  Future<void> _toggleAttendance() async {
    HapticFeedback.mediumImpact();
    if (_isActive || _isChecking) {
      await widget.attendanceSession.stop();
    } else {
      await widget.attendanceSession.start();
    }
  }

  Future<void> _syncAcademicInfo() async {
    if (_syncingAcademicInfo) return;
    setState(() {
      _syncingAcademicInfo = true;
      _academicSyncError = false;
      _academicSyncMessage = 'Sincronizando información UAT...';
    });

    try {
      final result = await widget.studentAuthService.syncAcademicInfo(
        widget.storage,
      );
      if (!mounted) return;
      setState(() {
        _syncingAcademicInfo = false;
        _academicSyncError = false;
        _academicSyncMessage =
            'Listo: ${result.scheduleCount} horarios, '
            '${result.partialGradesCount} parciales y '
            '${result.finalGradesCount} finales.';
      });
    } on StudentAuthException catch (error) {
      if (!mounted) return;
      setState(() {
        _syncingAcademicInfo = false;
        _academicSyncError = true;
        _academicSyncMessage = error.authenticationFailed
            ? 'Tu contraseña UAT cambió o ya no es válida. El pase de lista sigue funcionando.'
            : error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _syncingAcademicInfo = false;
        _academicSyncError = true;
        _academicSyncMessage =
            'No se pudo sincronizar. El pase de lista sigue funcionando.';
      });
    }
  }

  _VisualState get _visualState {
    if (_isConfirmed) {
      return const _VisualState(
        accent: _green,
        icon: Icons.check_rounded,
        smallIcon: Icons.verified_rounded,
      );
    }
    if (_isActive) {
      return const _VisualState(
        accent: _green,
        icon: Icons.sensors_rounded,
        smallIcon: Icons.radio_button_checked_rounded,
      );
    }
    if (_isChecking) {
      return const _VisualState(
        accent: _yellow,
        icon: Icons.sync_rounded,
        smallIcon: Icons.hourglass_top_rounded,
      );
    }
    if (_hasError || _bluetoothOff) {
      return const _VisualState(
        accent: _red,
        icon: Icons.priority_high_rounded,
        smallIcon: Icons.error_rounded,
      );
    }
    return const _VisualState(
      accent: _blue,
      icon: Icons.check_rounded,
      smallIcon: Icons.phone_android_rounded,
    );
  }

  String get _studentName {
    final email = widget.storage.institutionalEmail.trim();
    if (email.contains('@')) {
      final raw = email.split('@').first.replaceAll('.', ' ');
      if (raw.isNotEmpty) {
        return raw
            .split(' ')
            .where((part) => part.isNotEmpty)
            .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
            .join(' ');
      }
    }
    return 'Estudiante';
  }

  String get _classChipLabel {
    if (_isConfirmed) return 'Registrada';
    if (_isActive) return 'En curso';
    if (_isChecking) return 'Validando';
    if (_hasError || _bluetoothOff) return 'Revisar';
    return 'Pendiente';
  }

  String get _primaryActionLabel {
    if (_isActive) return 'Detener';
    if (_isChecking) return 'Cancelar';
    if (_hasError || _bluetoothOff) return 'Reintentar';
    return 'Pasar lista';
  }

  String get _guideMessage {
    if (_isConfirmed) return 'Tu asistencia quedó confirmada por el profesor.';
    if (_isActive) {
      return 'Mantén tu celular cerca mientras el profesor pasa lista.';
    }
    if (_isChecking) return 'Estamos validando que estés en el aula correcta.';
    if (_bluetoothOff) return 'Activa Bluetooth para registrar tu asistencia.';
    if (_hasError) {
      return 'Revisa permisos, Bluetooth o que estés en el aula correcta.';
    }
    return 'Presiona el botón cuando el profesor pida hacer el pase de lista.';
  }

  String get _statusTitle {
    if (_isConfirmed) return 'Asistencia registrada';
    if (_isActive) return 'Pase de lista activo';
    if (_isChecking) return 'Validando contexto';
    if (_bluetoothOff) return 'Bluetooth requerido';
    if (_hasError) return 'No pudimos validar tu asistencia';
    return 'Última indicación';
  }

  String get _statusBody {
    if (_isConfirmed) return 'Materia: Arquitectura de software';
    if (_isActive) return 'Esperando lectura del profesor.';
    if (_isChecking) return 'Esto puede tomar unos segundos.';
    if (_bluetoothOff) return 'Activa Bluetooth y vuelve a intentarlo.';
    if (_hasError) {
      return 'Revisa que estés en el aula correcta e intenta de nuevo.';
    }
    return 'Tu celular está vinculado y listo para participar.';
  }
}

class _PageShell extends StatelessWidget {
  final Widget child;

  const _PageShell({required this.child});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 118),
          child: Center(
            child: ConstrainedBox(
              constraints: BoxConstraints(
                minHeight: constraints.maxHeight - 132,
                maxWidth: 520,
              ),
              child: child,
            ),
          ),
        );
      },
    );
  }
}

class _TopHeader extends StatelessWidget {
  final String title;
  final String subtitle;
  final Widget trailing;

  const _TopHeader({
    required this.title,
    required this.subtitle,
    required this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: _text,
                  fontSize: 27,
                  fontWeight: FontWeight.w900,
                  height: 1.08,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                subtitle,
                style: const TextStyle(
                  color: _muted,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 12),
        trailing,
      ],
    );
  }
}

class _NotificationButton extends StatelessWidget {
  const _NotificationButton();

  @override
  Widget build(BuildContext context) {
    return const _SmallCircleIcon(icon: Icons.notifications_none_rounded);
  }
}

class _SmallCircleIcon extends StatelessWidget {
  final IconData icon;

  const _SmallCircleIcon({required this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 46,
      height: 46,
      decoration: BoxDecoration(
        color: _surface,
        shape: BoxShape.circle,
        border: Border.all(color: _line),
        boxShadow: [
          BoxShadow(
            color: _blue.withValues(alpha: 0.08),
            blurRadius: 18,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Icon(icon, color: _blue, size: 23),
    );
  }
}

class _ClassCard extends StatelessWidget {
  final String label;
  final String subject;
  final String detail;
  final String chip;
  final Color chipColor;

  const _ClassCard({
    required this.label,
    required this.subject,
    required this.detail,
    required this.chip,
    required this.chipColor,
  });

  @override
  Widget build(BuildContext context) {
    return _Card(
      padding: const EdgeInsets.all(20),
      child: Row(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: _softBlue,
              borderRadius: BorderRadius.circular(18),
            ),
            child: const Icon(Icons.menu_book_rounded, color: _blue, size: 27),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    color: _muted,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  subject,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: _text,
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  detail,
                  style: const TextStyle(
                    color: _muted,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          _Chip(label: chip, color: chipColor),
        ],
      ),
    );
  }
}

class _AttendanceButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool active;
  final bool confirmed;
  final bool danger;
  final bool disabled;
  final VoidCallback onPressed;

  const _AttendanceButton({
    required this.label,
    required this.icon,
    required this.active,
    required this.confirmed,
    required this.danger,
    required this.disabled,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    final colors = danger
        ? const [Color(0xFFFF7B7B), _red]
        : confirmed
        ? const [_green, Color(0xFF34D399)]
        : const [_blue, _green];

    return Semantics(
      button: true,
      label: label,
      child: GestureDetector(
        onTap: disabled ? null : onPressed,
        child: AnimatedScale(
          duration: const Duration(milliseconds: 140),
          scale: active ? 0.97 : 1,
          child: Stack(
            alignment: Alignment.center,
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 260),
                width: 204,
                height: 204,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: colors.last.withValues(alpha: 0.10),
                  boxShadow: [
                    BoxShadow(
                      color: colors.first.withValues(alpha: 0.18),
                      blurRadius: 42,
                      spreadRadius: 12,
                    ),
                  ],
                ),
              ),
              Container(
                width: 168,
                height: 168,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: colors,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: colors.first.withValues(alpha: 0.34),
                      blurRadius: 28,
                      offset: const Offset(0, 18),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(icon, color: Colors.white, size: 43),
                    const SizedBox(height: 10),
                    Text(
                      label,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  final String statusText;
  final String title;
  final String body;
  final Color color;
  final IconData icon;

  const _StatusCard({
    required this.statusText,
    required this.title,
    required this.body,
    required this.color,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(icon, color: color),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 180),
                  child: Text(
                    statusText,
                    key: ValueKey(statusText),
                    style: const TextStyle(
                      color: _text,
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '$title. $body',
                  style: const TextStyle(
                    color: _muted,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    height: 1.3,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LastAttendanceCard extends StatelessWidget {
  final DateTime? lastTime;
  final int percentage;

  const _LastAttendanceCard({required this.lastTime, required this.percentage});

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Row(
        children: [
          const Icon(Icons.history_rounded, color: _blue, size: 28),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Última asistencia',
                  style: TextStyle(
                    color: _text,
                    fontSize: 15,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  lastTime == null
                      ? 'Sin registro reciente'
                      : 'Arquitectura de software | ${_formatTime(lastTime!)}',
                  style: const TextStyle(
                    color: _muted,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          Text(
            '$percentage%',
            style: const TextStyle(
              color: _green,
              fontSize: 24,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _OverviewCard extends StatelessWidget {
  const _OverviewCard();

  @override
  Widget build(BuildContext context) {
    return _Card(
      padding: const EdgeInsets.all(22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Asistencia global',
                  style: TextStyle(
                    color: _text,
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              _Chip(label: 'Riesgo bajo', color: _green),
            ],
          ),
          const SizedBox(height: 18),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: const [
              Text(
                '92',
                style: TextStyle(
                  color: _blue,
                  fontSize: 58,
                  fontWeight: FontWeight.w900,
                  height: 0.95,
                ),
              ),
              Padding(
                padding: EdgeInsets.only(bottom: 8),
                child: Text(
                  '%',
                  style: TextStyle(
                    color: _blue,
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: const LinearProgressIndicator(
              value: 0.92,
              minHeight: 10,
              backgroundColor: _softBlue,
              valueColor: AlwaysStoppedAnimation<Color>(_blue),
            ),
          ),
        ],
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _MetricCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return _Card(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 12),
          Text(
            value,
            style: const TextStyle(
              color: _text,
              fontSize: 25,
              fontWeight: FontWeight.w900,
            ),
          ),
          Text(
            label,
            style: const TextStyle(
              color: _muted,
              fontSize: 11,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _SubjectProgress extends StatelessWidget {
  final String subject;
  final double percent;
  final Color color;

  const _SubjectProgress({
    required this.subject,
    required this.percent,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return _Card(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  subject,
                  style: const TextStyle(
                    color: _text,
                    fontSize: 14,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              Text(
                '${(percent * 100).round()}%',
                style: TextStyle(
                  color: color,
                  fontSize: 13,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: percent,
              minHeight: 8,
              backgroundColor: _softBlue,
              valueColor: AlwaysStoppedAnimation<Color>(color),
            ),
          ),
        ],
      ),
    );
  }
}

class _DaySelector extends StatelessWidget {
  const _DaySelector();

  @override
  Widget build(BuildContext context) {
    const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return SizedBox(
      height: 74,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: days.length,
        separatorBuilder: (context, index) => const SizedBox(width: 10),
        itemBuilder: (context, index) {
          final selected = index == 2;
          return Container(
            width: 58,
            decoration: BoxDecoration(
              color: selected ? _blue : _surface,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: selected ? _blue : _line),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  days[index],
                  style: TextStyle(
                    color: selected ? Colors.white : _muted,
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  '${8 + index}',
                  style: TextStyle(
                    color: selected ? Colors.white : _text,
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _TimelineItem extends StatelessWidget {
  final String time;
  final String subject;
  final String room;
  final String status;
  final Color color;
  final bool first;
  final bool last;

  const _TimelineItem({
    required this.time,
    required this.subject,
    required this.room,
    required this.status,
    required this.color,
    this.first = false,
    this.last = false,
  });

  @override
  Widget build(BuildContext context) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 58,
            child: Column(
              children: [
                if (!first) Expanded(child: Container(width: 2, color: _line)),
                Container(
                  width: 14,
                  height: 14,
                  decoration: BoxDecoration(
                    color: color,
                    shape: BoxShape.circle,
                  ),
                ),
                if (!last) Expanded(child: Container(width: 2, color: _line)),
              ],
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _Card(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    SizedBox(
                      width: 48,
                      child: Text(
                        time,
                        style: const TextStyle(
                          color: _muted,
                          fontSize: 13,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            subject,
                            style: const TextStyle(
                              color: _text,
                              fontSize: 15,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            room,
                            style: const TextStyle(
                              color: _muted,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    _Chip(label: status, color: color),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _WeeklyChartCard extends StatelessWidget {
  const _WeeklyChartCard();

  @override
  Widget build(BuildContext context) {
    const values = [0.72, 0.86, 0.78, 0.94, 0.90, 0.98];
    const labels = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
    return _Card(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: const [
              Expanded(child: _SectionTitle('Asistencia semanal')),
              _Chip(label: '+6%', color: _green),
            ],
          ),
          const SizedBox(height: 18),
          SizedBox(
            height: 140,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: List.generate(values.length, (index) {
                return Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 5),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Expanded(
                          child: Align(
                            alignment: Alignment.bottomCenter,
                            child: FractionallySizedBox(
                              heightFactor: values[index],
                              widthFactor: 0.78,
                              child: Container(
                                decoration: BoxDecoration(
                                  color: index == values.length - 1
                                      ? _blue
                                      : _softBlue,
                                  borderRadius: BorderRadius.circular(999),
                                ),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          labels[index],
                          style: const TextStyle(
                            color: _muted,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }),
            ),
          ),
        ],
      ),
    );
  }
}

class _RiskCard extends StatelessWidget {
  const _RiskCard();

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: _green.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Icon(Icons.shield_rounded, color: _green),
          ),
          const SizedBox(width: 14),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Predicción de riesgo',
                  style: TextStyle(
                    color: _text,
                    fontSize: 15,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                SizedBox(height: 4),
                Text(
                  'Riesgo bajo. Mantén al menos 85% esta semana.',
                  style: TextStyle(
                    color: _muted,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    height: 1.3,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _HeatmapCard extends StatelessWidget {
  const _HeatmapCard();

  @override
  Widget build(BuildContext context) {
    final colors = [_green, _green, _softBlue, _blue, _yellow, _line];
    return _Card(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionTitle('Mapa semanal'),
          const SizedBox(height: 14),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: 18,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 6,
              crossAxisSpacing: 8,
              mainAxisSpacing: 8,
            ),
            itemBuilder: (context, index) {
              return Container(
                decoration: BoxDecoration(
                  color: colors[index % colors.length],
                  borderRadius: BorderRadius.circular(10),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _ProfileCard extends StatelessWidget {
  final String name;
  final String email;
  final String matricula;

  const _ProfileCard({
    required this.name,
    required this.email,
    required this.matricula,
  });

  @override
  Widget build(BuildContext context) {
    return _Card(
      padding: const EdgeInsets.all(20),
      child: Row(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(colors: [_blue, _blue2]),
            ),
            child: Center(
              child: Text(
                name.isEmpty ? 'E' : name[0].toUpperCase(),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 24,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: _text,
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  email.isEmpty ? 'Alumno UAT' : email,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: _muted,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  'Matrícula $matricula',
                  style: const TextStyle(
                    color: _blue,
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DigitalCredential extends StatelessWidget {
  final String matricula;
  final String uuid;

  const _DigitalCredential({required this.matricula, required this.uuid});

  @override
  Widget build(BuildContext context) {
    return _Card(
      padding: const EdgeInsets.all(20),
      child: Row(
        children: [
          _QrMock(value: uuid),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Credencial digital',
                  style: TextStyle(
                    color: _text,
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'ID $matricula',
                  style: const TextStyle(
                    color: _muted,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'Usada para validar tu dispositivo durante el pase de lista.',
                  style: TextStyle(
                    color: _muted,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    height: 1.3,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _QrMock extends StatelessWidget {
  final String value;

  const _QrMock({required this.value});

  @override
  Widget build(BuildContext context) {
    final seed = value.codeUnits.fold<int>(0, (sum, item) => sum + item);
    return Container(
      width: 92,
      height: 92,
      padding: const EdgeInsets.all(9),
      decoration: BoxDecoration(
        color: _softBlue,
        borderRadius: BorderRadius.circular(20),
      ),
      child: GridView.builder(
        physics: const NeverScrollableScrollPhysics(),
        itemCount: 49,
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 7,
          crossAxisSpacing: 3,
          mainAxisSpacing: 3,
        ),
        itemBuilder: (context, index) {
          final filled = (index + seed) % 3 != 0 || index % 8 == 0;
          return DecoratedBox(
            decoration: BoxDecoration(
              color: filled ? _text : Colors.transparent,
              borderRadius: BorderRadius.circular(2),
            ),
          );
        },
      ),
    );
  }
}

class _AcademicSyncPanel extends StatelessWidget {
  final bool syncing;
  final String? message;
  final bool hasError;
  final VoidCallback onSync;

  const _AcademicSyncPanel({
    required this.syncing,
    required this.message,
    required this.hasError,
    required this.onSync,
  });

  @override
  Widget build(BuildContext context) {
    final accent = hasError ? _red : _blue;
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Icons.cloud_sync_rounded, color: accent, size: 23),
              const SizedBox(width: 10),
              const Expanded(
                child: Text(
                  'Sincronización',
                  style: TextStyle(
                    color: _text,
                    fontSize: 15,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              TextButton.icon(
                onPressed: syncing ? null : onSync,
                icon: syncing
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.refresh_rounded, size: 18),
                label: Text(syncing ? 'Sync' : 'Actualizar'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            message ??
                'Horario y calificaciones son opcionales. Tu pase de lista funciona aunque no se sincronicen.',
            style: TextStyle(
              color: hasError ? _red : _muted,
              fontSize: 12,
              fontWeight: FontWeight.w600,
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }
}

class _SettingsList extends StatelessWidget {
  const _SettingsList();

  @override
  Widget build(BuildContext context) {
    return _Card(
      padding: EdgeInsets.zero,
      child: Column(
        children: const [
          _SettingsRow(
            icon: Icons.notifications_rounded,
            label: 'Notificaciones',
          ),
          _Divider(),
          _SettingsRow(icon: Icons.lock_rounded, label: 'Privacidad'),
          _Divider(),
          _SettingsRow(
            icon: Icons.bluetooth_rounded,
            label: 'Dispositivo vinculado',
          ),
        ],
      ),
    );
  }
}

class _SettingsRow extends StatelessWidget {
  final IconData icon;
  final String label;

  const _SettingsRow({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
      child: Row(
        children: [
          Icon(icon, color: _blue, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                color: _text,
                fontSize: 14,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          const Icon(Icons.chevron_right_rounded, color: _muted),
        ],
      ),
    );
  }
}

class _StudentBottomNav extends StatelessWidget {
  final int index;
  final ValueChanged<int> onChanged;

  const _StudentBottomNav({required this.index, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    const items = [
      (Icons.home_rounded, 'Inicio'),
      (Icons.dashboard_rounded, 'Panel'),
      (Icons.calendar_month_rounded, 'Horario'),
      (Icons.bar_chart_rounded, 'Stats'),
      (Icons.person_rounded, 'Perfil'),
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Container(
        height: 74,
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: _surface,
          borderRadius: BorderRadius.circular(26),
          border: Border.all(color: _line),
          boxShadow: [
            BoxShadow(
              color: _blue.withValues(alpha: 0.12),
              blurRadius: 28,
              offset: const Offset(0, 16),
            ),
          ],
        ),
        child: Row(
          children: List.generate(items.length, (itemIndex) {
            final selected = index == itemIndex;
            final item = items[itemIndex];
            return Expanded(
              child: InkWell(
                borderRadius: BorderRadius.circular(18),
                onTap: () => onChanged(itemIndex),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  decoration: BoxDecoration(
                    color: selected ? _softBlue : Colors.transparent,
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(item.$1, color: selected ? _blue : _muted, size: 22),
                      const SizedBox(height: 3),
                      Text(
                        item.$2,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: selected ? _blue : _muted,
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }),
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;

  const _Card({required this.child, this.padding = const EdgeInsets.all(16)});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: _line),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF2348ED).withValues(alpha: 0.06),
            blurRadius: 20,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: child,
    );
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final Color color;

  const _Chip({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String text;

  const _SectionTitle(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        color: _text,
        fontSize: 17,
        fontWeight: FontWeight.w900,
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider();

  @override
  Widget build(BuildContext context) {
    return const Divider(height: 1, color: _line, indent: 16, endIndent: 16);
  }
}

class _VisualState {
  final Color accent;
  final IconData icon;
  final IconData smallIcon;

  const _VisualState({
    required this.accent,
    required this.icon,
    required this.smallIcon,
  });
}

String _todayLabel() {
  final now = DateTime.now();
  const days = [
    'lunes',
    'martes',
    'miércoles',
    'jueves',
    'viernes',
    'sábado',
    'domingo',
  ];
  const months = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];
  return '${days[now.weekday - 1]}, ${now.day} de ${months[now.month - 1]}';
}

String _formatTime(DateTime value) {
  return '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
}
