import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/attendance_confirmation.dart';
import '../models/student_academic_profile.dart';
import '../models/student_schedule_entry.dart';
import '../services/attendance_session_service.dart';
import '../services/ble_advertiser_service.dart';
import '../services/local_storage_service.dart';
import '../services/student_auth_service.dart';
import '../services/student_device_binding_service.dart';
import '../theme/app_theme.dart';
import 'history_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.storage,
    required this.bleService,
    required this.attendanceSession,
    required this.deviceBindingService,
    required this.profile,
    required this.initialUatSessionId,
    required this.demoMode,
    required this.themeMode,
    required this.onThemeModeChanged,
    this.studentAuth,
  });

  final LocalStorageService storage;
  final BleAdvertiserService bleService;
  final AttendanceSessionService attendanceSession;
  final StudentDeviceBindingService deviceBindingService;
  final StudentAcademicProfile profile;
  final String? initialUatSessionId;
  final bool demoMode;
  final ThemeMode themeMode;
  final ValueChanged<ThemeMode> onThemeModeChanged;
  final StudentAuthService? studentAuth;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  AdvertiserState _advertiserState = AdvertiserState.idle;
  AttendanceSessionState _attendanceState = AttendanceSessionState.idle;
  StreamSubscription<AdvertiserState>? _advertiserSubscription;
  StreamSubscription<AttendanceConfirmation>? _confirmationSubscription;
  StreamSubscription<AttendanceSessionSnapshot>? _attendanceSubscription;
  int _selectedTab = 0;
  int _selectedClass = 0;
  int _historyCount = 0;
  bool _isSyncingDeviceBinding = false;
  bool _isSyncingAcademicInfo = false;
  bool _isManualSyncing = false;
  bool _isCheckingServer = false;
  List<StudentScheduleEntry> _schedule = const [];
  String? _academicSyncError;
  String? _pendingUatSessionId;
  String? _confirmationId;
  AttendanceConfirmation? _confirmation;
  DateTime? _lastSuccessfulSync;
  late StudentAcademicProfile _profile;
  late final StudentAuthService _studentAuth;

  bool get _isActive => _advertiserState == AdvertiserState.advertising;
  bool get _isChecking =>
      _attendanceState == AttendanceSessionState.checkingRoom;
  bool get _confirmed => _confirmationId != null;
  bool get _hasError =>
      _advertiserState == AdvertiserState.error ||
      _advertiserState == AdvertiserState.bluetoothOff ||
      _attendanceState == AttendanceSessionState.error ||
      _attendanceState == AttendanceSessionState.bluetoothOff ||
      _attendanceState == AttendanceSessionState.roomNotFound ||
      _attendanceState == AttendanceSessionState.missingRoomBeacon;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _profile = widget.profile;
    _studentAuth = widget.studentAuth ?? StudentAuthService();
    _historyCount = widget.storage.attendanceHistoryCount;
    _pendingUatSessionId = widget.initialUatSessionId;
    _advertiserState = widget.bleService.currentState;
    _attendanceState = widget.attendanceSession.currentState;
    _advertiserSubscription = widget.bleService.stateStream.listen((value) {
      if (mounted) {
        setState(() => _advertiserState = value);
      }
    });
    _attendanceSubscription = widget.attendanceSession.stateStream.listen((
      snapshot,
    ) {
      if (mounted) {
        setState(() => _attendanceState = snapshot.state);
      }
    });
    _confirmationSubscription = widget.bleService.confirmationStream.listen((
      confirmation,
    ) {
      if (!confirmation.isConfirmed) return;
      if (!mounted) return;
      final id = DateTime.now().microsecondsSinceEpoch.toString();
      setState(() {
        _confirmationId = id;
        _confirmation = confirmation;
      });
      unawaited(_saveAttendance(confirmation));
      unawaited(widget.attendanceSession.stop());
      Future<void>.delayed(const Duration(seconds: 5), () {
        if (mounted && _confirmationId == id) {
          setState(() {
            _confirmationId = null;
            _confirmation = null;
          });
        }
      });
    });
    unawaited(_syncDeviceBinding());
    unawaited(_syncAcademicInfo());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused && (_isActive || _isChecking)) {
      unawaited(widget.attendanceSession.stop());
    }
    if (state == AppLifecycleState.resumed) {
      unawaited(_syncDeviceBinding());
      unawaited(_syncAcademicInfo());
    }
  }

  Future<void> _syncDeviceBinding() async {
    if (_isSyncingDeviceBinding || !widget.storage.isProfileSet) return;
    _isSyncingDeviceBinding = true;
    try {
      final synced = await widget.deviceBindingService.sync(widget.storage);
      await widget.storage.setDeviceBindingSyncPending(!synced);
    } finally {
      _isSyncingDeviceBinding = false;
    }
  }

  Future<void> _syncAcademicInfo() async {
    if (_isSyncingAcademicInfo || !widget.storage.isProfileSet) return;
    _isSyncingAcademicInfo = true;
    if (mounted) setState(() => _academicSyncError = null);
    try {
      final sessionId = _pendingUatSessionId;
      _pendingUatSessionId = null;
      final result = await _studentAuth.syncAcademicInfo(
        widget.storage,
        sessionId: sessionId,
      );
      if (!mounted) return;
      setState(() {
        _schedule = result.schedule;
        _selectedClass = 0;
        _lastSuccessfulSync = result.syncedAt;
        if (result.profile != null) _profile = result.profile!;
      });
    } on StudentAuthException catch (error) {
      if (mounted) setState(() => _academicSyncError = error.message);
    } catch (_) {
      if (mounted) {
        setState(
          () => _academicSyncError =
              'No pudimos actualizar tu horario. Inténtalo de nuevo.',
        );
      }
    } finally {
      _isSyncingAcademicInfo = false;
      if (mounted) setState(() {});
    }
  }

  Future<void> _syncFromServer() async {
    if (_isManualSyncing || _isSyncingAcademicInfo) return;

    setState(() {
      _isManualSyncing = true;
      _isCheckingServer = true;
    });

    try {
      final online = await _studentAuth.isServerOnline();
      if (!mounted) return;
      setState(() => _isCheckingServer = false);

      if (!online) {
        _showSyncFeedback(
          'Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.',
          isError: true,
        );
        return;
      }

      await _syncAcademicInfo();
      if (!mounted) return;
      if (_academicSyncError != null) {
        _showSyncFeedback(_academicSyncError!, isError: true);
        return;
      }

      await _syncDeviceBinding();
      if (!mounted) return;
      _showSyncFeedback('Tu perfil y horario están actualizados.');
    } finally {
      if (mounted) {
        setState(() {
          _isManualSyncing = false;
          _isCheckingServer = false;
        });
      }
    }
  }

  void _showSyncFeedback(String message, {bool isError = false}) {
    final messenger = ScaffoldMessenger.of(context);
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
        backgroundColor: isError ? Theme.of(context).colorScheme.error : null,
      ),
    );
  }

  Future<void> _saveAttendance(AttendanceConfirmation confirmation) async {
    await widget.storage.addAttendanceHistoryEntry(
      DateTime.now(),
      classId: confirmation.classId,
      className: confirmation.className,
      group: confirmation.group,
      classroom: confirmation.classroom,
    );
    if (mounted) {
      setState(() => _historyCount = widget.storage.attendanceHistoryCount);
    }
  }

  Future<void> _toggleAttendance() async {
    HapticFeedback.mediumImpact();
    if (_isActive || _isChecking) {
      await widget.attendanceSession.stop();
    } else {
      await widget.attendanceSession.start();
    }
  }

  Future<void> _openHistory() async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => HistoryScreen(storage: widget.storage)),
    );
    if (mounted) {
      setState(() => _historyCount = widget.storage.attendanceHistoryCount);
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

  @override
  Widget build(BuildContext context) {
    final pages = [
      _AttendancePage(
        historyCount: _historyCount,
        selectedClass: _selectedClass,
        schedule: _schedule,
        scheduleLoading: _isSyncingAcademicInfo,
        isActive: _isActive,
        isChecking: _isChecking,
        confirmed: _confirmed,
        confirmedClassName: _confirmation?.classDisplayName,
        hasError: _hasError,
        onSelectClass: (index) => setState(() => _selectedClass = index),
        onRegister: _toggleAttendance,
      ),
      _SchedulePage(
        schedule: _schedule,
        loading: _isSyncingAcademicInfo,
        errorMessage: _academicSyncError,
        onRetry: _syncAcademicInfo,
      ),
      _ProfilePage(
        profile: _profile,
        themeMode: widget.themeMode,
        onThemeModeChanged: widget.onThemeModeChanged,
        onOpenHistory: _openHistory,
        onSync: _syncFromServer,
        isSyncing: _isManualSyncing || _isSyncingAcademicInfo,
        isCheckingServer: _isCheckingServer,
        lastSyncedAt: _lastSuccessfulSync,
      ),
    ];
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            if (widget.demoMode)
              Container(
                width: double.infinity,
                color: const Color(0xFFF59E0B),
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 8,
                ),
                child: const Text(
                  'MODO DEMO · Datos ficticios, sin conexión a UAT real',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Color(0xFF451A03),
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            Expanded(
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 430),
                  child: IndexedStack(index: _selectedTab, children: pages),
                ),
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Align(
          heightFactor: 1,
          alignment: Alignment.center,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: _BottomNav(
              index: _selectedTab,
              onChanged: (value) => setState(() => _selectedTab = value),
            ),
          ),
        ),
      ),
    );
  }
}

