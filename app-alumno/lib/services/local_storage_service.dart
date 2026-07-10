import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/attendance_history_entry.dart';

class StudentStoredCredentials {
  final String username;
  final String password;

  const StudentStoredCredentials({
    required this.username,
    required this.password,
  });
}

/// Local storage for student profile
class LocalStorageService {
  static const String _profileBox = 'student_profile';
  static const String _attendanceHistoryKey = 'attendance_history';
  static const int _maxAttendanceHistoryEntries = 200;
  static const String _secureUsernameKey = 'uat_student_username';
  static const String _securePasswordKey = 'uat_student_password';
  static const _secureStorage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
    ),
  );

  late Box _profile;

  Future<void> init() async {
    await Hive.initFlutter();
    _profile = await Hive.openBox(_profileBox);
  }

  // ── Profile ──────────────────────────────────────────────────

  bool get isProfileSet => _profile.get('matricula') != null;

  String get matricula => _profile.get('matricula', defaultValue: '');

  String get attendanceUuid =>
      _profile.get('attendance_uuid', defaultValue: '');

  String get deviceBindingId =>
      _profile.get('device_binding_id', defaultValue: '');

  String get institutionalEmail =>
      _profile.get('institutional_email', defaultValue: '');

  String get uatStudentSessionId =>
      _profile.get('uat_student_session_id', defaultValue: '');

  String get classroomBeaconUuid =>
      _profile.get('classroom_beacon_uuid', defaultValue: '');

  bool get hasPendingDeviceBindingSync =>
      _profile.get('device_binding_sync_pending', defaultValue: false) == true;

  bool get hasClassroomBeacon => classroomBeaconUuid.trim().isNotEmpty;

  List<AttendanceHistoryEntry> get attendanceHistory {
    final storedEntries = _profile.get(_attendanceHistoryKey);
    if (storedEntries is! List) return const [];

    final entries =
        storedEntries
            .map(AttendanceHistoryEntry.fromStorage)
            .whereType<AttendanceHistoryEntry>()
            .toList()
          ..sort((left, right) => right.recordedAt.compareTo(left.recordedAt));

    return entries;
  }

  int get attendanceHistoryCount => attendanceHistory.length;

  Future<void> addAttendanceHistoryEntry(DateTime recordedAt) async {
    final entries = attendanceHistory
      ..insert(0, AttendanceHistoryEntry(recordedAt: recordedAt));

    await _profile.put(
      _attendanceHistoryKey,
      entries
          .take(_maxAttendanceHistoryEntries)
          .map((entry) => entry.toStorage())
          .toList(growable: false),
    );
  }

  Future<void> ensureDeviceBinding() async {
    if (!isProfileSet) return;

    await ensureDeviceIdentity();
    await _syncNativeIdentity(
      matricula: matricula,
      attendanceUuid: attendanceUuid,
      deviceBindingId: deviceBindingId,
    );
  }

  Future<void> ensureDeviceIdentity() async {
    final stableUuid = attendanceUuid.isNotEmpty ? attendanceUuid : _uuidV4();
    final bindingId = deviceBindingId.isNotEmpty ? deviceBindingId : _uuidV4();

    await _profile.put('attendance_uuid', stableUuid);
    await _profile.put('device_binding_id', bindingId);
  }

  Future<void> saveProfile(
    String matricula, {
    String? institutionalEmail,
    String? uatStudentSessionId,
  }) async {
    await ensureDeviceIdentity();

    await _profile.put('matricula', matricula);
    if (institutionalEmail != null) {
      await _profile.put('institutional_email', institutionalEmail);
    }
    if (uatStudentSessionId != null) {
      await _profile.put('uat_student_session_id', uatStudentSessionId);
    }

    await _syncNativeIdentity(
      matricula: matricula,
      attendanceUuid: attendanceUuid,
      deviceBindingId: deviceBindingId,
    );
  }

  Future<void> saveInstitutionalCredentials({
    required String username,
    required String password,
  }) async {
    await _secureStorage.write(
      key: _secureUsernameKey,
      value: username.trim().toLowerCase(),
    );
    await _secureStorage.write(key: _securePasswordKey, value: password);
  }

  Future<StudentStoredCredentials?> readInstitutionalCredentials() async {
    final username = await _secureStorage.read(key: _secureUsernameKey);
    final password = await _secureStorage.read(key: _securePasswordKey);

    if (username == null ||
        username.trim().isEmpty ||
        password == null ||
        password.isEmpty) {
      return null;
    }

    return StudentStoredCredentials(
      username: username.trim().toLowerCase(),
      password: password,
    );
  }

  Future<void> clearInstitutionalCredentials() async {
    await _secureStorage.delete(key: _secureUsernameKey);
    await _secureStorage.delete(key: _securePasswordKey);
  }

  Future<void> saveClassroomBeaconUuid(String uuid) async {
    await _profile.put('classroom_beacon_uuid', uuid.trim());
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('classroom_beacon_uuid', uuid.trim());
  }

  Future<void> setDeviceBindingSyncPending(bool pending) async {
    await _profile.put('device_binding_sync_pending', pending);
  }

  Future<void> _syncNativeIdentity({
    required String matricula,
    required String attendanceUuid,
    required String deviceBindingId,
  }) async {
    // Also sync to SharedPreferences/UserDefaults so native BLE can read it.
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('student_matricula', matricula);
    await prefs.setString('student_attendance_uuid', attendanceUuid);
    await prefs.setString('student_device_binding_id', deviceBindingId);
    await prefs.setString('classroom_beacon_uuid', classroomBeaconUuid);
  }

  String _uuidV4() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    String hex(int value) => value.toRadixString(16).padLeft(2, '0');
    final chars = bytes.map(hex).join();
    return '${chars.substring(0, 8)}-'
        '${chars.substring(8, 12)}-'
        '${chars.substring(12, 16)}-'
        '${chars.substring(16, 20)}-'
        '${chars.substring(20)}';
  }
}
