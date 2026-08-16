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
  Timer? _scheduleClock;
  int _selectedTab = 0;
  int _selectedClass = 0;
  int _attendanceToleranceMinutes =
      LocalStorageService.defaultAttendanceToleranceMinutes;
  bool _isSyncingDeviceBinding = false;
  bool _isSyncingAcademicInfo = false;
  bool _isManualSyncing = false;
  bool _isCheckingServer = false;
  List<StudentScheduleEntry> _schedule = const [];
  String? _academicSyncError;
  bool _passwordDialogOpen = false;
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
    _schedule = widget.storage.studentSchedule;
    _attendanceToleranceMinutes = widget.storage.attendanceToleranceMinutes;
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
      if (!confirmation.isConfirmed ||
          !confirmation.belongsToMatricula(widget.storage.matricula)) {
        return;
      }
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
    _startScheduleClock();
    unawaited(_syncDeviceBinding());
    unawaited(_syncAcademicInfo());
  }

  void _startScheduleClock() {
    final now = DateTime.now();
    final millisecondsToNextMinute =
        const Duration(minutes: 1).inMilliseconds -
        (now.second * 1000 + now.millisecond);
    _scheduleClock = Timer(
      Duration(milliseconds: millisecondsToNextMinute),
      () {
        if (!mounted) return;
        if (_selectedTab == 0) setState(() {});
        _scheduleClock = Timer.periodic(const Duration(minutes: 1), (_) {
          if (mounted && _selectedTab == 0) setState(() {});
        });
      },
    );
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
    var requestPassword = false;
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
        _attendanceToleranceMinutes = result.attendanceToleranceMinutes;
        _lastSuccessfulSync = result.syncedAt;
        if (result.profile != null) _profile = result.profile!;
      });
    } on StudentAuthException catch (error) {
      requestPassword = error.authenticationFailed;
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
    if (requestPassword && mounted) {
      unawaited(_requestUatPassword());
    }
  }

  Future<void> _requestUatPassword() async {
    if (_passwordDialogOpen || !mounted) return;
    _passwordDialogOpen = true;
    final passwordController = TextEditingController();
    String? dialogError;
    var loading = false;

    try {
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (dialogContext) => StatefulBuilder(
          builder: (context, setDialogState) {
            Future<void> submit() async {
              final password = passwordController.text;
              if (password.isEmpty || loading) return;
              setDialogState(() {
                loading = true;
                dialogError = null;
              });
              try {
                final email = widget.storage.institutionalEmail.isNotEmpty
                    ? widget.storage.institutionalEmail
                    : _profile.institutionalEmail;
                final result = await _studentAuth.loginAndBind(
                  username: email,
                  password: password,
                  storage: widget.storage,
                );
                await widget.storage.saveInstitutionalCredentials(
                  username: email,
                  password: password,
                );
                await widget.storage.saveDeviceBindingToken(
                  result.deviceBindingToken,
                );
                await widget.storage.saveAcademicProfile(result.profile);
                _pendingUatSessionId = result.sessionId;
                _profile = result.profile;
                if (dialogContext.mounted) Navigator.of(dialogContext).pop();
              } on StudentAuthException catch (error) {
                if (dialogContext.mounted) {
                  setDialogState(() {
                    loading = false;
                    dialogError = error.message;
                  });
                }
              }
            }

            return AlertDialog(
              title: const Text('Actualiza tu contraseña UAT'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.storage.institutionalEmail.isNotEmpty
                        ? widget.storage.institutionalEmail
                        : _profile.institutionalEmail,
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: passwordController,
                    obscureText: true,
                    autofocus: true,
                    enabled: !loading,
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => submit(),
                    decoration: InputDecoration(
                      labelText: 'Contraseña',
                      errorText: dialogError,
                    ),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: loading
                      ? null
                      : () => Navigator.of(dialogContext).pop(),
                  child: const Text('Ahora no'),
                ),
                FilledButton(
                  onPressed: loading ? null : submit,
                  child: loading
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Continuar'),
                ),
              ],
            );
          },
        ),
      );
    } finally {
      passwordController.dispose();
      _passwordDialogOpen = false;
    }

    if (_pendingUatSessionId != null && mounted) {
      await _syncAcademicInfo();
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
    final receivedAt = DateTime.now();
    await widget.storage.addAttendanceHistoryEntry(
      confirmation.recordedAtForHistory(receivedAt),
      classId: confirmation.classId,
      className: confirmation.className,
      group: confirmation.group,
      classroom: confirmation.classroom,
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

  Future<void> _openHistory() async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => HistoryScreen(storage: widget.storage)),
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _advertiserSubscription?.cancel();
    _confirmationSubscription?.cancel();
    _attendanceSubscription?.cancel();
    _scheduleClock?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      _AttendancePage(
        profile: _profile,
        selectedClass: _selectedClass,
        schedule: _schedule,
        attendanceToleranceMinutes: _attendanceToleranceMinutes,
        scheduleLoading: _isSyncingAcademicInfo,
        isActive: _isActive,
        isChecking: _isChecking,
        confirmed: _confirmed,
        confirmedClassName: _confirmation?.classDisplayName,
        hasError: _hasError,
        onSelectClass: (index) => setState(() => _selectedClass = index),
        onRegister: _toggleAttendance,
        onOpenSchedule: () => setState(() => _selectedTab = 1),
        onOpenProfile: () => setState(() => _selectedTab = 2),
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
      bottomNavigationBar: _selectedTab == 0
          ? null
          : SafeArea(
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

class _AttendancePage extends StatefulWidget {
  const _AttendancePage({
    required this.profile,
    required this.selectedClass,
    required this.schedule,
    required this.attendanceToleranceMinutes,
    required this.scheduleLoading,
    required this.isActive,
    required this.isChecking,
    required this.confirmed,
    required this.confirmedClassName,
    required this.hasError,
    required this.onSelectClass,
    required this.onRegister,
    required this.onOpenSchedule,
    required this.onOpenProfile,
  });
  final StudentAcademicProfile profile;
  final int selectedClass;
  final List<StudentScheduleEntry> schedule;
  final int attendanceToleranceMinutes;
  final bool scheduleLoading;
  final bool isActive, isChecking, confirmed, hasError;
  final String? confirmedClassName;
  final ValueChanged<int> onSelectClass;
  final VoidCallback onRegister;
  final VoidCallback onOpenSchedule;
  final VoidCallback onOpenProfile;

  @override
  State<_AttendancePage> createState() => _AttendancePageState();
}

class _AttendancePageState extends State<_AttendancePage> {
  static const _navy = Color(0xFF003B5C);
  static const _orange = Color(0xFFD65F05);
  static const _lightBackground = Color(0xFFF7F8FA);

  late PageController _pageController;
  int? _silentPageChange;

  @override
  void initState() {
    super.initState();
    _pageController = PageController(
      initialPage: widget.selectedClass,
      viewportFraction: .24,
    );
  }

  @override
  void didUpdateWidget(covariant _AttendancePage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.schedule, widget.schedule)) {
      _pageController.dispose();
      _pageController = PageController(
        initialPage: widget.selectedClass,
        viewportFraction: .24,
      );
    }
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _selectClass(int index) {
    if (index == widget.selectedClass) return;
    if (_silentPageChange == index) {
      _silentPageChange = null;
    } else {
      _silentPageChange = null;
      unawaited(HapticFeedback.selectionClick());
    }
    widget.onSelectClass(index);
  }

  void _moveToClass(int index) {
    if (!_pageController.hasClients) return;
    _pageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final accent = dark ? const Color(0xFF5DC2F0) : _navy;
    final now = DateTime.now();
    final todayClasses = scheduleForWeekday(
      widget.schedule,
      DateTime.now().weekday,
    );
    final firstAvailable = todayClasses.indexWhere(
      (occurrence) => scheduleIsAvailable(
        occurrence,
        now,
        toleranceMinutes: widget.attendanceToleranceMinutes,
      ),
    );
    final safeSelectedClass = todayClasses.isEmpty
        ? 0
        : (widget.selectedClass.clamp(0, todayClasses.length - 1));
    final selectedIsAvailable =
        todayClasses.isNotEmpty &&
        scheduleIsAvailable(
          todayClasses[safeSelectedClass],
          now,
          toleranceMinutes: widget.attendanceToleranceMinutes,
        );
    final dayFinished = todayClasses.isNotEmpty && firstAvailable == -1;
    final effectiveSelectedClass = !dayFinished && !selectedIsAvailable
        ? firstAvailable
        : safeSelectedClass;
    final buttonTitle = widget.confirmed
        ? 'Asistencia registrada'
        : dayFinished
        ? 'Jornada terminada'
        : widget.isActive || widget.isChecking
        ? 'Cancelando registro'
        : widget.hasError
        ? 'Intentar de nuevo'
        : 'Registrar asistencia';

    if (!dayFinished &&
        todayClasses.isNotEmpty &&
        _pageController.hasClients &&
        (_pageController.page?.round() ?? effectiveSelectedClass) !=
            effectiveSelectedClass) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _pageController.hasClients) {
          _silentPageChange = effectiveSelectedClass;
          _pageController.jumpToPage(effectiveSelectedClass);
        }
      });
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxHeight < 650;
        return ColoredBox(
          color: dark
              ? Theme.of(context).scaffoldBackgroundColor
              : _lightBackground,
          child: Padding(
            padding: EdgeInsets.fromLTRB(20, compact ? 12 : 20, 20, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _StudentHomeHeader(
                  profile: widget.profile,
                  accent: accent,
                  onOpenProfile: widget.onOpenProfile,
                ),
                SizedBox(height: compact ? 16 : 24),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Tu día',
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontSize: compact ? 18 : 20,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: widget.onOpenSchedule,
                      style: TextButton.styleFrom(
                        foregroundColor: accent,
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        visualDensity: VisualDensity.compact,
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            'Ver horario completo',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          SizedBox(width: 5),
                          Icon(Icons.arrow_forward_rounded, size: 13),
                        ],
                      ),
                    ),
                  ],
                ),
                Text(
                  dayFinished
                      ? 'Tu horario de hoy ya terminó'
                      : todayClasses.length > 1
                      ? 'Desliza hacia arriba o abajo para elegir'
                      : 'Tu clase programada para hoy',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                SizedBox(height: compact ? 6 : 10),
                Expanded(
                  child: widget.scheduleLoading && widget.schedule.isEmpty
                      ? const Center(child: _AcademicLoadingCard())
                      : todayClasses.isEmpty
                      ? const Center(child: _NoClassesTodayCard())
                      : dayFinished
                      ? Center(
                          child: SizedBox(
                            height: compact ? 126 : 146,
                            child: _FinishedClassesPanel(classes: todayClasses),
                          ),
                        )
                      : Row(
                          children: [
                            Expanded(
                              child: PageView.builder(
                                key: const Key('attendance-class-carousel'),
                                controller: _pageController,
                                scrollDirection: Axis.vertical,
                                physics: const BouncingScrollPhysics(),
                                itemCount: todayClasses.length,
                                onPageChanged: _selectClass,
                                itemBuilder: (context, index) {
                                  final locked = scheduleHasEnded(
                                    todayClasses[index],
                                    now,
                                    toleranceMinutes:
                                        widget.attendanceToleranceMinutes,
                                  );
                                  return GestureDetector(
                                    behavior: HitTestBehavior.opaque,
                                    onTap: locked
                                        ? null
                                        : () => _moveToClass(index),
                                    child: _ClassCard(
                                      key: ValueKey('attendance-class-$index'),
                                      occurrence: todayClasses[index],
                                      selected: index == effectiveSelectedClass,
                                      locked: locked,
                                      now: now,
                                    ),
                                  );
                                },
                              ),
                            ),
                            if (todayClasses.length > 1) ...[
                              const SizedBox(width: 8),
                              _VerticalPageIndicator(
                                count: todayClasses.length,
                                index: effectiveSelectedClass,
                                color: accent,
                              ),
                            ],
                          ],
                        ),
                ),
                if (widget.confirmed) ...[
                  const SizedBox(height: 8),
                  _AttendanceConfirmedBanner(
                    className: widget.confirmedClassName,
                  ),
                ],
                SizedBox(height: compact ? 10 : 16),
                Semantics(
                  button: true,
                  label: buttonTitle,
                  child: SizedBox(
                    width: double.infinity,
                    height: compact ? 50 : 54,
                    child: FilledButton(
                      onPressed: widget.confirmed || dayFinished
                          ? null
                          : widget.onRegister,
                      style: FilledButton.styleFrom(
                        disabledBackgroundColor: widget.confirmed
                            ? AppColors.success
                            : dark
                            ? scheme.surfaceContainerHighest
                            : const Color(0xFFD5D8DC),
                        backgroundColor: widget.confirmed
                            ? AppColors.success
                            : _orange,
                        foregroundColor: Colors.white,
                        disabledForegroundColor: Colors.white,
                        shape: const StadiumBorder(),
                        elevation: 0,
                      ),
                      child: widget.isChecking
                          ? const SizedBox.square(
                              dimension: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.2,
                                color: Colors.white,
                              ),
                            )
                          : Text(
                              buttonTitle,
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 16,
                              ),
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

class _StudentHomeHeader extends StatelessWidget {
  const _StudentHomeHeader({
    required this.profile,
    required this.accent,
    required this.onOpenProfile,
  });

  final StudentAcademicProfile profile;
  final Color accent;
  final VoidCallback onOpenProfile;

  @override
  Widget build(BuildContext context) {
    final name = profile.displayName.trim();
    final firstName = name.isEmpty
        ? 'estudiante'
        : name.split(RegExp(r'\s+')).first;
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Hola, $firstName',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                _formattedHomeDate(DateTime.now()),
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ],
          ),
        ),
        const SizedBox(width: 16),
        Tooltip(
          message: 'Abrir perfil',
          child: Semantics(
            button: true,
            label: 'Abrir perfil de ${profile.displayName}',
            child: Material(
              color: accent,
              shape: const CircleBorder(),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: onOpenProfile,
                child: SizedBox.square(
                  dimension: 48,
                  child: Center(
                    child: Text(
                      _profileInitials(profile),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _ClassCard extends StatelessWidget {
  const _ClassCard({
    super.key,
    required this.occurrence,
    required this.selected,
    required this.now,
    this.locked = false,
  });
  final StudentScheduleOccurrence occurrence;
  final bool selected;
  final bool locked;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    const orange = Color(0xFFD65F05);
    const navy = Color(0xFF003B5C);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final start = _scheduleTimeForToday(occurrence.slot.startTime, now);
    final end = _scheduleTimeForToday(occurrence.slot.endTime, now);
    final inProgress =
        start != null &&
        end != null &&
        !now.isBefore(start) &&
        now.isBefore(end);

    late final String status;
    late final Color statusColor;
    if (locked) {
      status = 'Clase finalizada';
      statusColor = appMuted(context);
    } else if (inProgress) {
      status = 'Asistencia pendiente';
      statusColor = const Color(0xFFC92A20);
    } else if (start != null && start.isAfter(now)) {
      final minutes = start.difference(now).inMinutes + 1;
      status = minutes < 60 ? 'Comienza en $minutes min' : 'Próxima clase';
      statusColor = dark ? const Color(0xFF5DC2F0) : navy;
    } else {
      status = 'Disponible para registrar';
      statusColor = orange;
    }

    final roomAndState = [
      occurrence.entry.classroom ?? 'Aula por confirmar',
      if (inProgress) 'En curso',
    ].join(' · ');
    final timeColor = selected
        ? orange
        : dark
        ? const Color(0xFF5DC2F0)
        : navy;

    return AnimatedScale(
      scale: selected ? 1 : .95,
      duration: const Duration(milliseconds: 200),
      child: AnimatedOpacity(
        opacity: locked ? .48 : (selected ? 1 : .72),
        duration: const Duration(milliseconds: 200),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 5),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
            decoration: BoxDecoration(
              color: selected
                  ? dark
                        ? orange.withValues(alpha: .16)
                        : const Color(0xFFFFEEE2)
                  : appSurface(context),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: selected
                    ? orange.withValues(alpha: .52)
                    : dark
                    ? const Color(0xFF34383C)
                    : const Color(0xFFD7DDE2),
              ),
              boxShadow: selected && !dark
                  ? [
                      BoxShadow(
                        color: orange.withValues(alpha: .08),
                        blurRadius: 16,
                        offset: const Offset(0, 5),
                      ),
                    ]
                  : null,
            ),
            child: Row(
              children: [
                SizedBox(
                  width: 56,
                  child:
                      occurrence.slot.startTime != null &&
                          occurrence.slot.endTime != null
                      ? Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              occurrence.slot.startTime!,
                              style: TextStyle(
                                color: timeColor,
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              occurrence.slot.endTime!,
                              style: TextStyle(
                                color: timeColor,
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ],
                        )
                      : Text(
                          occurrence.slot.displayTime,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: timeColor,
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        occurrence.entry.subject,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        roomAndState,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(
                          context,
                        ).textTheme.bodySmall?.copyWith(fontSize: 10),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Container(
                            width: 7,
                            height: 7,
                            decoration: BoxDecoration(
                              color: statusColor,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              status,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: statusColor,
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _VerticalPageIndicator extends StatelessWidget {
  const _VerticalPageIndicator({
    required this.count,
    required this.index,
    required this.color,
  });

  final int count;
  final int index;
  final Color color;

  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Clase ${index + 1} de $count',
    child: SizedBox(
      width: 18,
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(count, (dotIndex) {
            final active = dotIndex == index;
            return AnimatedContainer(
              key: ValueKey(
                'class-indicator-$dotIndex-${active ? 'active' : 'inactive'}',
              ),
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOut,
              width: 7,
              height: active ? 22 : 7,
              margin: const EdgeInsets.symmetric(vertical: 3),
              decoration: BoxDecoration(
                color: active
                    ? color
                    : appMuted(context).withValues(alpha: .28),
                borderRadius: BorderRadius.circular(8),
              ),
            );
          }),
        ),
      ),
    ),
  );
}

class _AttendanceConfirmedBanner extends StatelessWidget {
  const _AttendanceConfirmedBanner({this.className});

  final String? className;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
    decoration: BoxDecoration(
      color: AppColors.success.withValues(alpha: .11),
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: AppColors.success.withValues(alpha: .28)),
    ),
    child: Row(
      children: [
        const Icon(Icons.verified_rounded, color: AppColors.success, size: 21),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            'Asistencia confirmada · ${className ?? 'Clase registrada'}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
          ),
        ),
      ],
    ),
  );
}

class _FinishedClassesPanel extends StatelessWidget {
  const _FinishedClassesPanel({required this.classes});

  final List<StudentScheduleOccurrence> classes;

  @override
  Widget build(BuildContext context) => Card(
    margin: EdgeInsets.zero,
    child: Stack(
      children: [
        for (var index = 0; index < classes.length.clamp(0, 3); index++)
          Positioned(
            left: 12.0 + index * 17,
            top: 18.0 + index * 10,
            bottom: 18.0 - index * 4,
            child: Container(
              width: 54,
              decoration: BoxDecoration(
                color: Theme.of(
                  context,
                ).colorScheme.secondary.withValues(alpha: .18 + index * .08),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: Theme.of(
                    context,
                  ).colorScheme.secondary.withValues(alpha: .3),
                ),
              ),
              alignment: Alignment.center,
              child: const Icon(Icons.lock_clock_rounded, size: 18),
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(105, 8, 14, 8),
          child: Center(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: SizedBox(
                width: 200,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.nightlight_round,
                      size: 19,
                      color: appMuted(context),
                    ),
                    const SizedBox(height: 5),
                    const Text(
                      'Ya no hay más materias disponibles el día de hoy',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
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
          width: 102,
          child: Text(
            occurrence.slot.displayTime,
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

String _formattedHomeDate(DateTime date) {
  const weekdays = [
    'Lunes',
    'Martes',
    'Miércoles',
    'Jueves',
    'Viernes',
    'Sábado',
    'Domingo',
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
  return '${weekdays[date.weekday - 1]}, ${date.day} de ${months[date.month - 1]}';
}

DateTime? _scheduleTimeForToday(String? value, DateTime now) {
  if (value == null) return null;
  final parts = value.split(':');
  if (parts.length != 2) return null;
  final hour = int.tryParse(parts[0]);
  final minute = int.tryParse(parts[1]);
  if (hour == null || minute == null) return null;
  return DateTime(now.year, now.month, now.day, hour, minute);
}

String _profileInitials(StudentAcademicProfile profile) {
  final name = profile.displayName.trim();
  if (name.isEmpty) return 'FI';
  return name
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .take(2)
      .map((part) => part.substring(0, 1))
      .join()
      .toUpperCase();
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
