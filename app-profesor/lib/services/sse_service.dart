import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../core/constants/api_constants.dart';
import '../core/utils/utils.dart';

/// Event types received from SSE stream
enum SyncEventType {
  connected,
  progress,
  completed,
  failed,
  timeout,
  noJob,
  error,
}

/// Represents a sync progress event from SSE stream
class SyncEvent {
  final SyncEventType type;
  final String? status;
  final int step;
  final int totalSteps;
  final String message;
  final String? error;
  final String? errorType; // 'credential' or 'portal'
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
    SyncEventType type;

    switch (typeStr) {
      case 'connected':
        type = SyncEventType.connected;
        break;
      case 'completed':
        type = SyncEventType.completed;
        break;
      case 'failed':
        type = SyncEventType.failed;
        break;
      case 'timeout':
        type = SyncEventType.timeout;
        break;
      case 'no_job':
        type = SyncEventType.noJob;
        break;
      case 'error':
        type = SyncEventType.error;
        break;
      default:
        type = SyncEventType.progress;
    }

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

/// Service for Server-Sent Events (SSE) connection to sync endpoint
class SSEService {
  http.Client? _client;
  StreamController<SyncEvent>? _controller;
  bool _isConnected = false;

  /// Check if currently connected to SSE stream
  bool get isConnected => _isConnected;

  /// Connect to SSE stream for sync progress updates
  /// Returns a Stream of SyncEvent that emits progress updates
  Stream<SyncEvent> connect(String professorId, String token) {
    _controller = StreamController<SyncEvent>.broadcast(
      onCancel: () {
        disconnect();
      },
    );

    _startListening(professorId, token);

    return _controller!.stream;
  }

  Future<void> _startListening(String professorId, String token) async {
    _client = http.Client();
    _isConnected = true;

    try {
      final url = '${ApiConstants.baseUrl}/sync/stream/$professorId';
      Logger.info('SSE: Connecting to $url');

      final request = http.Request('GET', Uri.parse(url));
      request.headers['Authorization'] = 'Bearer $token';
      request.headers['Accept'] = 'text/event-stream';
      request.headers['Cache-Control'] = 'no-cache';

      final response = await _client!.send(request);

      if (response.statusCode != 200) {
        Logger.error(
          'SSE: Connection failed with status ${response.statusCode}',
        );
        _controller?.addError('Error de conexión: ${response.statusCode}');
        _isConnected = false;
        return;
      }

      Logger.info('SSE: Connected successfully');

      // Listen to the stream
      response.stream
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .listen(
            (line) {
              if (line.startsWith('data: ')) {
                try {
                  final jsonStr = line.substring(6); // Remove 'data: ' prefix
                  final json = jsonDecode(jsonStr) as Map<String, dynamic>;
                  final event = SyncEvent.fromJson(json);
                  Logger.debug('SSE: Received event: $event');
                  _controller?.add(event);

                  // Close stream if sync completed or failed
                  if (event.isCompleted || event.isFailed) {
                    Logger.info('SSE: Sync finished, closing stream');
                    Future.delayed(const Duration(seconds: 1), () {
                      disconnect();
                    });
                  }
                } catch (e) {
                  Logger.error('SSE: Error parsing event: $e');
                }
              }
            },
            onError: (error) {
              Logger.error('SSE: Stream error: $error');
              _controller?.addError(error);
              _isConnected = false;
            },
            onDone: () {
              Logger.info('SSE: Stream closed');
              _isConnected = false;
            },
            cancelOnError: false,
          );
    } catch (e) {
      Logger.error('SSE: Connection error: $e');
      _controller?.addError(e);
      _isConnected = false;
    }
  }

  /// Disconnect from SSE stream
  void disconnect() {
    Logger.info('SSE: Disconnecting');
    _isConnected = false;
    _client?.close();
    _client = null;
    _controller?.close();
    _controller = null;
  }
}
