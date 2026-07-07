import 'dart:async';

import 'package:flutter/material.dart';

import '../services/attendance_session_service.dart';
import '../services/ble_advertiser_service.dart';
import '../services/local_storage_service.dart';
import '../services/student_auth_service.dart';

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
  AdvertiserState _advState = AdvertiserState.idle;
  AttendanceSessionState _sessionState = AttendanceSessionState.idle;
  String _statusText = 'Preparando asistencia';
  String? _lastConfirmation;
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
        _statusText = 'Asistencia confirmada';
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
      widget.bleService.stopAdvertising();
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
        return 'Asistencia activa';
      case AdvertiserState.bluetoothOff:
        return 'Activa Bluetooth';
      case AdvertiserState.error:
        return 'Revisa permisos y Bluetooth';
      case AdvertiserState.idle:
        return 'Asistencia pausada';
    }
  }

  String _textForSession(AttendanceSessionState state) {
    switch (state) {
      case AttendanceSessionState.checkingRoom:
        return 'Validando tu clase';
      case AttendanceSessionState.roomVerified:
        return 'Clase validada';
      case AttendanceSessionState.broadcasting:
        return 'Asistencia activa';
      case AttendanceSessionState.bluetoothOff:
        return 'Activa Bluetooth';
      case AttendanceSessionState.missingRoomBeacon:
      case AttendanceSessionState.roomNotFound:
        return 'No se pudo validar tu clase';
      case AttendanceSessionState.error:
        return 'Revisa permisos y Bluetooth';
      case AttendanceSessionState.idle:
        return 'Asistencia pausada';
    }
  }

  @override
  Widget build(BuildContext context) {
    final visual = _visualState;

    return Scaffold(
      backgroundColor: const Color(0xFF0B0F14),
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
                    _Header(matricula: widget.storage.matricula),
                    const SizedBox(height: 24),
                    _StatusPanel(
                      visual: visual,
                      statusText: _statusText,
                      active: _isActive,
                      checking: _isChecking,
                    ),
                    const SizedBox(height: 20),
                    _PrimaryAction(
                      active: _isActive,
                      checking: _isChecking,
                      hasError: _hasError || _bluetoothOff,
                      onPressed: _toggleAttendance,
                    ),
                    const SizedBox(height: 18),
                    _DevicePanel(
                      matricula: widget.storage.matricula,
                      statusLabel: _deviceStatusLabel,
                      statusIcon: visual.smallIcon,
                      statusColor: visual.accent,
                    ),
                    const SizedBox(height: 14),
                    _HelpPanel(
                      title: _helpTitle,
                      body: _helpBody,
                      icon: _helpIcon,
                    ),
                    const SizedBox(height: 14),
                    _AcademicSyncPanel(
                      syncing: _syncingAcademicInfo,
                      message: _academicSyncMessage,
                      hasError: _academicSyncError,
                      onSync: _syncAcademicInfo,
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Future<void> _toggleAttendance() async {
    if (_isActive || _isChecking) {
      await widget.bleService.stopAdvertising();
    } else {
      await widget.bleService.startAdvertising(
        uuid: widget.storage.attendanceUuid,
      );
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
            'Sincronización lista: ${result.scheduleCount} horarios, '
            '${result.partialGradesCount} parciales y '
            '${result.finalGradesCount} finales.';
      });
    } on StudentAuthException catch (error) {
      if (!mounted) return;
      setState(() {
        _syncingAcademicInfo = false;
        _academicSyncError = true;
        _academicSyncMessage = error.authenticationFailed
            ? 'No se puede sincronizar horario o calificaciones. Tu contraseña UAT cambió o ya no es válida. El pase de asistencia sigue funcionando.'
            : error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _syncingAcademicInfo = false;
        _academicSyncError = true;
        _academicSyncMessage =
            'No se pudo sincronizar la información. El pase de asistencia sigue funcionando.';
      });
    }
  }

  _VisualState get _visualState {
    if (_isConfirmed) {
      return const _VisualState(
        accent: Color(0xFF62D6A2),
        surface: Color(0xFF11231C),
        icon: Icons.check_rounded,
        smallIcon: Icons.verified_rounded,
      );
    }
    if (_isActive) {
      return const _VisualState(
        accent: Color(0xFF62D6A2),
        surface: Color(0xFF11231C),
        icon: Icons.sensors_rounded,
        smallIcon: Icons.radio_button_checked_rounded,
      );
    }
    if (_isChecking) {
      return const _VisualState(
        accent: Color(0xFFF4B860),
        surface: Color(0xFF261E12),
        icon: Icons.sync_rounded,
        smallIcon: Icons.hourglass_top_rounded,
      );
    }
    if (_hasError || _bluetoothOff) {
      return const _VisualState(
        accent: Color(0xFFFF7A70),
        surface: Color(0xFF2A1516),
        icon: Icons.priority_high_rounded,
        smallIcon: Icons.error_rounded,
      );
    }
    return const _VisualState(
      accent: Color(0xFF79A8FF),
      surface: Color(0xFF121D31),
      icon: Icons.pause_rounded,
      smallIcon: Icons.phone_android_rounded,
    );
  }

  String get _deviceStatusLabel {
    if (_isConfirmed) return 'Registro confirmado';
    if (_isActive) return 'Disponible para pase de lista';
    if (_isChecking) return 'Validando clase';
    if (_bluetoothOff) return 'Bluetooth apagado';
    if (_hasError) return 'Requiere atención';
    return 'Vinculado';
  }

  String get _helpTitle {
    if (_isConfirmed) return 'Listo';
    if (_isActive) return 'Acerca tu celular al profesor';
    if (_isChecking) return 'Validación en curso';
    if (_bluetoothOff) return 'Bluetooth requerido';
    if (_hasError) return 'Permisos necesarios';
    return 'Tu celular está vinculado';
  }

  String get _helpBody {
    if (_isConfirmed) {
      return 'Tu asistencia fue registrada por el profesor.';
    }
    if (_isActive) {
      return 'Cuando el profesor escanee alumnos, se conectará a tu celular y verás la confirmación aquí.';
    }
    if (_isChecking) {
      return 'Estamos confirmando tu clase antes de activar la asistencia.';
    }
    if (_bluetoothOff) {
      return 'Activa Bluetooth en el sistema y vuelve a intentarlo.';
    }
    if (_hasError) {
      return 'Revisa los permisos de la app y vuelve a activar la asistencia.';
    }
    return 'Presiona el botón cuando el profesor pida activar la asistencia.';
  }

  IconData get _helpIcon {
    if (_isConfirmed) return Icons.task_alt_rounded;
    if (_isActive) return Icons.visibility_rounded;
    if (_isChecking) return Icons.manage_search_rounded;
    if (_bluetoothOff || _hasError) return Icons.settings_rounded;
    return Icons.lock_rounded;
  }
}

