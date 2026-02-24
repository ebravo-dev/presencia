import 'package:hive_flutter/hive_flutter.dart';
import '../models/attendance_record.dart';

/// Offline-first local storage using Hive
class LocalStorageService {
  static const String _boxName = 'attendance_records';
  static const String _profileBox = 'student_profile';
  late Box<AttendanceRecord> _box;
  late Box _profile;

  Future<void> init() async {
    await Hive.initFlutter();
    Hive.registerAdapter(AttendanceRecordAdapter());
    _box = await Hive.openBox<AttendanceRecord>(_boxName);
    _profile = await Hive.openBox(_profileBox);
  }

  // ── Profile ──────────────────────────────────────────────────

  bool get isProfileSet =>
      _profile.get('studentName') != null && _profile.get('matricula') != null;

  String get studentName => _profile.get('studentName', defaultValue: '');
  String get matricula => _profile.get('matricula', defaultValue: '');

  Future<void> saveProfile(String name, String matricula) async {
    await _profile.put('studentName', name);
    await _profile.put('matricula', matricula);
  }

  // ── Attendance records ───────────────────────────────────────

  Future<void> saveRecord(AttendanceRecord record) async {
    await _box.put(record.id, record);
  }

  List<AttendanceRecord> getAllRecords() {
    return _box.values.toList()
      ..sort((a, b) => b.detectedAt.compareTo(a.detectedAt));
  }

  List<AttendanceRecord> getUnsyncedRecords() {
    return _box.values.where((r) => !r.synced).toList();
  }

  Future<void> markAsSynced(String id) async {
    final record = _box.get(id);
    if (record != null) {
      final updated = record.copyWith(synced: true);
      await _box.put(id, updated);
    }
  }

  Future<void> markAllAsSynced(List<String> ids) async {
    for (final id in ids) {
      await markAsSynced(id);
    }
  }

  int get totalRecords => _box.length;
  int get unsyncedCount => _box.values.where((r) => !r.synced).length;
}
