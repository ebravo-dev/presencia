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
  String? _errorText;

  @override
  void dispose() {
    _matriculaController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final matricula = _matriculaController.text.trim().toUpperCase();

    if (matricula.isEmpty) {
      setState(() => _errorText = 'Ingresa tu matrícula');
      return;
    }

    if (matricula.length < 5) {
      setState(() => _errorText = 'Revisa que tu matrícula esté completa');
      return;
    }

    FocusScope.of(context).unfocus();
    setState(() {
      _loading = true;
      _errorText = null;
    });
    HapticFeedback.mediumImpact();
    await widget.onComplete(matricula);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B0F14),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            return SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: constraints.maxHeight),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 24),
                    const _BrandHeader(),
                    SizedBox(height: constraints.maxHeight < 700 ? 44 : 84),
                    const Text(
                      'Vincula tu celular',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 34,
                        fontWeight: FontWeight.w800,
                        height: 1.05,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Tu matrícula quedará asociada a este dispositivo. Un cambio de celular deberá ser autorizado por un maestro.',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.62),
                        fontSize: 15,
                        height: 1.45,
                      ),
                    ),
                    const SizedBox(height: 34),
                    TextField(
                      controller: _matriculaController,
                      enabled: !_loading,
                      textCapitalization: TextCapitalization.characters,
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => _loading ? null : _submit(),
                      onChanged: (_) {
                        if (_errorText != null) {
                          setState(() => _errorText = null);
                        }
                      },
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(
                          RegExp(r'[a-zA-Z0-9]'),
                        ),
                        LengthLimitingTextInputFormatter(14),
                        TextInputFormatter.withFunction((oldValue, newValue) {
                          return newValue.copyWith(
                            text: newValue.text.toUpperCase(),
                            selection: newValue.selection,
                          );
                        }),
                      ],
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0,
                      ),
                      decoration: InputDecoration(
                        labelText: 'Matrícula',
                        hintText: 'A2130587',
                        errorText: _errorText,
                        prefixIcon: const Icon(Icons.badge_rounded),
                      ),
                    ),
                    const SizedBox(height: 18),
                    _InfoStrip(
                      icon: Icons.verified_user_rounded,
                      text:
                          'Este vínculo ayuda a evitar registros desde otro celular.',
                    ),
                    const SizedBox(height: 28),
                    SizedBox(
                      height: 56,
                      child: FilledButton.icon(
                        onPressed: _loading ? null : _submit,
                        icon: _loading
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.4,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.arrow_forward_rounded),
                        label: Text(_loading ? 'Vinculando' : 'Continuar'),
                      ),
                    ),
                    const SizedBox(height: 24),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _BrandHeader extends StatelessWidget {
  const _BrandHeader();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: const Color(0xFF17202B),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFF263241)),
          ),
          child: const Icon(
            Icons.school_rounded,
            color: Color(0xFF62D6A2),
            size: 26,
          ),
        ),
        const SizedBox(width: 12),
        const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Presencia',
              style: TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w800,
              ),
            ),
            SizedBox(height: 2),
            Text(
              'Alumno',
              style: TextStyle(
                color: Color(0xFF8F9BA8),
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _InfoStrip extends StatelessWidget {
  final IconData icon;
  final String text;

  const _InfoStrip({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF111923),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFF223040)),
      ),
      child: Row(
        children: [
          Icon(icon, color: const Color(0xFF62D6A2), size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.68),
                fontSize: 13,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
