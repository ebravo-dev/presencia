import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive/hive.dart';

final themeControllerProvider =
    StateNotifierProvider<ThemeController, ThemeMode>((ref) {
      return ThemeController()..load();
    });

class ThemeController extends StateNotifier<ThemeMode> {
  ThemeController() : super(ThemeMode.light);

  static const _boxName = 'uat_theme_preferences';
  static const _themeModeKey = 'theme_mode';

  Future<void> load() async {
    final box = await _openBox();
    final storedMode = box.get(_themeModeKey);

    state = storedMode == 'dark' ? ThemeMode.dark : ThemeMode.light;
  }

  Future<void> setLightMode(bool enabled) {
    return setThemeMode(enabled ? ThemeMode.light : ThemeMode.dark);
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    state = mode;

    final box = await _openBox();
    await box.put(_themeModeKey, mode == ThemeMode.light ? 'light' : 'dark');
  }

  Future<Box<String>> _openBox() async {
    if (Hive.isBoxOpen(_boxName)) {
      return Hive.box<String>(_boxName);
    }

    return Hive.openBox<String>(_boxName);
  }
}
