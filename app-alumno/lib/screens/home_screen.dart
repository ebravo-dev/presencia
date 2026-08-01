import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../services/attendance_session_service.dart';
import '../services/ble_advertiser_service.dart';
import '../services/local_storage_service.dart';
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
    required this.themeMode,
    required this.onThemeModeChanged,
  });

  final LocalStorageService storage;
  final BleAdvertiserService bleService;
  final AttendanceSessionService attendanceSession;
  final StudentDeviceBindingService deviceBindingService;
  final ThemeMode themeMode;
  final ValueChanged<ThemeMode> onThemeModeChanged;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  AdvertiserState _advertiserState = AdvertiserState.idle;
  AttendanceSessionState _attendanceState = AttendanceSessionState.idle;
  StreamSubscription<AdvertiserState>? _advertiserSubscription;
  StreamSubscription<String>? _confirmationSubscription;
  StreamSubscription<AttendanceSessionSnapshot>? _attendanceSubscription;
  int _selectedTab = 0;
  int _selectedClass = 1;
  int _historyCount = 0;
  bool _isSyncingDeviceBinding = false;
  String? _confirmationId;

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
    _historyCount = widget.storage.attendanceHistoryCount;
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
      _,
    ) {
      if (!mounted) return;
      final id = DateTime.now().microsecondsSinceEpoch.toString();
      setState(() => _confirmationId = id);
      unawaited(_saveAttendance());
      unawaited(widget.attendanceSession.stop());
      Future<void>.delayed(const Duration(seconds: 5), () {
        if (mounted && _confirmationId == id) {
          setState(() => _confirmationId = null);
        }
      });
    });
    unawaited(_syncDeviceBinding());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused && (_isActive || _isChecking)) {
      unawaited(widget.attendanceSession.stop());
    }
    if (state == AppLifecycleState.resumed) {
      unawaited(_syncDeviceBinding());
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

  Future<void> _saveAttendance() async {
    await widget.storage.addAttendanceHistoryEntry(DateTime.now());
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
        isActive: _isActive,
        isChecking: _isChecking,
        confirmed: _confirmed,
        hasError: _hasError,
        onSelectClass: (index) => setState(() => _selectedClass = index),
        onRegister: _toggleAttendance,
      ),
      const _SchedulePage(),
      _ProfilePage(
        matricula: widget.storage.matricula,
        email: widget.storage.institutionalEmail,
        themeMode: widget.themeMode,
        onThemeModeChanged: widget.onThemeModeChanged,
        onOpenHistory: _openHistory,
      ),
    ];
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: IndexedStack(index: _selectedTab, children: pages),
          ),
        ),
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Center(
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
    required this.isActive,
    required this.isChecking,
    required this.confirmed,
    required this.hasError,
    required this.onSelectClass,
    required this.onRegister,
  });
  final int historyCount;
  final int selectedClass;
  final bool isActive, isChecking, confirmed, hasError;
  final ValueChanged<int> onSelectClass;
  final VoidCallback onRegister;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final ratio = (historyCount / 10).clamp(0.0, 1.0);
    final buttonTitle = confirmed
        ? 'Asistencia registrada'
        : isActive || isChecking
        ? 'Cancelando registro'
        : hasError
        ? 'Intentar de nuevo'
        : 'Registrar asistencia';
    final buttonDetail = confirmed
        ? 'Tu asistencia quedó confirmada'
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
                            '${(ratio * 100).round()}%',
                            style: Theme.of(
                              context,
                            ).textTheme.headlineSmall?.copyWith(fontSize: 42),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'asistencia general',
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                        ],
                      ),
                    ),
                    SizedBox(
                      width: 126,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '$historyCount de 10 clases',
                            style: Theme.of(context).textTheme.bodyMedium
                                ?.copyWith(fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 12),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(5),
                            child: LinearProgressIndicator(
                              value: ratio,
                              minHeight: 10,
                              color: scheme.primary,
                              backgroundColor: scheme.surfaceContainerHighest,
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
            child: SizedBox(
              height: 154,
              child: PageView.builder(
                controller: PageController(
                  viewportFraction: .74,
                  initialPage: selectedClass,
                ),
                itemCount: _classes.length,
                onPageChanged: onSelectClass,
                itemBuilder: (context, index) => _ClassCard(
                  item: _classes[index],
                  selected: index == selectedClass,
                ),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.only(top: 14),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  _classes.length,
                  (index) => AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    margin: const EdgeInsets.symmetric(horizontal: 5),
                    width: index == selectedClass ? 18 : 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: index == selectedClass
                          ? scheme.primary
                          : appMuted(context).withValues(alpha: .4),
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
              ),
            ),
          ),
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
  const _SchedulePage();
  @override
  State<_SchedulePage> createState() => _SchedulePageState();
}

