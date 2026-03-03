import 'package:hive_flutter/hive_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Local storage for student profile
class LocalStorageService {
  static const String _profileBox = 'student_profile';
  late Box _profile;

  Future<void> init() async {
    await Hive.initFlutter();
    _profile = await Hive.openBox(_profileBox);
  }

  // ── Profile ──────────────────────────────────────────────────

  bool get isProfileSet => _profile.get('matricula') != null;

  String get matricula => _profile.get('matricula', defaultValue: '');

  Future<void> saveProfile(String matricula) async {
    await _profile.put('matricula', matricula);
    // Also sync to SharedPreferences/UserDefaults so native BLE can read it
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('student_matricula', matricula);
  }
}
