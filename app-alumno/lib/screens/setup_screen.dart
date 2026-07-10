import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class SetupScreen extends StatefulWidget {
  final Future<void> Function({
    required String username,
    required String password,
  })
  onComplete;

  const SetupScreen({super.key, required this.onComplete});

  @override
  State<SetupScreen> createState() => _SetupScreenState();
}

class _SetupScreenState extends State<SetupScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _loading = false;
  String? _errorText;
  bool _obscurePassword = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final username = _emailController.text.trim().toLowerCase();
    final password = _passwordController.text;

    if (username.isEmpty) {
      setState(() => _errorText = 'Ingresa tu correo institucional');
      return;
    }

    if (!username.contains('@')) {
      setState(() => _errorText = 'Ingresa un correo institucional válido');
      return;
    }

    if (password.isEmpty) {
      setState(() => _errorText = 'Ingresa tu contraseña');
      return;
    }

    FocusScope.of(context).unfocus();
    setState(() {
      _loading = true;
      _errorText = null;
    });
    HapticFeedback.mediumImpact();
    try {
      await widget.onComplete(username: username, password: password);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _errorText = error.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7FAFE),
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
                    SizedBox(height: constraints.maxHeight < 700 ? 34 : 64),
                    Container(
                      padding: const EdgeInsets.all(22),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(28),
                        border: Border.all(color: const Color(0xFFDAE2F0)),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(
                              0xFF2348ED,
                            ).withValues(alpha: 0.08),
                            blurRadius: 26,
                            offset: const Offset(0, 16),
                          ),
                        ],
                      ),
                      child: const Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(
                            Icons.check_circle_rounded,
                            color: Color(0xFF10AF74),
                            size: 36,
                          ),
                          SizedBox(height: 14),
                          Text(
                            'Pase de lista rápido',
                            style: TextStyle(
                              color: Color(0xFF131825),
                              fontSize: 25,
                              fontWeight: FontWeight.w900,
                              height: 1.08,
                            ),
                          ),
                          SizedBox(height: 8),
                          Text(
                            'Vincula tu cuenta institucional para registrar asistencia desde tu celular.',
                            style: TextStyle(
                              color: Color(0xFF65728B),
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              height: 1.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 28),
                    const Text(
                      'Inicia sesión',
                      style: TextStyle(
                        color: Color(0xFF131825),
                        fontSize: 28,
                        fontWeight: FontWeight.w900,
                        height: 1.05,
                      ),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Usa tu cuenta institucional UAT. Al iniciar sesión se vinculará este celular con tu matrícula y UUID de asistencia.',
                      style: TextStyle(
                        color: Color(0xFF65728B),
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        height: 1.45,
                      ),
                    ),
                    const SizedBox(height: 34),
                    TextField(
                      controller: _emailController,
                      enabled: !_loading,
                      keyboardType: TextInputType.emailAddress,
                      textCapitalization: TextCapitalization.none,
                      autocorrect: false,
                      textInputAction: TextInputAction.next,
                      onChanged: (_) {
                        if (_errorText != null) {
                          setState(() => _errorText = null);
                        }
                      },
                      style: const TextStyle(
                        color: Color(0xFF131825),
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0,
                      ),
                      decoration: InputDecoration(
                        labelText: 'Correo institucional',
                        hintText: 'tu.correo@alumnos.uat.edu.mx',
                        prefixIcon: const Icon(Icons.alternate_email_rounded),
                      ),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _passwordController,
                      enabled: !_loading,
                      obscureText: _obscurePassword,
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => _loading ? null : _submit(),
                      onChanged: (_) {
                        if (_errorText != null) {
                          setState(() => _errorText = null);
                        }
                      },
                      style: const TextStyle(
                        color: Color(0xFF131825),
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0,
                      ),
                      decoration: InputDecoration(
                        labelText: 'Contraseña',
                        errorText: _errorText,
                        prefixIcon: const Icon(Icons.lock_rounded),
                        suffixIcon: IconButton(
                          onPressed: _loading
                              ? null
                              : () => setState(
                                  () => _obscurePassword = !_obscurePassword,
                                ),
                          icon: Icon(
                            _obscurePassword
                                ? Icons.visibility_rounded
                                : Icons.visibility_off_rounded,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    _InfoStrip(
                      icon: Icons.verified_user_rounded,
                      text:
                          'La matrícula se obtiene desde UAT; no se captura manualmente.',
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
            color: const Color(0xFFE0ECFF),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFDAE2F0)),
          ),
          child: const Icon(
            Icons.school_rounded,
            color: Color(0xFF2348ED),
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
                color: Color(0xFF131825),
                fontSize: 18,
                fontWeight: FontWeight.w900,
              ),
            ),
            SizedBox(height: 2),
            Text(
              'Alumno',
              style: TextStyle(
                color: Color(0xFF65728B),
                fontSize: 13,
                fontWeight: FontWeight.w700,
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
        color: const Color(0xFFE0ECFF),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFDAE2F0)),
      ),
      child: Row(
        children: [
          Icon(icon, color: const Color(0xFF2348ED), size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                color: Color(0xFF65728B),
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
