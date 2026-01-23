import 'package:hive_flutter/hive_flutter.dart';
import '../core/utils/utils.dart';

/// Service to handle local database operations
class DatabaseService {
  static final DatabaseService _instance = DatabaseService._internal();
  factory DatabaseService() => _instance;
  DatabaseService._internal();

  static const String _professorsBox = 'professors';
  static const String _studentsBox = 'students';
  static const String _groupsBox = 'groups';
  static const String _attendanceBox = 'attendance';

  /// Initialize the database
  Future<void> init() async {
    try {
      await Hive.initFlutter();

      // Open all boxes
      await Hive.openBox(_professorsBox);
      await Hive.openBox(_studentsBox);
      await Hive.openBox(_groupsBox);
      await Hive.openBox(_attendanceBox);

      Logger.info('Database initialized successfully');
    } catch (e, stackTrace) {
      Logger.error('Error initializing database', e, stackTrace);
    }
  }

  /// Get a box by name
  Box<T> getBox<T>(String boxName) {
    return Hive.box<T>(boxName);
  }

  /// Save data to a specific box
  Future<void> save(String boxName, String key, dynamic value) async {
    try {
      final box = Hive.box(boxName);
      await box.put(key, value);
      Logger.debug('Data saved to $boxName with key: $key');
    } catch (e, stackTrace) {
      Logger.error('Error saving data to $boxName', e, stackTrace);
    }
  }

  /// Get data from a specific box
  T? get<T>(String boxName, String key) {
    try {
      final box = Hive.box(boxName);
      return box.get(key) as T?;
    } catch (e, stackTrace) {
      Logger.error('Error getting data from $boxName', e, stackTrace);
      return null;
    }
  }

  /// Clear all data
  Future<void> clearAll() async {
    try {
      await Hive.deleteFromDisk();
      Logger.info('All database data cleared');
    } catch (e, stackTrace) {
      Logger.error('Error clearing database', e, stackTrace);
    }
  }
}
