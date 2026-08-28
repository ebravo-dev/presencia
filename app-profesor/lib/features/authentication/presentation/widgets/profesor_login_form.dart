import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/uat_colors.dart';
import '../../providers/profesor_auth_provider.dart';
import '../../../../services/auth_storage_service.dart';
import '../../../../shared/widgets/email_suggestion_bar.dart';

class ProfesorLoginForm extends ConsumerStatefulWidget {
  const ProfesorLoginForm({super.key});

  @override
  ConsumerState<ProfesorLoginForm> createState() => _ProfesorLoginFormState();
}

class _ProfesorLoginFormState extends ConsumerState<ProfesorLoginForm> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _emailFocusNode = FocusNode();

  bool _obscurePassword = true;
  bool _isFormValid = false;

  @override
  void initState() {
    super.initState();
    _emailController.addListener(_validateForm);
    _passwordController.addListener(_validateForm);
    _emailController.addListener(_onEmailChanged);
    _emailFocusNode.addListener(_onEmailFocusChanged);

    // Pre-fill email from last login attempt (e.g., after credential error)
    final lastEmail = AuthStorageService().getLastEmail();
    if (lastEmail != null && lastEmail.isNotEmpty) {
      _emailController.text = lastEmail;
    }
  }

  @override
  void dispose() {
    try {
      EmailSuggestionOverlay.hide();
    } catch (e) {
      // Ignorar errores al limpiar overlay
    }
    _emailController.dispose();
    _passwordController.dispose();
    _emailFocusNode.dispose();
    super.dispose();
  }

  void _onEmailChanged() {
    final text = _emailController.text;
    final atIndex = text.indexOf('@');
    final shouldShow =
        _emailFocusNode.hasFocus && atIndex != -1 && atIndex < text.length - 1;

    if (shouldShow) {
      final userPart = text.substring(0, atIndex + 1);
      EmailSuggestionOverlay.show(
        context: context,
        currentText: userPart,
        onSuggestionTapped: _onSuggestionTapped,
      );
    } else {
      EmailSuggestionOverlay.hide();
    }

    _validateForm();
  }

  void _onEmailFocusChanged() {
    if (!_emailFocusNode.hasFocus) {
      EmailSuggestionOverlay.hide();
    } else {
      _onEmailChanged();
    }
  }

  void _onSuggestionTapped(String suggestion) {
    _emailController.text = suggestion;
    _emailController.selection = TextSelection.fromPosition(
      TextPosition(offset: suggestion.length),
    );
    EmailSuggestionOverlay.hide();
    FocusScope.of(context).nextFocus();
  }

  void _validateForm() {
    final isValid =
        _emailController.text.isNotEmpty &&
        _passwordController.text.isNotEmpty &&
        _emailController.text.contains('@');

    if (_isFormValid != isValid) {
      setState(() {
        _isFormValid = isValid;
      });
    }

    if (mounted) {
      setState(() {});
    }
  }

  void _handleSubmit() {
    if (_formKey.currentState?.validate() ?? false) {
      try {
        TextInput.finishAutofillContext();
      } catch (e) {
        // Ignorar errores de autofill
      }

      // Save email for pre-fill on credential error return
      AuthStorageService().saveLastEmail(_emailController.text.trim());

      ref
          .read(profesorAuthProvider.notifier)
          .login(_emailController.text.trim(), _passwordController.text);
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(profesorAuthProvider);

    // Mostrar error si existe
    ref.listen<ProfesorAuthState>(profesorAuthProvider, (previous, next) {
      if (next.hasError && next.errorMessage != null && context.mounted) {
        // Save references before showing SnackBar to avoid deactivated widget error
        final scaffoldMessenger = ScaffoldMessenger.of(context);
        final notifier = ref.read(profesorAuthProvider.notifier);

        scaffoldMessenger.showSnackBar(
          SnackBar(
            content: Text(next.errorMessage!),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
            action: SnackBarAction(
              label: 'Cerrar',
              textColor: Colors.white,
              onPressed: () {
                scaffoldMessenger.hideCurrentSnackBar();
                notifier.clearError();
              },
            ),
          ),
        );
      }
    });

    return AutofillGroup(
      child: Form(
        key: _formKey,
        child: Column(
          children: [
            // Email field
            TextFormField(
              key: const Key('email_field'),
              controller: _emailController,
              focusNode: _emailFocusNode,
              cursorColor: UATColors.primary,
              style: const TextStyle(color: UATColors.neutral, fontSize: 14),
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next,
              enabled: !authState.isLoading,
              autocorrect: false,
              enableSuggestions: false,
              textCapitalization: TextCapitalization.none,
              autofillHints: const [
                AutofillHints.email,
                AutofillHints.username,
              ],
              decoration: InputDecoration(
                labelText: 'Correo institucional',
                hintText: 'ejemplo@uat.edu.mx',
                labelStyle: const TextStyle(color: UATColors.neutral80),
                floatingLabelStyle: const TextStyle(color: UATColors.primary),
                hintStyle: const TextStyle(color: UATColors.neutral40),
                errorStyle: const TextStyle(color: UATColors.error),
                prefixIcon: Icon(
                  Icons.email_outlined,
                  color: UATColors.neutral80,
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: UATColors.neutral40),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: UATColors.neutral40),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: UATColors.primary, width: 2),
                ),
                errorBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Colors.red, width: 2),
                ),
                filled: true,
                fillColor: UATColors.surface,
              ),
              validator: (value) {
                if (value == null || value.isEmpty) {
                  return 'Ingresa tu correo';
                }
                if (!value.contains('@')) {
                  return 'Ingresa un correo válido';
                }
                return null;
              },
            ),

            const SizedBox(height: 16),

            // Password field
            TextFormField(
              key: const Key('password_field'),
              controller: _passwordController,
              cursorColor: UATColors.primary,
              style: const TextStyle(color: UATColors.neutral, fontSize: 14),
              obscureText: _obscurePassword,
              textInputAction: TextInputAction.done,
              enabled: !authState.isLoading,
              autocorrect: false,
              enableSuggestions: true,
              autofillHints: const [AutofillHints.password],
              onFieldSubmitted: (_) => _handleSubmit(),
              decoration: InputDecoration(
                labelText: 'Contraseña',
                hintText: 'Tu contraseña institucional',
                labelStyle: const TextStyle(color: UATColors.neutral80),
                floatingLabelStyle: const TextStyle(color: UATColors.primary),
                hintStyle: const TextStyle(color: UATColors.neutral40),
                errorStyle: const TextStyle(color: UATColors.error),
                prefixIcon: Icon(
                  Icons.lock_outline,
                  color: UATColors.neutral80,
                ),
                suffixIcon: IconButton(
                  icon: Icon(
                    _obscurePassword ? Icons.visibility : Icons.visibility_off,
                    color: UATColors.neutral80,
                  ),
                  onPressed: () {
                    setState(() {
                      _obscurePassword = !_obscurePassword;
                    });
                  },
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: UATColors.neutral40),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: UATColors.neutral40),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: UATColors.primary, width: 2),
                ),
                errorBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Colors.red, width: 2),
                ),
                filled: true,
                fillColor: UATColors.surface,
              ),
              validator: (value) {
                if (value == null || value.isEmpty) {
                  return 'Por favor ingresa tu contraseña';
                }
                if (value.length < 4) {
                  return 'La contraseña debe tener al menos 4 caracteres';
                }
                return null;
              },
            ),

            const SizedBox(height: 24),

            // Login button
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                key: const Key('login_button'),
                onPressed: authState.isLoading || !_isFormValid
                    ? null
                    : _handleSubmit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: UATColors.primary,
                  foregroundColor: UATColors.onPrimary,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  elevation: 2,
                  disabledBackgroundColor: UATColors.neutral40,
                  disabledForegroundColor: UATColors.neutral80,
                  textStyle: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 200),
                  child: authState.isLoading
                      ? SizedBox(
                          key: const ValueKey('loading'),
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor: AlwaysStoppedAnimation<Color>(
                              UATColors.onPrimary,
                            ),
                          ),
                        )
                      : const Text('Iniciar sesión', key: ValueKey('login')),
                ),
              ),
            ),

            const SizedBox(height: 16),

            // Help text
            Text(
              'Usa tu correo y contraseña institucional',
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: UATColors.neutral80),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
