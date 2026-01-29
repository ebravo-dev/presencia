import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/uat_colors.dart';
import '../../../services/api_service.dart';
import '../../../services/auth_storage_service.dart';
import '../../../shared/models/sync_status.dart';

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

  @override
  void initState() {
    super.initState();
    _checkSyncStatus();
  }

  Future<void> _checkSyncStatus() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final token = _authStorage.getToken();
      if (token == null) {
        setState(() {
          _error = 'Sesión no encontrada';
          _isLoading = false;
        });
        return;
      }

      final result = await _apiService.getSyncStatus(token);

      result.fold(
        (error) => setState(() {
          _error = error;
          _isLoading = false;
        }),
        (status) => setState(() {
          _syncStatus = status;
          _isLoading = false;
        }),
      );
    } catch (e) {
      setState(() {
        _error = 'Error: $e';
        _isLoading = false;
      });
    }
  }

  Future<void> _downloadGroups() async {
    // Navigate to groups page - it will fetch from API automatically
    if (mounted) {
      context.go('/grupos');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: UATColors.surface,
      appBar: AppBar(
        title: const Text('Estado de Sincronización'),
        backgroundColor: UATColors.primary,
        foregroundColor: UATColors.onPrimary,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _buildStatusCard(),
              const SizedBox(height: 24),
              _buildActionButtons(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStatusCard() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          _buildStatusIcon(),
          const SizedBox(height: 16),
          _buildStatusText(),
          if (_syncStatus?.isInProgress == true) ...[
            const SizedBox(height: 24),
            _buildProgressBar(),
          ],
        ],
      ),
    );
  }

  Widget _buildStatusIcon() {
    if (_isLoading) {
      return const CircularProgressIndicator(
        valueColor: AlwaysStoppedAnimation<Color>(UATColors.primary),
      );
    }

    if (_error != null) {
      return Icon(Icons.error_outline, size: 64, color: Colors.red.shade400);
    }

    if (_syncStatus == null || _syncStatus!.hasNoSync) {
      return Icon(Icons.cloud_off, size: 64, color: Colors.grey.shade400);
    }

    if (_syncStatus!.isCompleted) {
      return Icon(Icons.check_circle, size: 64, color: Colors.green.shade400);
    }

    if (_syncStatus!.isFailed) {
      return Icon(Icons.error, size: 64, color: Colors.red.shade400);
    }

    // In progress
    return Stack(
      alignment: Alignment.center,
      children: [
        SizedBox(
          width: 80,
          height: 80,
          child: CircularProgressIndicator(
            value: (_syncStatus!.percentage / 100).clamp(0.0, 1.0),
            strokeWidth: 6,
            backgroundColor: Colors.grey.shade200,
            valueColor: const AlwaysStoppedAnimation<Color>(UATColors.primary),
          ),
        ),
        Text(
          '${_syncStatus!.percentage}%',
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: UATColors.primary,
          ),
        ),
      ],
    );
  }

  Widget _buildStatusText() {
    String title;
    String subtitle;

    if (_isLoading) {
      title = 'Consultando...';
      subtitle = 'Obteniendo estado de sincronización';
    } else if (_error != null) {
      title = 'Error';
      subtitle = _error!;
    } else if (_syncStatus == null || _syncStatus!.hasNoSync) {
      title = 'Sin sincronizaciones';
      subtitle = 'No hay sincronizaciones previas';
    } else {
      title = _getTitleForStatus(_syncStatus!.status);
      subtitle = _syncStatus!.message;
    }

    return Column(
      children: [
        Text(
          title,
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.bold,
            color: UATColors.neutral,
          ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(
          subtitle,
          style: Theme.of(
            context,
          ).textTheme.bodyMedium?.copyWith(color: UATColors.neutral80),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  String _getTitleForStatus(String status) {
    switch (status) {
      case 'PENDING':
        return 'Preparando...';
      case 'IN_PROGRESS':
        return 'Sincronizando';
      case 'COMPLETED':
        return '¡Sincronización Completa!';
      case 'FAILED':
        return 'Error en Sincronización';
      default:
        return 'Estado Desconocido';
    }
  }

  Widget _buildProgressBar() {
    return Column(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: LinearProgressIndicator(
            value: (_syncStatus!.percentage / 100).clamp(0.0, 1.0),
            backgroundColor: Colors.grey.shade200,
            valueColor: const AlwaysStoppedAnimation<Color>(UATColors.primary),
            minHeight: 8,
          ),
        ),
        const SizedBox(height: 8),
        if (_syncStatus!.currentGroup != null &&
            _syncStatus!.totalGroups != null)
          Text(
            'Grupo ${_syncStatus!.currentGroup} de ${_syncStatus!.totalGroups}',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: UATColors.neutral80),
          ),
      ],
    );
  }

  Widget _buildActionButtons() {
    return Column(
      children: [
        // Refresh button
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: _isLoading ? null : _checkSyncStatus,
            icon: const Icon(Icons.refresh),
            label: const Text('Revisar sincronización'),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16),
              side: const BorderSide(color: UATColors.primary),
              foregroundColor: UATColors.primary,
            ),
          ),
        ),

        const SizedBox(height: 12),

        // Download groups button (only when completed)
        if (_syncStatus?.isCompleted == true)
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _downloadGroups,
              icon: const Icon(Icons.download),
              label: const Text('Descargar grupos'),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                backgroundColor: UATColors.primary,
                foregroundColor: UATColors.onPrimary,
              ),
            ),
          ),

        const SizedBox(height: 24),

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
              Icon(Icons.info_outline, color: Colors.blue.shade700),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Los grupos se sincronizan en la nube. Puedes cerrar la app y volver más tarde.',
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
