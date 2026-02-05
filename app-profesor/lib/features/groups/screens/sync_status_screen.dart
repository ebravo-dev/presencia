import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/theme/uat_colors.dart';
import '../../../services/api_service.dart';
import '../../../services/auth_storage_service.dart';
import '../../../shared/models/sync_status.dart';
import '../../authentication/providers/profesor_auth_provider.dart';

class SyncStatusScreen extends ConsumerStatefulWidget {
  const SyncStatusScreen({super.key});

  @override
  ConsumerState<SyncStatusScreen> createState() => _SyncStatusScreenState();
}

class _SyncStatusScreenState extends ConsumerState<SyncStatusScreen> {
  final ApiService _apiService = ApiService();
  final AuthStorageService _authStorage = AuthStorageService();

  SyncStatusResponse? _syncStatus;
  bool _isLoading = false;
  String? _error;
  Timer? _pollingTimer;

  // Steps definition (5 steps matching backend)
  static const List<String> _stepTitles = [
    'Conectando',
    'Obteniendo clases',
    'Clases encontradas',
    'Recolectando alumnos',
    'Completado',
  ];

  @override
  void initState() {
    super.initState();
    _checkSyncStatus();
  }

  @override
  void dispose() {
    _pollingTimer?.cancel();
    super.dispose();
  }

  void _startPolling() {
    _pollingTimer?.cancel();
    final interval = kDebugMode ? 2 : 3;
    _pollingTimer = Timer.periodic(Duration(seconds: interval), (_) {
      _checkSyncStatus(isPolling: true);
    });
  }

  void _stopPolling() {
    _pollingTimer?.cancel();
    _pollingTimer = null;
  }

  Future<void> _checkSyncStatus({bool isPolling = false}) async {
    if (!isPolling) {
      setState(() {
        _isLoading = true;
        _error = null;
      });
    }

    try {
      final token = _authStorage.getToken();
      if (token == null) {
        _stopPolling();
        if (!mounted) return;
        setState(() {
          _error = 'Sesión no encontrada';
          _isLoading = false;
        });
        return;
      }

      final result = await _apiService.getSyncStatus(token);

      result.fold(
        (error) {
          _stopPolling();
          if (!mounted) return;
          setState(() {
            _error = error;
            _isLoading = false;
          });
        },
        (status) {
          if (!mounted) return;
          setState(() {
            _syncStatus = status;
            _isLoading = false;
          });

          if (status.isInProgress) {
            if (_pollingTimer == null) {
              _startPolling();
            }
          } else {
            _stopPolling();
            if (status.isCompleted && status.error == null && mounted) {
              _navigateToGroupsWithRefresh();
            }
          }
        },
      );
    } catch (e) {
      _stopPolling();
      if (!mounted) return;
      setState(() {
        _error = 'Error: $e';
        _isLoading = false;
      });
    }
  }

  Future<void> _navigateToGroupsWithRefresh() async {
    await ref.read(profesorAuthProvider.notifier).refreshGrupos();
    if (mounted) {
      context.go('/grupos');
    }
  }

