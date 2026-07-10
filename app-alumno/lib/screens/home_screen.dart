import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../services/attendance_session_service.dart';
import '../services/ble_advertiser_service.dart';
import '../services/local_storage_service.dart';
import '../services/student_auth_service.dart';
import 'history_screen.dart';

const _background = Color(0xFF0B0F14);
const _panel = Color(0xFF111923);
const _panelSoft = Color(0xFF10161E);
const _line = Color(0xFF223040);
const _muted = Color(0xFF8F9BA8);
const _accent = Color(0xFF62D6A2);
const _blue = Color(0xFF79A8FF);
const _warning = Color(0xFFF4B860);
const _danger = Color(0xFFFF7A70);

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
  AdvertiserState _advertiserState = AdvertiserState.idle;
  AttendanceSessionState _attendanceState = AttendanceSessionState.idle;
  String _statusText = 'Listo para pasar lista';
  String? _lastConfirmationId;
  int _historyCount = 0;
  bool _syncingData = false;
  String? _syncMessage;
  bool _syncHasError = false;

  StreamSubscription<AdvertiserState>? _advertiserSubscription;
  StreamSubscription<String>? _confirmationSubscription;
  StreamSubscription<AttendanceSessionSnapshot>? _attendanceSubscription;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    final history = widget.storage.attendanceHistory;
    _historyCount = history.length;

    _advertiserSubscription = widget.bleService.stateStream.listen((state) {
      if (!mounted) return;
      setState(() {
        _advertiserState = state;
        if (!_isConfirmed &&
            _attendanceState != AttendanceSessionState.broadcasting) {
          _statusText = _textForAdvertiser(state);
        }
      });
    });

    _confirmationSubscription = widget.bleService.confirmationStream.listen((
      _,
    ) {
      if (!mounted) return;

      final confirmationId = DateTime.now().microsecondsSinceEpoch.toString();
      final confirmedAt = DateTime.now();
      setState(() {
        _lastConfirmationId = confirmationId;
        _statusText = '¡Lista pasada!';
      });
      unawaited(_saveConfirmedAttendance(confirmedAt));
      unawaited(widget.attendanceSession.stop());

      Future<void>.delayed(const Duration(seconds: 5), () {
        if (!mounted || _lastConfirmationId != confirmationId) return;
        setState(() {
          _lastConfirmationId = null;
          _statusText = _textForAttendance(_attendanceState);
        });
      });
    });

    _attendanceSubscription = widget.attendanceSession.stateStream.listen((
      snapshot,
    ) {
      if (!mounted) return;
      setState(() {
        _attendanceState = snapshot.state;
        if (!_isConfirmed) {
          _statusText = _textForAttendance(snapshot.state);
        }
      });
    });

    _advertiserState = widget.bleService.currentState;
    _attendanceState = widget.attendanceSession.currentState;
    _statusText = _textForAttendance(_attendanceState);
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
    _advertiserSubscription?.cancel();
    _confirmationSubscription?.cancel();
    _attendanceSubscription?.cancel();
    super.dispose();
  }

  bool get _isActive => _advertiserState == AdvertiserState.advertising;
  bool get _isChecking =>
      _attendanceState == AttendanceSessionState.checkingRoom;
  bool get _isConfirmed => _lastConfirmationId != null;
  bool get _hasError =>
      _advertiserState == AdvertiserState.error ||
      _attendanceState == AttendanceSessionState.error ||
      _attendanceState == AttendanceSessionState.roomNotFound ||
      _attendanceState == AttendanceSessionState.missingRoomBeacon;
  bool get _phoneNeedsAttention =>
      _advertiserState == AdvertiserState.bluetoothOff ||
      _attendanceState == AttendanceSessionState.bluetoothOff;

  String _textForAdvertiser(AdvertiserState state) {
    switch (state) {
      case AdvertiserState.advertising:
        return 'Esperando confirmación';
      case AdvertiserState.bluetoothOff:
        return 'Revisa la configuración de tu celular';
      case AdvertiserState.error:
        return 'No pudimos preparar el pase de lista';
      case AdvertiserState.idle:
        return 'Listo para pasar lista';
    }
  }

  String _textForAttendance(AttendanceSessionState state) {
    switch (state) {
      case AttendanceSessionState.checkingRoom:
        return 'Revisando tu clase';
      case AttendanceSessionState.roomVerified:
        return 'Tu clase está lista';
      case AttendanceSessionState.broadcasting:
        return 'Esperando confirmación';
      case AttendanceSessionState.bluetoothOff:
        return 'Revisa la configuración de tu celular';
      case AttendanceSessionState.missingRoomBeacon:
      case AttendanceSessionState.roomNotFound:
        return 'No pudimos confirmar que estás en clase';
      case AttendanceSessionState.error:
        return 'No pudimos preparar el pase de lista';
      case AttendanceSessionState.idle:
        return 'Listo para pasar lista';
    }
  }

  @override
  Widget build(BuildContext context) {
    final visual = _visualState;

    return Scaffold(
      backgroundColor: _background,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            return SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  minHeight: constraints.maxHeight - 40,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _Header(
                      matricula: widget.storage.matricula,
                      syncing: _syncingData,
                      onOpenHistory: _openHistory,
                      onSync: _syncingData ? null : _syncUatData,
                    ),
                    const SizedBox(height: 24),
                    _StatusPanel(
                      visual: visual,
                      statusText: _statusText,
                      active: _isActive,
                      checking: _isChecking,
                      confirmed: _isConfirmed,
                    ),
                    const SizedBox(height: 20),
                    _PrimaryAction(
                      active: _isActive,
                      checking: _isChecking,
                      hasError: _hasError || _phoneNeedsAttention,
                      onPressed: _toggleAttendance,
                    ),
                    const SizedBox(height: 18),
                    _SummaryPanel(
                      matricula: widget.storage.matricula,
                      attendanceCount: _historyCount,
                    ),
                    const SizedBox(height: 14),
                    _HelpPanel(
                      title: _helpTitle,
                      body: _helpBody,
                      icon: _helpIcon,
                    ),
                    if (_syncMessage != null) ...[
                      const SizedBox(height: 14),
                      _SyncFeedback(
                        message: _syncMessage!,
                        syncing: _syncingData,
                        hasError: _syncHasError,
                      ),
                    ],
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Future<void> _saveConfirmedAttendance(DateTime confirmedAt) async {
    await widget.storage.addAttendanceHistoryEntry(confirmedAt);
    if (!mounted) return;
    setState(() => _historyCount = widget.storage.attendanceHistoryCount);
  }

  Future<void> _openHistory() async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => HistoryScreen(storage: widget.storage)),
    );
    if (!mounted) return;
    setState(() => _historyCount = widget.storage.attendanceHistoryCount);
  }

  Future<void> _toggleAttendance() async {
    HapticFeedback.mediumImpact();
    if (_isActive || _isChecking) {
      await widget.attendanceSession.stop();
    } else {
      await widget.attendanceSession.start();
    }
  }

  Future<void> _syncUatData() async {
    if (_syncingData) return;
    setState(() {
      _syncingData = true;
      _syncHasError = false;
      _syncMessage = 'Sincronizando datos UAT...';
    });

    try {
      await widget.studentAuthService.syncAcademicInfo(widget.storage);
      if (!mounted) return;
      setState(() {
        _syncingData = false;
        _syncHasError = false;
        _syncMessage = 'Tus datos UAT están actualizados.';
      });
    } on StudentAuthException {
      if (!mounted) return;
      setState(() {
        _syncingData = false;
        _syncHasError = true;
        _syncMessage =
            'No pudimos sincronizar tus datos UAT. Inténtalo de nuevo.';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _syncingData = false;
        _syncHasError = true;
        _syncMessage =
            'No pudimos sincronizar tus datos UAT. Inténtalo de nuevo.';
      });
    }
  }

  _VisualState get _visualState {
    if (_isConfirmed) {
      return const _VisualState(
        accent: _accent,
        surface: Color(0xFF11231C),
        icon: Icons.check_rounded,
      );
    }
    if (_isActive) {
      return const _VisualState(
        accent: _accent,
        surface: Color(0xFF11231C),
        icon: Icons.hourglass_top_rounded,
      );
    }
    if (_isChecking) {
      return const _VisualState(
        accent: _warning,
        surface: Color(0xFF261E12),
        icon: Icons.hourglass_top_rounded,
      );
    }
    if (_hasError || _phoneNeedsAttention) {
      return const _VisualState(
        accent: _danger,
        surface: Color(0xFF2A1516),
        icon: Icons.priority_high_rounded,
      );
    }
    return const _VisualState(
      accent: _blue,
      surface: Color(0xFF121D31),
      icon: Icons.how_to_reg_rounded,
    );
  }

  String get _helpTitle {
    if (_isConfirmed) return 'Listo';
    if (_isActive) return 'Pase de lista en curso';
    if (_isChecking) return 'Revisando tu clase';
    if (_phoneNeedsAttention || _hasError) return 'Inténtalo de nuevo';
    return 'Cuando estés en clase';
  }

  String get _helpBody {
    if (_isConfirmed) return 'Tu asistencia quedó registrada.';
    if (_isActive) {
      return 'Espera a que el profesor confirme tu asistencia.';
    }
    if (_isChecking) return 'Esto puede tomar unos segundos.';
    if (_phoneNeedsAttention || _hasError) {
      return 'Revisa la configuración de tu celular y vuelve a intentarlo.';
    }
    return 'Presiona el botón cuando el profesor inicie el pase de lista.';
  }

  IconData get _helpIcon {
    if (_isConfirmed) return Icons.task_alt_rounded;
    if (_isActive) return Icons.visibility_rounded;
    if (_isChecking) return Icons.manage_search_rounded;
    if (_phoneNeedsAttention || _hasError) return Icons.refresh_rounded;
    return Icons.school_rounded;
  }
}

