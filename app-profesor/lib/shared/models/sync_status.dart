/// Modelo compatible para estado de sincronizacion del backend REST.
class SyncStatusResponse {
  final String status;
  final int step;
  final int totalSteps;
  final String? stepDescription;
  final int percentage;
  final String message;
  final DateTime? startedAt;
  final DateTime? completedAt;
  final String? error;
  final String? supportPhone;

  SyncStatusResponse({
    required this.status,
    required this.step,
    required this.totalSteps,
    this.stepDescription,
    required this.percentage,
    required this.message,
    this.startedAt,
    this.completedAt,
    this.error,
    this.supportPhone,
  });

  factory SyncStatusResponse.fromJson(Map<String, dynamic> json) {
    return SyncStatusResponse(
      status: json['status'] as String,
      step: json['step'] as int? ?? 0,
      totalSteps: json['totalSteps'] as int? ?? 6,
      stepDescription: json['stepDescription'] as String?,
      percentage: json['percentage'] as int? ?? 0,
      message: json['message'] as String? ?? '',
      startedAt: json['startedAt'] != null
          ? DateTime.parse(json['startedAt'] as String)
          : null,
      completedAt: json['completedAt'] != null
          ? DateTime.parse(json['completedAt'] as String)
          : null,
      error: json['error'] as String?,
      supportPhone: json['supportPhone'] as String?,
    );
  }

  bool get isCompleted => status == 'COMPLETED';
  bool get isFailed => status == 'FAILED';
  bool get isInProgress => status == 'IN_PROGRESS' || status == 'PENDING';
  bool get hasNoSync => status == 'NO_SYNC';
}