class _SchedulePageState extends State<_SchedulePage> {
  int _day = DateTime.now().weekday.clamp(1, 5) - 1;
  static const _days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _PageHeader(title: 'Horario', subtitle: 'Semana actual'),
        const SizedBox(height: 24),
        SizedBox(
          height: 44,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: _days.length,
            separatorBuilder: (_, _) => const SizedBox(width: 10),
            itemBuilder: (_, index) => SizedBox(
              width: 62,
              child: ChoiceChip(
                label: Text(_days[index]),
                selected: _day == index,
                onSelected: (_) => setState(() => _day = index),
                showCheckmark: false,
                selectedColor: Theme.of(context).colorScheme.primary,
                labelStyle: TextStyle(
                  color: _day == index ? Colors.white : null,
                  fontWeight: FontWeight.w700,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                  side: BorderSide.none,
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 26),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: _day == 4
                ? const _EmptySchedule()
                : const Column(
                    children: [
                      _ScheduleItem(
                        time: '08:00',
                        subject: 'Sin clases sincronizadas',
                        room: 'Actualiza tu información académica',
                        color: AppColors.indigo,
                      ),
                      SizedBox(height: 14),
                      _ScheduleItem(
                        time: '10:00',
                        subject: 'Horario disponible pronto',
                        room: 'Los datos aparecerán aquí',
                        color: AppColors.orange,
                      ),
                    ],
                  ),
          ),
        ),
      ],
    ),
  );
}

class _ProfilePage extends StatelessWidget {
  const _ProfilePage({
    required this.matricula,
    required this.email,
    required this.themeMode,
    required this.onThemeModeChanged,
    required this.onOpenHistory,
  });
  final String matricula, email;
  final ThemeMode themeMode;
  final ValueChanged<ThemeMode> onThemeModeChanged;
  final VoidCallback onOpenHistory;
  @override
  Widget build(BuildContext context) {
    final initials = matricula.isEmpty
        ? 'FI'
        : matricula.substring(0, matricula.length.clamp(0, 2)).toUpperCase();
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
            child: SizedBox(
              height: 190,
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
                                'Estudiante FIUAT',
                                style: Theme.of(context).textTheme.titleMedium,
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Facultad de Ingeniería',
                                style: Theme.of(context).textTheme.bodyMedium,
                              ),
                              const SizedBox(height: 6),
                              Text(
                                'Matrícula $matricula',
                                style: Theme.of(context).textTheme.labelSmall,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const Spacer(),
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
                    email.isEmpty ? 'No sincronizado' : email,
                  ),
                  const Divider(height: 32),
                  const _ProfileField('SEMESTRE', 'Información pendiente'),
                  const Divider(height: 32),
                  const _ProfileField('CAMPUS', 'Ciudad Victoria'),
                  const Divider(height: 32),
                  const _ProfileField('PROGRAMA', 'Facultad de Ingeniería'),
                ],
              ),
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
  const _ClassCard({required this.item, required this.selected});
  final _ClassItem item;
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
                  item.subject,
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
                      item.room,
                      style: TextStyle(
                        color: selected ? Colors.white70 : appMuted(context),
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 5),
                Text(
                  item.time,
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
  const _ScheduleItem({
    required this.time,
    required this.subject,
    required this.room,
    required this.color,
  });
  final String time, subject, room;
  final Color color;
  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      SizedBox(
        width: 54,
        child: Text(
          time,
          style: Theme.of(
            context,
          ).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w700),
        ),
      ),
      Expanded(
        child: Container(
          constraints: const BoxConstraints(minHeight: 65),
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
                subject,
                style: Theme.of(
                  context,
                ).textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 4),
              Text(room, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      ),
    ],
  );
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

class _ClassItem {
  const _ClassItem(this.subject, this.room, this.time);
  final String subject, room, time;
}

const _classes = [
  _ClassItem('Cálculo integral', 'Aula pendiente', '08:00 - 09:00'),
  _ClassItem(
    'Tu clase actual',
    'Disponible al iniciar el pase',
    'Horario por sincronizar',
  ),
  _ClassItem('Programación móvil', 'Aula pendiente', '10:00 - 11:00'),
];