class _Header extends StatelessWidget {
  final String matricula;
  final bool syncing;
  final VoidCallback onOpenHistory;
  final VoidCallback? onSync;

  const _Header({
    required this.matricula,
    required this.syncing,
    required this.onOpenHistory,
    required this.onSync,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 46,
          height: 46,
          decoration: BoxDecoration(
            color: const Color(0xFF17202B),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFF263241)),
          ),
          child: const Icon(Icons.school_rounded, color: _accent, size: 25),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Presencia',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                matricula,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: _muted,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 6),
        _HeaderAction(
          tooltip: 'Historial',
          icon: Icons.history_rounded,
          onPressed: onOpenHistory,
        ),
        const SizedBox(width: 4),
        _HeaderAction(
          tooltip: 'Sincronizar datos UAT',
          icon: Icons.cloud_sync_rounded,
          onPressed: onSync,
          loading: syncing,
        ),
      ],
    );
  }
}

class _HeaderAction extends StatelessWidget {
  final String tooltip;
  final IconData icon;
  final VoidCallback? onPressed;
  final bool loading;

  const _HeaderAction({
    required this.tooltip,
    required this.icon,
    required this.onPressed,
    this.loading = false,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Semantics(
        button: true,
        label: tooltip,
        enabled: onPressed != null,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onPressed,
            borderRadius: BorderRadius.circular(12),
            child: Ink(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: const Color(0xFF17202B),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFF263241)),
              ),
              child: Center(
                child: loading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          color: _accent,
                          strokeWidth: 2.2,
                        ),
                      )
                    : Icon(icon, color: _accent, size: 22),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _StatusPanel extends StatelessWidget {
  final _VisualState visual;
  final String statusText;
  final bool active;
  final bool checking;
  final bool confirmed;

  const _StatusPanel({
    required this.visual,
    required this.statusText,
    required this.active,
    required this.checking,
    required this.confirmed,
  });

  @override
  Widget build(BuildContext context) {
    final detail = confirmed
        ? 'Tu asistencia quedó registrada'
        : active
        ? 'Espera la confirmación del profesor'
        : checking
        ? 'Esto puede tomar unos segundos'
        : 'Presiona el botón cuando el profesor pase lista';

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 22, 20, 24),
      decoration: BoxDecoration(
        color: _panel,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: _line),
      ),
      child: Column(
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 260),
            width: 156,
            height: 156,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: visual.surface,
              border: Border.all(color: visual.accent, width: 2),
              boxShadow: [
                BoxShadow(
                  color: visual.accent.withValues(alpha: active ? 0.24 : 0.12),
                  blurRadius: active ? 34 : 18,
                  spreadRadius: active ? 5 : 1,
                ),
              ],
            ),
            child: Icon(visual.icon, color: visual.accent, size: 66),
          ),
          const SizedBox(height: 22),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 180),
            child: Text(
              statusText,
              key: ValueKey(statusText),
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 24,
                fontWeight: FontWeight.w800,
                height: 1.15,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            detail,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.55),
              fontSize: 14,
              height: 1.35,
            ),
          ),
          if (checking) ...[
            const SizedBox(height: 16),
            SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                color: visual.accent,
                strokeWidth: 2.2,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _PrimaryAction extends StatelessWidget {
  final bool active;
  final bool checking;
  final bool hasError;
  final VoidCallback onPressed;

  const _PrimaryAction({
    required this.active,
    required this.checking,
    required this.hasError,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    final isCancelling = active || checking;
    final label = isCancelling
        ? 'Cancelar'
        : hasError
        ? 'Intentar de nuevo'
        : 'Pasar lista';
    final icon = isCancelling
        ? Icons.close_rounded
        : hasError
        ? Icons.refresh_rounded
        : Icons.check_rounded;

    return SizedBox(
      height: 96,
      child: FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: isCancelling ? _danger : _accent,
          foregroundColor: const Color(0xFF07110D),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 30),
            const SizedBox(height: 6),
            Text(
              label,
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
            ),
          ],
        ),
      ),
    );
  }
}

