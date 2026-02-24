import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/attendance_record.dart';
import '../services/ble_scanner_service.dart';
import '../services/local_storage_service.dart';
import '../services/sync_service.dart';
import 'history_screen.dart';

class HomeScreen extends StatefulWidget {
  final LocalStorageService storage;
  final SyncService syncService;

  const HomeScreen({
    super.key,
    required this.storage,
    required this.syncService,
  });

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen>
    with WidgetsBindingObserver, SingleTickerProviderStateMixin {
  final BleScannerService _bleService = BleScannerService();
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  _ScanState _scanState = _ScanState.idle;
  String _statusText = 'Iniciando...';
  String _syncStatus = '';
  int _totalRecords = 0;
  int _unsyncedCount = 0;

  StreamSubscription<String>? _bleSub;
  StreamSubscription<String>? _syncSub;

  // Auto-scan: prevent duplicate scans within cooldown
  DateTime? _lastDetection;
  static const _cooldown = Duration(minutes: 5);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    );
    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.15).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    _bleSub = _bleService.statusStream.listen((status) {
      if (mounted) setState(() => _statusText = status);
    });

    _syncSub = widget.syncService.syncStatusStream.listen((status) {
      if (mounted) setState(() => _syncStatus = status);
    });

    _updateCounts();

    // Auto-scan on launch (simulates background wake)
    Future.delayed(const Duration(milliseconds: 500), () {
      if (mounted) _autoScan();
    });
  }

  /// Called when app returns to foreground — triggers auto-scan
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _autoScan();
    }
  }

  /// Auto-scan with cooldown to prevent duplicate registrations
  void _autoScan() {
    if (_lastDetection != null &&
        DateTime.now().difference(_lastDetection!) < _cooldown) {
      setState(() {
        _statusText = 'Asistencia ya registrada recientemente';
        _scanState = _ScanState.idle;
      });
      return;
    }
    _startScan();
  }

  void _updateCounts() {
    setState(() {
      _totalRecords = widget.storage.totalRecords;
      _unsyncedCount = widget.storage.unsyncedCount;
    });
  }

  Future<void> _startScan() async {
    if (_scanState == _ScanState.scanning) return;

    HapticFeedback.mediumImpact();
    setState(() {
      _scanState = _ScanState.scanning;
      _statusText = 'Buscando beacon del salón...';
    });
    _pulseController.repeat(reverse: true);

    final result = await _bleService.scanForBeacon();

    _pulseController.stop();
    _pulseController.reset();

    if (!mounted) return;

    switch (result) {
      case BeaconScanResult.detected:
        HapticFeedback.heavyImpact();
        _lastDetection = DateTime.now();
        setState(() {
          _scanState = _ScanState.detected;
          _statusText = '¡Asistencia registrada!';
        });

        // Save locally
        final record = AttendanceRecord(
          id: '${widget.storage.matricula}_${DateTime.now().millisecondsSinceEpoch}',
          studentName:
              widget.storage.matricula, // Using matricula as identifier
          matricula: widget.storage.matricula,
          beaconId: BleScannerService.beaconName,
          detectedAt: DateTime.now(),
          deviceInfo: _getDeviceInfo(),
        );
        await widget.storage.saveRecord(record);
        _updateCounts();

        // Auto-sync
        widget.syncService.syncPendingRecords();

        // Reset after a moment
        await Future.delayed(const Duration(seconds: 3));
        if (mounted) {
          setState(() {
            _scanState = _ScanState.idle;
            _statusText = 'Toca para escanear de nuevo';
          });
        }
        break;

      case BeaconScanResult.timeout:
        setState(() {
          _scanState = _ScanState.failed;
          _statusText = 'Beacon no encontrado';
        });
        await Future.delayed(const Duration(seconds: 2));
        if (mounted) {
          setState(() {
            _scanState = _ScanState.idle;
            _statusText = 'Toca para intentar de nuevo';
          });
        }
        break;

      case BeaconScanResult.bluetoothUnavailable:
        setState(() {
          _scanState = _ScanState.failed;
          _statusText = 'Activa el Bluetooth';
        });
        break;

      case BeaconScanResult.error:
        setState(() {
          _scanState = _ScanState.failed;
          _statusText = 'Error — intenta de nuevo';
        });
        await Future.delayed(const Duration(seconds: 2));
        if (mounted) {
          setState(() {
            _scanState = _ScanState.idle;
            _statusText = 'Toca para intentar de nuevo';
          });
        }
        break;
    }
  }

  String _getDeviceInfo() {
    try {
      if (Platform.isIOS) return 'iOS';
      if (Platform.isAndroid) return 'Android';
    } catch (_) {}
    return 'Unknown';
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pulseController.dispose();
    _bleService.dispose();
    _bleSub?.cancel();
    _syncSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0A0A0A),
      body: SafeArea(
        child: Column(
          children: [
            // ── Header ──
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
              child: Row(
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Presencia',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 24,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        widget.storage.matricula,
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.4),
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                  const Spacer(),
                  IconButton(
                    onPressed: () async {
                      await Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) =>
                              HistoryScreen(storage: widget.storage),
                        ),
                      );
                      _updateCounts();
                    },
                    icon: const Icon(
                      Icons.history_rounded,
                      color: Colors.white54,
                      size: 28,
                    ),
                  ),
                ],
              ),
            ),

            const Spacer(),

            // ── Central scan button ──
            GestureDetector(
              onTap: _scanState == _ScanState.scanning ? null : _startScan,
              child: ScaleTransition(
                scale: _pulseAnimation,
                child: Container(
                  width: 200,
                  height: 200,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: _getGradientColors(),
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: _getGradientColors()[0].withOpacity(0.3),
                        blurRadius: 40,
                        spreadRadius: 5,
                      ),
                    ],
                  ),
                  child: Icon(_getIcon(), color: Colors.white, size: 72),
                ),
              ),
            ),
            const SizedBox(height: 32),

            // ── Status text ──
            Text(
              _statusText,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
            if (_scanState == _ScanState.scanning) ...[
              const SizedBox(height: 16),
              SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(
                  strokeWidth: 2.5,
                  color: _getGradientColors()[0],
                ),
              ),
            ],

            const Spacer(),

            // ── Stats bar ──
            Container(
              margin: const EdgeInsets.all(24),
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: const Color(0xFF1C1C1E),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFF2C2C2E)),
              ),
              child: Row(
                children: [
                  _buildStat(
                    '$_totalRecords',
                    'Registros',
                    Icons.check_circle_outline_rounded,
                  ),
                  Container(
                    width: 1,
                    height: 40,
                    color: const Color(0xFF2C2C2E),
                  ),
                  _buildStat(
                    _unsyncedCount == 0 ? '✓' : '$_unsyncedCount',
                    _unsyncedCount == 0 ? 'Sincronizado' : 'Pendientes',
                    _unsyncedCount == 0
                        ? Icons.cloud_done_rounded
                        : Icons.cloud_upload_rounded,
                  ),
                ],
              ),
            ),

            // ── Sync status ──
            if (_syncStatus.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Text(
                  _syncStatus,
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.3),
                    fontSize: 12,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  List<Color> _getGradientColors() {
    switch (_scanState) {
      case _ScanState.idle:
        return [const Color(0xFFFF6B9D), const Color(0xFFC44DFF)];
      case _ScanState.scanning:
        return [const Color(0xFF6B9DFF), const Color(0xFF4DC4FF)];
      case _ScanState.detected:
        return [const Color(0xFF4DFF88), const Color(0xFF00C853)];
      case _ScanState.failed:
        return [const Color(0xFFFF9D6B), const Color(0xFFFF6B6B)];
    }
  }

  IconData _getIcon() {
    switch (_scanState) {
      case _ScanState.idle:
        return Icons.bluetooth_searching_rounded;
      case _ScanState.scanning:
        return Icons.bluetooth_searching_rounded;
      case _ScanState.detected:
        return Icons.check_rounded;
      case _ScanState.failed:
        return Icons.bluetooth_disabled_rounded;
    }
  }

  Widget _buildStat(String value, String label, IconData icon) {
    return Expanded(
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: Colors.white38, size: 20),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(
                label,
                style: TextStyle(
                  color: Colors.white.withOpacity(0.4),
                  fontSize: 11,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

enum _ScanState { idle, scanning, detected, failed }
