/// Modelo para la respuesta del endpoint /professors/sync-status
class SyncStatusResponse {
  final String status;
  final int? totalGroups;
  final int? currentGroup;
  final String? currentGroupName;
  final int percentage;
  final String message;
  final DateTime? startedAt;
  final DateTime? completedAt;
  final String? error;

  SyncStatusResponse({
    required this.status,
    this.totalGroups,
    this.currentGroup,
    this.currentGroupName,
    required this.percentage,
    required this.message,
    this.startedAt,
    this.completedAt,
    this.error,
  });

  factory SyncStatusResponse.fromJson(Map<String, dynamic> json) {
    return SyncStatusResponse(
      status: json['status'] as String,
      totalGroups: json['totalGroups'] as int?,
      currentGroup: json['currentGroup'] as int?,
      currentGroupName: json['currentGroupName'] as String?,
      percentage: json['percentage'] as int? ?? 0,
      message: json['message'] as String? ?? '',
      startedAt: json['startedAt'] != null
          ? DateTime.parse(json['startedAt'] as String)
          : null,
      completedAt: json['completedAt'] != null
          ? DateTime.parse(json['completedAt'] as String)
          : null,
      error: json['error'] as String?,
    );
  }

  bool get isCompleted => status == 'COMPLETED';
  bool get isFailed => status == 'FAILED';
  bool get isInProgress => status == 'IN_PROGRESS' || status == 'PENDING';
  bool get hasNoSync => status == 'NO_SYNC';
}