class _Header extends StatelessWidget {
  final String matricula;

  const _Header({required this.matricula});

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
          child: const Icon(
            Icons.school_rounded,
            color: Color(0xFF62D6A2),
            size: 25,
          ),
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
                  color: Color(0xFF8F9BA8),
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _StatusPanel extends StatelessWidget {
  final _VisualState visual;
  final String statusText;
  final bool active;
  final bool checking;

  const _StatusPanel({
    required this.visual,
    required this.statusText,
    required this.active,
    required this.checking,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 22, 20, 24),
      decoration: BoxDecoration(
        color: const Color(0xFF111923),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFF223040)),
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
            active
                ? 'Esperando pase de lista'
                : checking
                ? 'Esto puede tomar unos segundos'
                : 'La asistencia puede activarse al entrar a clase',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.55),
              fontSize: 14,
              height: 1.35,
            ),
          ),
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
    final label = active
        ? 'Detener'
        : checking
        ? 'Cancelar'
        : hasError
        ? 'Reintentar'
        : 'Simular beacon';
    final icon = active
        ? Icons.pause_rounded
        : checking
        ? Icons.close_rounded
        : hasError
        ? Icons.refresh_rounded
        : Icons.play_arrow_rounded;

    return SizedBox(
      height: 96,
      child: FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: active
              ? const Color(0xFFFF7A70)
              : const Color(0xFF62D6A2),
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

class _DevicePanel extends StatelessWidget {
  final String matricula;
  final String statusLabel;
  final IconData statusIcon;
  final Color statusColor;

  const _DevicePanel({
    required this.matricula,
    required this.statusLabel,
    required this.statusIcon,
    required this.statusColor,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _InfoTile(
            icon: Icons.badge_rounded,
            label: 'Matrícula',
            value: matricula,
            color: const Color(0xFF79A8FF),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _InfoTile(
            icon: statusIcon,
            label: 'Celular',
            value: statusLabel,
            color: statusColor,
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
        color: const Color(0xFF111923),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFF223040)),
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
              color: Color(0xFF8F9BA8),
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
        color: const Color(0xFF10161E),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFF1D2936)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: const Color(0xFF8F9BA8), size: 22),
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
    final accent = hasError ? const Color(0xFFFF7A70) : const Color(0xFF79A8FF);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF10161E),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFF1D2936)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Icons.cloud_sync_rounded, color: accent, size: 22),
              const SizedBox(width: 10),
              const Expanded(
                child: Text(
                  'Información UAT',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
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
                label: Text(syncing ? 'Sincronizando' : 'Sincronizar'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            message ??
                'Horario y calificaciones son opcionales. Tu pase de asistencia funciona aunque no se sincronicen.',
            style: TextStyle(
              color: Colors.white.withValues(alpha: hasError ? 0.78 : 0.58),
              fontSize: 13,
              height: 1.35,
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
  final IconData smallIcon;

  const _VisualState({
    required this.accent,
    required this.surface,
    required this.icon,
    required this.smallIcon,
  });
}