class _SummaryPanel extends StatelessWidget {
  final String matricula;
  final int attendanceCount;

  const _SummaryPanel({required this.matricula, required this.attendanceCount});

  @override
  Widget build(BuildContext context) {
    final attendanceText = attendanceCount == 1
        ? '1 asistencia'
        : '$attendanceCount asistencias';

    return Row(
      children: [
        Expanded(
          child: _InfoTile(
            icon: Icons.badge_rounded,
            label: 'Matrícula',
            value: matricula,
            color: _blue,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _InfoTile(
            icon: Icons.history_rounded,
            label: 'Historial',
            value: attendanceText,
            color: _accent,
          ),
        ),
      ],
    );
  }
}

class _InfoTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;

  const _InfoTile({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 112),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _panel,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: _line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 14),
          Text(
            label,
            style: const TextStyle(
              color: _muted,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 14,
              fontWeight: FontWeight.w800,
              height: 1.15,
            ),
          ),
        ],
      ),
    );
  }
}

class _HelpPanel extends StatelessWidget {
  final String title;
  final String body;
  final IconData icon;

  const _HelpPanel({
    required this.title,
    required this.body,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _panelSoft,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFF1D2936)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: _muted, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  body,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.58),
                    fontSize: 13,
                    height: 1.35,
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

class _SyncFeedback extends StatelessWidget {
  final String message;
  final bool syncing;
  final bool hasError;

  const _SyncFeedback({
    required this.message,
    required this.syncing,
    required this.hasError,
  });

  @override
  Widget build(BuildContext context) {
    final color = hasError ? _danger : _blue;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _panelSoft,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFF1D2936)),
      ),
      child: Row(
        children: [
          if (syncing)
            SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(color: color, strokeWidth: 2.2),
            )
          else
            Icon(
              hasError ? Icons.refresh_rounded : Icons.cloud_done_rounded,
              color: color,
              size: 22,
            ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.78),
                fontSize: 13,
                fontWeight: FontWeight.w600,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _VisualState {
  final Color accent;
  final Color surface;
  final IconData icon;

  const _VisualState({
    required this.accent,
    required this.surface,
    required this.icon,
  });
}
