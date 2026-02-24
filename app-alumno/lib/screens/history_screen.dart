import 'package:flutter/material.dart';
import '../models/attendance_record.dart';
import '../services/local_storage_service.dart';

class HistoryScreen extends StatelessWidget {
  final LocalStorageService storage;

  const HistoryScreen({super.key, required this.storage});

  @override
  Widget build(BuildContext context) {
    final records = storage.getAllRecords();

    return Scaffold(
      backgroundColor: const Color(0xFF0A0A0A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0A0A0A),
        foregroundColor: Colors.white,
        title: const Text(
          'Historial',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
        elevation: 0,
      ),
      body: records.isEmpty
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.history_rounded,
                    size: 64,
                    color: Colors.white.withOpacity(0.15),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Sin registros aún',
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.3),
                      fontSize: 18,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Escanea el beacon para registrar tu asistencia',
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.2),
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            )
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: records.length,
              itemBuilder: (context, index) {
                return _buildRecordCard(records[index]);
              },
            ),
    );
  }

  Widget _buildRecordCard(AttendanceRecord record) {
    final date = record.detectedAt;
    final timeStr =
        '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
    final dateStr =
        '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1C1C1E),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF2C2C2E)),
      ),
      child: Row(
        children: [
          // Time circle
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: record.synced
                    ? [const Color(0xFF4DFF88), const Color(0xFF00C853)]
                    : [const Color(0xFFFF9D6B), const Color(0xFFFF6B6B)],
              ),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Center(
              child: Text(
                timeStr,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
          const SizedBox(width: 14),
          // Details
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  dateStr,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  record.beaconId,
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.4),
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
          // Sync status
          Icon(
            record.synced ? Icons.cloud_done_rounded : Icons.cloud_off_rounded,
            color: record.synced
                ? const Color(0xFF4DFF88)
                : Colors.white.withOpacity(0.2),
            size: 22,
          ),
        ],
      ),
    );
  }
}
