import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/uat_colors.dart';
import '../../../../core/theme/uat_theme.dart';
import '../../../../core/utils/debug_tools.dart';
import '../widgets/profesor_login_form.dart';
import '../../providers/profesor_auth_provider.dart';

class LoginPage extends ConsumerWidget {
  const LoginPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(profesorAuthProvider);

    // Listen to auth state changes and navigate
    ref.listen<ProfesorAuthState>(profesorAuthProvider, (previous, next) {
      if (next.isAuthenticated && context.mounted) {
        context.go('/grupos');
      }
    });

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: UATColors.surface,
        statusBarIconBrightness: Brightness.dark,
        statusBarBrightness: Brightness.light,
        systemNavigationBarColor: UATColors.surface,
        systemNavigationBarIconBrightness: Brightness.dark,
      ),
      child: Theme(
        data: UATTheme.lightTheme,
        child: Builder(
          builder: (loginContext) {
            final isWideScreen = MediaQuery.sizeOf(loginContext).width > 768;

            return Scaffold(
              backgroundColor: UATColors.surface,
              body: SafeArea(
                child: isWideScreen
                    ? _buildWideLayout(loginContext, authState)
                    : _buildNarrowLayout(loginContext, authState),
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildWideLayout(BuildContext context, ProfesorAuthState authState) {
    return Row(
      children: [
        // Left side - Branding
        Expanded(
          flex: 3,
          child: Container(
            padding: const EdgeInsets.all(48.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildLogo(),
                const SizedBox(height: 32),
                Text(
                  'Universidad Autónoma\nde Tamaulipas',
                  style: Theme.of(context).textTheme.displaySmall?.copyWith(
                    fontWeight: FontWeight.w300,
                    color: Colors.blue.shade800,
                    height: 1.1,
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  'Sistema de Asistencia para Profesores',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: Colors.grey.shade600,
                    fontWeight: FontWeight.w400,
                  ),
                ),
                const SizedBox(height: 24),
                Container(
                  width: 60,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.blue.shade600,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ],
            ),
          ),
        ),

        // Right side - Login form
        Expanded(
          flex: 2,
          child: Container(
            margin: const EdgeInsets.all(24.0),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 400),
                child: _buildLoginCard(context, authState),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildNarrowLayout(BuildContext context, ProfesorAuthState authState) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 16.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _buildLogo(),
            const SizedBox(height: 16),
            Text(
              'Universidad Autónoma de Tamaulipas',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w300,
                color: UATColors.accent,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 4),
            Text(
              'Sistema de Asistencia Profesores',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: UATColors.neutral80,
                fontWeight: FontWeight.w400,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 32),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: _buildLoginCard(context, authState),
            ),
            const SizedBox(height: 20),
            Text(
              'v1.0.0',
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: Colors.grey.shade400),
            ),

            // Debug tools (solo en modo debug)
            if (kDebugMode) ...[
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  TextButton.icon(
                    onPressed: () async {
                      await DebugTools.clearAllStorage();
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('🧹 Storage limpiado'),
                            duration: Duration(seconds: 2),
                          ),
                        );
                      }
                    },
                    icon: const Icon(Icons.delete_outline, size: 16),
                    label: const Text('Limpiar Storage'),
                    style: TextButton.styleFrom(
                      foregroundColor: Colors.red.shade400,
                      textStyle: const TextStyle(fontSize: 12),
                    ),
                  ),
                  const SizedBox(width: 8),
                  TextButton.icon(
                    onPressed: () => DebugTools.checkStoredSession(),
                    icon: const Icon(Icons.info_outline, size: 16),
                    label: const Text('Ver Sesión'),
                    style: TextButton.styleFrom(
                      foregroundColor: Colors.blue.shade400,
                      textStyle: const TextStyle(fontSize: 12),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildLogo() {
    return Container(
      width: 60,
      height: 60,
      decoration: const BoxDecoration(
        gradient: UATGradients.primary,
        borderRadius: BorderRadius.all(Radius.circular(16)),
        boxShadow: [
          BoxShadow(
            color: UATColors.primary40,
            blurRadius: 16,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: const Icon(
        Icons.school_rounded,
        size: 32,
        color: UATColors.onPrimary,
      ),
    );
  }

  Widget _buildLoginCard(BuildContext context, ProfesorAuthState authState) {
    return Container(
      decoration: BoxDecoration(
        color: UATColors.surface,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: UATColors.neutral40.withOpacity(0.15),
            blurRadius: 30,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 20),
            child: Column(
              children: [
                Text(
                  'Acceso Profesores',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: UATColors.neutral,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Inicia sesión o regístrate con tu cuenta institucional',
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: UATColors.neutral80),
                ),
                const SizedBox(height: 24),
                const ProfesorLoginForm(),
              ],
            ),
          ),

          // Loading indicator
          if (authState.isLoading)
            Container(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation<Color>(
                        UATColors.primary,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Verificando credenciales...',
                    style: Theme.of(
                      context,
                    ).textTheme.bodySmall?.copyWith(color: UATColors.neutral80),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