class _AttendancePage extends StatelessWidget {
  const _AttendancePage({
    required this.historyCount,
    required this.selectedClass,
    required this.schedule,
    required this.scheduleLoading,
    required this.isActive,
    required this.isChecking,
    required this.confirmed,
    required this.confirmedClassName,
    required this.hasError,
    required this.onSelectClass,
    required this.onRegister,
  });
  final int historyCount;
  final int selectedClass;
  final List<StudentScheduleEntry> schedule;
  final bool scheduleLoading;
  final bool isActive, isChecking, confirmed, hasError;
  final String? confirmedClassName;
  final ValueChanged<int> onSelectClass;
  final VoidCallback onRegister;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final todayClasses = scheduleForWeekday(schedule, DateTime.now().weekday);
    final safeSelectedClass = todayClasses.isEmpty
        ? 0
        : selectedClass.clamp(0, todayClasses.length - 1);
    final buttonTitle = confirmed
        ? 'Asistencia registrada'
        : isActive || isChecking
        ? 'Cancelando registro'
        : hasError
        ? 'Intentar de nuevo'
        : 'Registrar asistencia';
    final buttonDetail = confirmed
        ? 'Confirmada en ${confirmedClassName ?? 'tu clase'}'
        : isChecking
        ? 'Verificando disponibilidad'
        : isActive
        ? 'Esperando confirmación'
        : hasError
        ? 'Revisa tu celular y vuelve a intentarlo'
        : 'Disponible cuando el profesor inicie el pase';
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: CustomScrollView(
        slivers: [
          const SliverToBoxAdapter(child: SizedBox(height: 18)),
          SliverToBoxAdapter(
            child: _PageHeader(title: 'Asistencia', subtitle: 'Periodo actual'),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 22)),
          SliverToBoxAdapter(
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '$historyCount',
                            style: Theme.of(
                              context,
                            ).textTheme.headlineSmall?.copyWith(fontSize: 42),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            historyCount == 1
                                ? 'asistencia confirmada'
                                : 'asistencias confirmadas',
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                        ],
                      ),
                    ),
                    SizedBox(
                      width: 142,
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(
                            Icons.verified_outlined,
                            size: 18,
                            color: scheme.primary,
                          ),
                          const SizedBox(width: 7),
                          Expanded(
                            child: Text(
                              'Registros confirmados en este celular',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 26)),
          SliverToBoxAdapter(
            child: Text(
              'Clase a registrar',
              style: Theme.of(context).textTheme.titleLarge,
            ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 4)),
          SliverToBoxAdapter(
            child: Text(
              'Desliza para elegir una clase reciente',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 14)),
          SliverToBoxAdapter(
            child: scheduleLoading && schedule.isEmpty
                ? const _AcademicLoadingCard()
                : todayClasses.isEmpty
                ? const _NoClassesTodayCard()
                : SizedBox(
                    height: 154,
                    child: PageView.builder(
                      controller: PageController(
                        viewportFraction: .74,
                        initialPage: safeSelectedClass,
                      ),
                      itemCount: todayClasses.length,
                      onPageChanged: onSelectClass,
                      itemBuilder: (context, index) => _ClassCard(
                        occurrence: todayClasses[index],
                        selected: index == safeSelectedClass,
                      ),
                    ),
                  ),
          ),
          if (todayClasses.isNotEmpty)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.only(top: 14),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(
                    todayClasses.length,
                    (index) => AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      margin: const EdgeInsets.symmetric(horizontal: 5),
                      width: index == safeSelectedClass ? 18 : 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: index == safeSelectedClass
                            ? scheme.primary
                            : appMuted(context).withValues(alpha: .4),
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          if (confirmed) ...[
            const SliverToBoxAdapter(child: SizedBox(height: 22)),
            SliverToBoxAdapter(
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.success.withValues(alpha: .12),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: AppColors.success.withValues(alpha: .32),
                  ),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.verified_rounded,
                      color: AppColors.success,
                      size: 30,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Asistencia tomada correctamente',
                            style: Theme.of(context).textTheme.titleSmall
                                ?.copyWith(fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            confirmedClassName ?? 'Clase confirmada',
                            style: Theme.of(context).textTheme.bodyMedium
                                ?.copyWith(color: AppColors.success),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
          const SliverToBoxAdapter(child: SizedBox(height: 30)),
          SliverToBoxAdapter(
            child: Semantics(
              button: true,
              label: buttonTitle,
              child: SizedBox(
                height: 88,
                child: FilledButton(
                  onPressed: confirmed ? null : onRegister,
                  style: FilledButton.styleFrom(
                    backgroundColor: confirmed
                        ? AppColors.success
                        : scheme.primary,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(20),
                    ),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        buttonTitle,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 19,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(buttonDetail, style: const TextStyle(fontSize: 11)),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SchedulePage extends StatefulWidget {
  const _SchedulePage({
    required this.schedule,
    required this.loading,
    required this.errorMessage,
    required this.onRetry,
  });

  final List<StudentScheduleEntry> schedule;
  final bool loading;
  final String? errorMessage;
  final Future<void> Function() onRetry;

  @override
  State<_SchedulePage> createState() => _SchedulePageState();
}

class _SchedulePageState extends State<_SchedulePage> {
  int _weekday = DateTime.now().weekday;
  static const _days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  @override
  Widget build(BuildContext context) {
    final classes = scheduleForWeekday(widget.schedule, _weekday);
    return RefreshIndicator(
      onRefresh: widget.onRetry,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _PageHeader(title: 'Horario', subtitle: 'Datos de UAT'),
            const SizedBox(height: 24),
            SizedBox(
              height: 44,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _days.length,
                separatorBuilder: (_, _) => const SizedBox(width: 10),
                itemBuilder: (_, index) {
                  final weekday = index + 1;
                  return SizedBox(
                    width: 62,
                    child: ChoiceChip(
                      label: Text(_days[index]),
                      selected: _weekday == weekday,
                      onSelected: (_) => setState(() => _weekday = weekday),
                      showCheckmark: false,
                      selectedColor: Theme.of(context).colorScheme.primary,
                      labelStyle: TextStyle(
                        color: _weekday == weekday ? Colors.white : null,
                        fontWeight: FontWeight.w700,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                        side: BorderSide.none,
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 26),
            if (widget.loading && widget.schedule.isEmpty)
              const _AcademicLoadingCard()
            else if (widget.errorMessage != null && widget.schedule.isEmpty)
              _AcademicErrorCard(
                message: widget.errorMessage!,
                onRetry: widget.onRetry,
              )
            else if (classes.isEmpty)
              const Card(child: _EmptySchedule())
            else
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      for (var index = 0; index < classes.length; index++) ...[
                        _ScheduleItem(occurrence: classes[index]),
                        if (index < classes.length - 1)
                          const SizedBox(height: 14),
                      ],
                    ],
                  ),
                ),
              ),
            if (widget.errorMessage != null && widget.schedule.isNotEmpty) ...[
              const SizedBox(height: 14),
              _InlineSyncWarning(
                message: widget.errorMessage!,
                onRetry: widget.onRetry,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ProfilePage extends StatelessWidget {
  const _ProfilePage({
    required this.profile,
    required this.themeMode,
    required this.onThemeModeChanged,
    required this.onOpenHistory,
    required this.onSync,
    required this.isSyncing,
    required this.isCheckingServer,
    required this.lastSyncedAt,
  });
  final StudentAcademicProfile profile;
  final ThemeMode themeMode;
  final ValueChanged<ThemeMode> onThemeModeChanged;
  final VoidCallback onOpenHistory;
  final VoidCallback onSync;
  final bool isSyncing;
  final bool isCheckingServer;
  final DateTime? lastSyncedAt;
  @override
  Widget build(BuildContext context) {
    final initials = profile.displayName.trim().isEmpty
        ? 'FI'
        : profile.displayName
              .trim()
              .split(RegExp(r'\s+'))
              .take(2)
              .map((part) => part.substring(0, 1))
              .join()
              .toUpperCase();
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _PageHeader(
            title: 'Perfil',
            subtitle: 'Tu información estudiantil',
          ),
          const SizedBox(height: 22),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 72,
                        height: 72,
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.primary,
                          shape: BoxShape.circle,
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          initials,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 22,
                          ),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              profile.displayName,
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const SizedBox(height: 4),
                            Text(
                              profile.programName ??
                                  'Programa académico no disponible',
                              style: Theme.of(context).textTheme.bodyMedium,
                            ),
                            const SizedBox(height: 6),
                            Text(
                              'Matrícula ${profile.matricula}',
                              style: Theme.of(context).textTheme.labelSmall,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton.icon(
                      onPressed: onOpenHistory,
                      icon: const Icon(Icons.history_rounded),
                      label: const Text('Ver historial'),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 18),
          Text(
            'Información académica',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 10),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  _ProfileField(
                    'CORREO',
                    profile.institutionalEmail.isEmpty
                        ? 'No sincronizado'
                        : profile.institutionalEmail,
                  ),
                  const Divider(height: 32),
                  _ProfileField(
                    'PROGRAMA',
                    profile.programName ?? 'No disponible en UAT',
                  ),
                  const Divider(height: 32),
                  _ProfileField(
                    'CICLO',
                    profile.cycleName ?? 'No disponible en UAT',
                  ),
                  const Divider(height: 32),
                  _ProfileField(
                    'PROMEDIO Y CRÉDITOS',
                    _academicSummary(profile),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 18),
          Card(
            child: ListTile(
              enabled: !isSyncing,
              onTap: isSyncing ? null : onSync,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 18,
                vertical: 8,
              ),
              leading: Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: Theme.of(
                    context,
                  ).colorScheme.primary.withValues(alpha: .12),
                  borderRadius: BorderRadius.circular(14),
                ),
                alignment: Alignment.center,
                child: Icon(
                  Icons.cloud_sync_outlined,
                  color: Theme.of(context).colorScheme.primary,
                ),
              ),
              title: const Text('Sincronizar con el servidor'),
              subtitle: Text(
                isCheckingServer
                    ? 'Verificando conexión…'
                    : isSyncing
                    ? 'Actualizando perfil y horario…'
                    : _lastSyncLabel(lastSyncedAt),
              ),
              trailing: isSyncing
                  ? const SizedBox.square(
                      dimension: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.4),
                    )
                  : const Icon(Icons.refresh_rounded),
            ),
          ),
          const SizedBox(height: 18),
          Card(
            child: SwitchListTile.adaptive(
              title: const Text('Tema oscuro'),
              subtitle: const Text('Usar la apariencia oscura'),
              value:
                  themeMode == ThemeMode.dark ||
                  (themeMode == ThemeMode.system &&
                      MediaQuery.platformBrightnessOf(context) ==
                          Brightness.dark),
              onChanged: (enabled) => onThemeModeChanged(
                enabled ? ThemeMode.dark : ThemeMode.light,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PageHeader extends StatelessWidget {
  const _PageHeader({required this.title, required this.subtitle});
  final String title, subtitle;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(title, style: Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height: 3),
      Text(subtitle, style: Theme.of(context).textTheme.bodyMedium),
    ],
  );
}

class _ClassCard extends StatelessWidget {
  const _ClassCard({required this.occurrence, required this.selected});
  final StudentScheduleOccurrence occurrence;
  final bool selected;

  @override
  Widget build(BuildContext context) => AnimatedScale(
    scale: selected ? 1 : .92,
    duration: const Duration(milliseconds: 220),
    child: AnimatedOpacity(
      opacity: selected ? 1 : .58,
      duration: const Duration(milliseconds: 220),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: selected
                ? Theme.of(context).colorScheme.secondary
                : appSurface(context),
            borderRadius: BorderRadius.circular(22),
          ),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  occurrence.entry.subject,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: selected ? Colors.white : null,
                  ),
                ),
                const Spacer(),
                Row(
                  children: [
                    Icon(
                      Icons.room_outlined,
                      size: 16,
                      color: selected ? Colors.white70 : appMuted(context),
                    ),
                    const SizedBox(width: 5),
                    Text(
                      occurrence.entry.classroom ?? 'Aula por confirmar',
                      style: TextStyle(
                        color: selected ? Colors.white70 : appMuted(context),
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 5),
                Text(
                  occurrence.slot.displayTime,
                  style: TextStyle(
                    color: selected ? Colors.white70 : appMuted(context),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

class _BottomNav extends StatelessWidget {
  const _BottomNav({required this.index, required this.onChanged});
  final int index;
  final ValueChanged<int> onChanged;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
    child: Container(
      height: 70,
      decoration: BoxDecoration(
        color: appSurface(context),
        borderRadius: BorderRadius.circular(22),
      ),
      child: Row(
        children: [
          _NavItem(
            icon: Icons.how_to_reg_rounded,
            label: 'Asistencia',
            active: index == 0,
            onTap: () => onChanged(0),
          ),
          _NavItem(
            icon: Icons.calendar_month_rounded,
            label: 'Horario',
            active: index == 1,
            onTap: () => onChanged(1),
          ),
          _NavItem(
            icon: Icons.account_circle_rounded,
            label: 'Perfil',
            active: index == 2,
            onTap: () => onChanged(2),
          ),
        ],
      ),
    ),
  );
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.label,
    required this.active,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Expanded(
    child: Semantics(
      selected: active,
      button: true,
      label: label,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          margin: const EdgeInsets.all(7),
          decoration: BoxDecoration(
            color: active
                ? Theme.of(context).colorScheme.primary.withValues(alpha: .13)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                color: active
                    ? Theme.of(context).colorScheme.primary
                    : appMuted(context),
              ),
              const SizedBox(height: 3),
              Text(
                label,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: active
                      ? Theme.of(context).colorScheme.primary
                      : appMuted(context),
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class _ScheduleItem extends StatelessWidget {
  const _ScheduleItem({required this.occurrence});

  final StudentScheduleOccurrence occurrence;

  @override
  Widget build(BuildContext context) {
    final color = _scheduleColor(occurrence.entry.externalGroupId);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 62,
          child: Text(
            occurrence.slot.startTime ?? occurrence.slot.raw,
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w700),
          ),
        ),
        Expanded(
          child: Container(
            constraints: const BoxConstraints(minHeight: 72),
            padding: const EdgeInsets.fromLTRB(18, 13, 12, 13),
            decoration: BoxDecoration(
              color: color.withValues(alpha: .12),
              borderRadius: BorderRadius.circular(16),
              border: Border(left: BorderSide(color: color, width: 6)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  occurrence.entry.subject,
                  style: Theme.of(
                    context,
                  ).textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 4),
                Text(
                  occurrence.entry.classroom ?? 'Aula por confirmar',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                if (occurrence.entry.professor != null) ...[
                  const SizedBox(height: 3),
                  Text(
                    occurrence.entry.professor!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelSmall,
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _AcademicLoadingCard extends StatelessWidget {
  const _AcademicLoadingCard();

  @override
  Widget build(BuildContext context) => const Card(
    child: SizedBox(
      height: 154,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 14),
            Text('Actualizando horario desde UAT…'),
          ],
        ),
      ),
    ),
  );
}

class _NoClassesTodayCard extends StatelessWidget {
  const _NoClassesTodayCard();

  @override
  Widget build(BuildContext context) => Card(
    child: SizedBox(
      height: 154,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.event_available_rounded, color: appMuted(context)),
              const SizedBox(height: 10),
              const Text(
                'No tienes clases programadas para hoy',
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class _AcademicErrorCard extends StatelessWidget {
  const _AcademicErrorCard({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 38),
      child: Column(
        children: [
          Icon(Icons.cloud_off_rounded, size: 36, color: appMuted(context)),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh_rounded),
            label: const Text('Volver a intentar'),
          ),
        ],
      ),
    ),
  );
}

class _InlineSyncWarning extends StatelessWidget {
  const _InlineSyncWarning({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => Material(
    color: Theme.of(context).colorScheme.errorContainer,
    borderRadius: BorderRadius.circular(16),
    child: ListTile(
      leading: const Icon(Icons.sync_problem_rounded),
      title: const Text('Mostrando el último horario disponible'),
      subtitle: Text(message),
      trailing: IconButton(
        tooltip: 'Reintentar sincronización',
        onPressed: onRetry,
        icon: const Icon(Icons.refresh_rounded),
      ),
    ),
  );
}

Color _scheduleColor(String externalGroupId) {
  const colors = [
    AppColors.indigo,
    AppColors.orange,
    AppColors.success,
    Color(0xFF8B5CF6),
  ];
  final hash = externalGroupId.codeUnits.fold<int>(
    0,
    (sum, item) => sum + item,
  );
  return colors[hash % colors.length];
}

String _academicSummary(StudentAcademicProfile profile) {
  final details = <String>[];
  if (profile.average != null) details.add('Promedio ${profile.average}');
  if (profile.approvedCredits != null) {
    details.add('${profile.approvedCredits} créditos aprobados');
  }
  return details.isEmpty ? 'No disponible en UAT' : details.join(' · ');
}

String _lastSyncLabel(DateTime? syncedAt) {
  if (syncedAt == null) {
    return 'Comprueba la conexión y actualiza tu perfil y horario';
  }

  final local = syncedAt.toLocal();
  final hour = local.hour.toString().padLeft(2, '0');
  final minute = local.minute.toString().padLeft(2, '0');
  return 'Última sincronización: $hour:$minute';
}

class _EmptySchedule extends StatelessWidget {
  const _EmptySchedule();
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 80),
    child: Center(
      child: Column(
        children: [
          Icon(
            Icons.event_available_rounded,
            size: 38,
            color: appMuted(context),
          ),
          const SizedBox(height: 12),
          const Text(
            'No tienes clases programadas para este día',
            textAlign: TextAlign.center,
          ),
        ],
      ),
    ),
  );
}

class _ProfileField extends StatelessWidget {
  const _ProfileField(this.label, this.value);
  final String label, value;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label, style: Theme.of(context).textTheme.labelSmall),
      const SizedBox(height: 5),
      Text(
        value,
        style: Theme.of(
          context,
        ).textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
      ),
    ],
  );
}
