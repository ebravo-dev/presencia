import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class SetupScreen extends StatefulWidget {
  final Future<void> Function(String matricula) onComplete;

  const SetupScreen({super.key, required this.onComplete});

  @override
  State<SetupScreen> createState() => _SetupScreenState();
}

class _SetupScreenState extends State<SetupScreen> {
  final _matriculaController = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _matriculaController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final matricula = _matriculaController.text.trim();

    if (matricula.isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Ingresa tu matrícula')));
      return;
    }

    setState(() => _loading = true);
    HapticFeedback.mediumImpact();
    await widget.onComplete(matricula);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0A0A0A),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Spacer(),
              // Icon
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFFFF6B9D), Color(0xFFC44DFF)],
                  ),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Icon(
                  Icons.bluetooth_rounded,
                  color: Colors.white,
                  size: 40,
                ),
              ),
              const SizedBox(height: 32),
              const Text(
                'Presencia\nAlumno',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 36,
                  fontWeight: FontWeight.w800,
                  height: 1.1,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'Tu dispositivo emitirá tu matrícula por Bluetooth para que el profesor registre tu asistencia.',
                style: TextStyle(
                  color: Colors.white.withOpacity(0.5),
                  fontSize: 16,
                ),
              ),
              const SizedBox(height: 40),
              // Matricula
              Container(
                decoration: BoxDecoration(
                  color: const Color(0xFF1C1C1E),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFF2C2C2E)),
                ),
                child: TextField(
                  controller: _matriculaController,
                  textCapitalization: TextCapitalization.characters,
                  style: const TextStyle(color: Colors.white, fontSize: 16),
                  decoration: const InputDecoration(
                    prefixIcon: Icon(
                      Icons.badge_rounded,
                      color: Colors.white38,
                    ),
                    hintText: 'Tu matrícula (ej. A2130587)',
                    hintStyle: TextStyle(color: Colors.white30),
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 18,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 32),
              // Button
              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: _loading ? null : _submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFFF6B9D),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                    elevation: 0,
                  ),
                  child: _loading
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                            color: Colors.white,
                          ),
                        )
                      : const Text(
                          'Comenzar',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                ),
              ),
              const Spacer(),
            ],
          ),
        ),
      ),
    );
  }
}
