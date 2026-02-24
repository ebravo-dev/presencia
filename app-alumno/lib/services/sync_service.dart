import 'dart:async';
import 'package:dio/dio.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'local_storage_service.dart';

/// Sync service that sends pending records to the backend when online
class SyncService {
  // TODO: Change to production URL when deploying
  static const String _baseUrl = 'https://110694.xyz';

  final LocalStorageService _storage;
  final Dio _dio;
  final Connectivity _connectivity = Connectivity();
  StreamSubscription? _connectivitySub;
  Timer? _retryTimer;

  bool _isSyncing = false;

  final _syncStatusController = StreamController<String>.broadcast();
  Stream<String> get syncStatusStream => _syncStatusController.stream;

  SyncService(this._storage)
    : _dio = Dio(
        BaseOptions(
          baseUrl: _baseUrl,
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 10),
        ),
      );

  /// Start listening for connectivity changes
  void startListening() {
    // Check connectivity periodically and on change
    _connectivitySub = _connectivity.onConnectivityChanged.listen((results) {
      final hasInternet = results.any((r) => r != ConnectivityResult.none);
      if (hasInternet) {
        debugPrint('[Sync] Internet available, attempting sync...');
        syncPendingRecords();
      }
    });

    // Also retry every 30 seconds
    _retryTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      syncPendingRecords();
    });
  }

  /// Sync all unsynced records to the backend
  Future<bool> syncPendingRecords() async {
    if (_isSyncing) return false;

    final unsynced = _storage.getUnsyncedRecords();
    if (unsynced.isEmpty) return true;

    _isSyncing = true;
    _syncStatusController.add('Sincronizando ${unsynced.length} registros...');

    try {
      if (unsynced.length == 1) {
        // Single record
        await _dio.post(
          '/api/student-attendance',
          data: unsynced.first.toJson(),
        );
        await _storage.markAsSynced(unsynced.first.id);
      } else {
        // Batch
        await _dio.post(
          '/api/student-attendance/batch',
          data: {'records': unsynced.map((r) => r.toJson()).toList()},
        );
        await _storage.markAllAsSynced(unsynced.map((r) => r.id).toList());
      }

      _syncStatusController.add('✅ ${unsynced.length} registros sincronizados');
      _isSyncing = false;
      return true;
    } on DioException catch (e) {
      debugPrint('[Sync] Error: ${e.message}');
      _syncStatusController.add('Sin conexión — guardado localmente');
      _isSyncing = false;
      return false;
    } catch (e) {
      debugPrint('[Sync] Unexpected error: $e');
      _syncStatusController.add('Error de sincronización');
      _isSyncing = false;
      return false;
    }
  }

  /// Update the base URL (for connecting to a different server)
  void updateBaseUrl(String url) {
    _dio.options.baseUrl = url;
  }

  void dispose() {
    _connectivitySub?.cancel();
    _retryTimer?.cancel();
    _syncStatusController.close();
  }
}