  Future<void> _callSupport() async {
    final phone = _syncStatus?.supportPhone ?? '8331048282';
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: UATColors.surface,
      appBar: AppBar(
        title: const Text('Sincronización'),
        backgroundColor: UATColors.primary,
        foregroundColor: UATColors.onPrimary,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            children: [
              Expanded(child: _buildContent()),
              const SizedBox(height: 16),
              _buildActionButtons(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildContent() {
    if (_isLoading && _syncStatus == null) {
      return const Center(
        child: CircularProgressIndicator(color: UATColors.primary),
      );
    }

    if (_error != null) {
      return _buildErrorState();
    }

    if (_syncStatus == null || _syncStatus!.hasNoSync) {
      return _buildNoSyncState();
    }

    if (_syncStatus!.isFailed) {
      return _buildFailedState();
    }

    return _buildStepperCard();
  }

  Widget _buildStepperCard() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.08),
            blurRadius: 20,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Title based on status
          Text(
            _syncStatus!.isCompleted
                ? '¡Sincronización completada!'
                : 'Sincronizando...',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.bold,
              color: UATColors.neutral,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _syncStatus!.message,
            style: TextStyle(color: UATColors.neutral80, fontSize: 14),
          ),
          const SizedBox(height: 32),
          // Stepper
          Expanded(child: _buildStepper()),
        ],
      ),
    );
  }

  Widget _buildStepper() {
    final currentStep = _syncStatus?.step ?? 0;
    final isCompleted = _syncStatus?.isCompleted == true;

    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: _stepTitles.length,
      itemBuilder: (context, index) {
        final stepNumber = index + 1;
        final isActive = stepNumber == currentStep;
        final isPast = stepNumber < currentStep || isCompleted;
        final isFuture = stepNumber > currentStep && !isCompleted;

        return _buildStepItem(
          stepNumber: stepNumber,
          title: _stepTitles[index],
          subtitle: isActive ? _syncStatus?.stepDescription : null,
          isActive: isActive,
          isPast: isPast,
          isFuture: isFuture,
          isLast: index == _stepTitles.length - 1,
        );
      },
    );
  }

  Widget _buildStepItem({
    required int stepNumber,
    required String title,
    String? subtitle,
    required bool isActive,
    required bool isPast,
    required bool isFuture,
    required bool isLast,
  }) {
    // Determine colors
    Color circleColor;
    Color circleInnerColor;
    Color textColor;
    FontWeight fontWeight;

    if (isPast) {
      circleColor = UATColors.primary;
      circleInnerColor = Colors.white;
      textColor = UATColors.neutral;
      fontWeight = FontWeight.w500;
    } else if (isActive) {
      circleColor = UATColors.primary;
      circleInnerColor = UATColors.primary;
      textColor = UATColors.primary;
      fontWeight = FontWeight.bold;
    } else {
      circleColor = Colors.grey.shade300;
      circleInnerColor = Colors.grey.shade300;
      textColor = Colors.grey.shade400;
      fontWeight = FontWeight.normal;
    }

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Circle and line column
          SizedBox(
            width: 40,
            child: Column(
              children: [
                // Circle indicator
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: circleColor.withOpacity(
                      isPast || isActive ? 1 : 0.3,
                    ),
                    border: Border.all(color: circleColor, width: 2),
                  ),
                  child: Center(
                    child: isPast
                        ? const Icon(Icons.check, color: Colors.white, size: 18)
                        : isActive
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(
                                Colors.white,
                              ),
                            ),
                          )
                        : null,
                  ),
                ),
                // Connecting line
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      color: isPast ? UATColors.primary : Colors.grey.shade300,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          // Text column
          Expanded(
            child: Container(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 24),
              decoration: isActive
                  ? BoxDecoration(
                      color: UATColors.primary.withOpacity(0.05),
                      borderRadius: BorderRadius.circular(12),
                    )
                  : null,
              child: Padding(
                padding: isActive
                    ? const EdgeInsets.all(12)
                    : const EdgeInsets.only(top: 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        color: textColor,
                        fontWeight: fontWeight,
                        fontSize: isActive ? 16 : 14,
                      ),
                    ),
                    if (subtitle != null && subtitle.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        style: TextStyle(
                          color: UATColors.neutral80,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.error_outline, size: 64, color: Colors.red.shade400),
          const SizedBox(height: 16),
          Text(
            'Error',
            style: Theme.of(
              context,
            ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Text(
            _error!,
            textAlign: TextAlign.center,
            style: TextStyle(color: UATColors.neutral80),
          ),
        ],
      ),
    );
  }

  Widget _buildNoSyncState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.cloud_off, size: 64, color: Colors.grey.shade400),
          const SizedBox(height: 16),
          Text(
            'Sin sincronizaciones',
            style: Theme.of(
              context,
            ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Text(
            'No hay sincronizaciones previas',
            style: TextStyle(color: UATColors.neutral80),
          ),
        ],
      ),
    );
  }

  Widget _buildFailedState() {
    final errorMessage = _syncStatus?.error ?? 'Error desconocido';
    final isRetrying = errorMessage.contains('Reintentando');

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.08),
            blurRadius: 20,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // Error icon
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.red.shade50,
            ),
            child: Icon(
              isRetrying ? Icons.refresh : Icons.warning_rounded,
              size: 40,
              color: Colors.red.shade400,
            ),
          ),
          const SizedBox(height: 24),
          // Title
          Text(
            isRetrying ? 'Reintentando...' : 'Error en Sincronización',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.bold,
              color: UATColors.neutral,
            ),
          ),
          const SizedBox(height: 12),
          // Error message
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.red.shade50,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              errorMessage,
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.red.shade700, fontSize: 14),
            ),
          ),
          const SizedBox(height: 24),
          // Humanized message
          Text(
            'La página de la UAT puede estar lenta o en mantenimiento.',
            textAlign: TextAlign.center,
            style: TextStyle(color: UATColors.neutral80, fontSize: 13),
          ),
          const SizedBox(height: 24),
          // Support button
          OutlinedButton.icon(
            onPressed: _callSupport,
            icon: const Icon(Icons.phone),
            label: const Text('Marcar a soporte'),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
              side: const BorderSide(color: UATColors.primary),
              foregroundColor: UATColors.primary,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionButtons() {
    return Column(
      children: [
        // View groups button (only when completed)
        if (_syncStatus?.isCompleted == true)
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _navigateToGroupsWithRefresh,
              icon: const Icon(Icons.check_circle),
              label: const Text('Ver mis clases'),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                backgroundColor: UATColors.primary,
                foregroundColor: UATColors.onPrimary,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
        // Retry button (only when failed)
        if (_syncStatus?.isFailed == true) ...[
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () {
                Navigator.of(context).pop();
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text(
                      'Inicia la sincronización de nuevo desde el menú',
                    ),
                    duration: Duration(seconds: 3),
                  ),
                );
              },
              icon: const Icon(Icons.refresh),
              label: const Text('Reintentar Sincronización'),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                backgroundColor: Colors.orange,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
        ],
        const SizedBox(height: 16),
        // Info message
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.blue.shade50,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.blue.shade100),
          ),
          child: Row(
            children: [
              Icon(Icons.cloud_done, color: Colors.blue.shade700),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'La sincronización continúa en la nube. Puedes cerrar la app.',
                  style: TextStyle(color: Colors.blue.shade800, fontSize: 13),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
