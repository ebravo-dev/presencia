import 'dart:async';

import '../core/utils/utils.dart';

enum SyncEventType {
  connected,
  progress,
  completed,
  failed,
  timeout,
  noJob,
  error,
}

class SyncEvent {
  final SyncEventType type;
  final String? status;
  final int step;
  final int totalSteps;
  final String message;
  final String? error;
  final String? errorType;
  final int attemptsMade;

  SyncEvent({
    required this.type,
    this.status,
    this.step = 0,
    this.totalSteps = 5,
    this.message = '',
    this.error,
    this.errorType,
    this.attemptsMade = 0,
  });

  factory SyncEvent.fromJson(Map<String, dynamic> json) {
    final typeStr = json['type'] as String? ?? 'progress';
    final type = switch (typeStr) {
      'connected' => SyncEventType.connected,
      'completed' => SyncEventType.completed,
      'failed' => SyncEventType.failed,
      'timeout' => SyncEventType.timeout,
      'no_job' => SyncEventType.noJob,
      'error' => SyncEventType.error,
      _ => SyncEventType.progress,
    };

    return SyncEvent(
      type: type,
      status: json['status'] as String?,
      step: json['step'] as int? ?? 0,
      totalSteps: json['totalSteps'] as int? ?? 5,
      message: json['message'] as String? ?? '',
      error: json['error'] as String?,
      errorType: json['errorType'] as String?,
      attemptsMade: json['attemptsMade'] as int? ?? 0,
    );
  }

  bool get isCompleted =>
      status == 'COMPLETED' || type == SyncEventType.completed;
  bool get isFailed => status == 'FAILED' || type == SyncEventType.failed;
  bool get isCredentialError => errorType == 'credential';
  bool get isPortalError => errorType == 'portal';
  bool get isInProgress => status == 'IN_PROGRESS' || status == 'PENDING';
  bool get isRetrying => message.contains('Reintentando') || attemptsMade > 0;

  @override
  String toString() {
    return 'SyncEvent(type: $type, status: $status, step: $step/$totalSteps, message: $message)';
  }
}

/// Compatibility shim for the old sync-status UI.
///
/// backend-apirest now performs UAT calls synchronously over REST, so there is
/// no queue stream to subscribe to. This stream emits a completed event and
/// lets the existing screen navigate/refresh without opening legacy endpoints.
class SSEService {
  StreamController<SyncEvent>? _controller;
  bool _isConnected = false;

  bool get isConnected => _isConnected;

  Stream<SyncEvent> connect(String professorId, String token) {
    _controller = StreamController<SyncEvent>.broadcast(onCancel: disconnect);
    _isConnected = true;

    scheduleMicrotask(() {
      Logger.info('Sync shim: REST backend has no SSE queue for $professorId');
      _controller?.add(
        SyncEvent(
          type: SyncEventType.connected,
          status: 'IN_PROGRESS',
          step: 1,
          totalSteps: 5,
          message: 'Conectando con backend-apirest...',
        ),
      );
      _controller?.add(
        SyncEvent(
          type: SyncEventType.completed,
          status: 'COMPLETED',
          step: 5,
          totalSteps: 5,
          message: 'Datos sincronizados desde backend-apirest',
        ),
      );
      disconnect();
    });

    return _controller!.stream;
  }

  void disconnect() {
    if (!_isConnected && _controller == null) return;
    Logger.info('Sync shim: disconnect');
    _isConnected = false;
    _controller?.close();
    _controller = null;
  }
}
