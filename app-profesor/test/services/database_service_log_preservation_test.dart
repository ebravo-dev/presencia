import 'dart:io';

import 'package:appprofesoresuniversidad/services/database_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'functional cleanup never clears the durable diagnostic queue',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'database-cleanup-log-test-',
      );
      Hive.init(directory.path);
      final functional = await Hive.openBox<dynamic>('professors');
      final diagnostics = await Hive.openBox<dynamic>(
        'presencia_app_log_queue_v1',
      );
      await functional.put('teacher', {'id': '1'});
      await diagnostics.put('event-id', {'eventId': 'event-id'});

      await DatabaseService().clearAll();

      expect(functional, isEmpty);
      expect(diagnostics.get('event-id'), isNotNull);

      await functional.close();
      await diagnostics.close();
      await directory.delete(recursive: true);
    },
  );
}
