import 'dart:async';
import 'package:flutter/material.dart';
import '../services/ble_advertiser_service.dart';
import '../services/local_storage_service.dart';

class HomeScreen extends StatefulWidget {
  final LocalStorageService storage;
  final BleAdvertiserService bleService;

  const HomeScreen({
    super.key,
    required this.storage,
    required this.bleService,
  });

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  AdvertiserState _advState = AdvertiserState.idle;
  String _statusText = 'Iniciando...';
  String? _lastConfirmation;

  StreamSubscription<AdvertiserState>? _stateSub;
  StreamSubscription<String>? _confirmSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    _stateSub = widget.bleService.stateStream.listen((state) {
      if (mounted) {
        setState(() {
          _advState = state;
          _statusText = _textForState(state);
        });
      }
    });

    _confirmSub = widget.bleService.confirmationStream.listen((message) {
      if (mounted) {
        setState(() {
          _lastConfirmation = message;
          _statusText = '¡Asistencia confirmada!';
        });
        // Reset after a few seconds
        Future.delayed(const Duration(seconds: 5), () {
          if (mounted && _lastConfirmation == message) {
            setState(() {
              _lastConfirmation = null;
              _statusText = _textForState(_advState);
            });
          }
        });
      }
    });

    // Set initial state
    _advState = widget.bleService.currentState;
    _statusText = _textForState(_advState);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // Re-start advertising if needed
      widget.bleService.startAdvertising();
    }
  }

  String _textForState(AdvertiserState state) {
    switch (state) {
      case AdvertiserState.advertising:
        return 'Emitiendo tu matrícula por BLE';
      case AdvertiserState.bluetoothOff:
        return 'Activa el Bluetooth';
      case AdvertiserState.error:
        return 'Error — revisa el Bluetooth';
      case AdvertiserState.idle:
        return 'Toca para iniciar emisión';
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _stateSub?.cancel();
    _confirmSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isAdvertising = _advState == AdvertiserState.advertising;
    final isConfirmed = _lastConfirmation != null;

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
                ],
              ),
            ),

            const Spacer(),

            // ── Central status indicator ──
            GestureDetector(
              onTap: () {
                if (!isAdvertising) {
                  widget.bleService.startAdvertising();
                }
              },
              child: Container(
                width: 200,
                height: 200,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: _getGradientColors(isAdvertising, isConfirmed),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: _getGradientColors(
                        isAdvertising,
                        isConfirmed,
                      )[0].withOpacity(0.3),
                      blurRadius: 40,
                      spreadRadius: 5,
                    ),
                  ],
                ),
                child: Icon(
                  _getIcon(isAdvertising, isConfirmed),
                  color: Colors.white,
                  size: 72,
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

            if (isAdvertising && !isConfirmed) ...[
              const SizedBox(height: 16),
              Text(
                'El profesor detectará tu dispositivo automáticamente',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white.withOpacity(0.3),
                  fontSize: 13,
                ),
              ),
            ],

            const Spacer(),

            // ── Info bar ──
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
                  Icon(
                    isAdvertising
                        ? Icons.bluetooth_connected_rounded
                        : Icons.bluetooth_disabled_rounded,
                    color: isAdvertising
                        ? const Color(0xFF4DFF88)
                        : Colors.white38,
                    size: 24,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          isAdvertising ? 'BLE Activo' : 'BLE Inactivo',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Text(
                          isAdvertising
                              ? 'Tu matrícula está visible para el profesor'
                              : 'Necesitas Bluetooth encendido',
                          style: TextStyle(
                            color: Colors.white.withOpacity(0.4),
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<Color> _getGradientColors(bool isAdvertising, bool isConfirmed) {
    if (isConfirmed) {
      return [const Color(0xFF4DFF88), const Color(0xFF00C853)];
    }
    if (isAdvertising) {
      return [const Color(0xFF6B9DFF), const Color(0xFF4DC4FF)];
    }
    if (_advState == AdvertiserState.bluetoothOff ||
        _advState == AdvertiserState.error) {
      return [const Color(0xFFFF9D6B), const Color(0xFFFF6B6B)];
    }
    return [const Color(0xFFFF6B9D), const Color(0xFFC44DFF)];
  }

  IconData _getIcon(bool isAdvertising, bool isConfirmed) {
    if (isConfirmed) return Icons.check_rounded;
    if (isAdvertising) return Icons.bluetooth_rounded;
    if (_advState == AdvertiserState.bluetoothOff) {
      return Icons.bluetooth_disabled_rounded;
    }
    return Icons.bluetooth_rounded;
  }
}
