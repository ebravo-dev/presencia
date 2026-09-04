import 'dart:convert';
import 'dart:io';

import 'package:appprofesoresuniversidad/services/app_log_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'never removes queued logs before an explicit server acknowledgement',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'professor-log-queue-test-',
      );
      Hive.init(directory.path);
      final queue = await Hive.openBox<dynamic>('professor-queue');
      final metadata = await Hive.openBox<dynamic>('professor-metadata');
      final transport = _FakeTransport()..shouldFail = true;
      final service = AppLogService.forTesting(transport);
      await service.initialize(
        baseUrl: 'https://example.invalid',
        ingestionKey: 'x' * 32,
        application: 'PROFESSOR',
        appVersion: '1.0.0',
        buildNumber: '1',
        scheduleRetries: false,
        autoFlush: false,
        queueBox: queue,
        metadataBox: metadata,
      );
      await service.record(
        level: 'ERROR',
        eventName: 'test.failure',
        message: 'offline',
      );
      expect(service.pendingCount, 2);
      await service.flush(force: true);
      expect(service.pendingCount, 2);
      transport.shouldFail = false;
      transport.maxAcknowledgements = 1;
      await service.flush(force: true);
      expect(service.pendingCount, 1);
      transport.maxAcknowledgements = null;
      await service.flush(force: true);
      expect(service.pendingCount, 0);

      await service.close();
      await queue.close();
      await metadata.close();
      await directory.delete(recursive: true);
    },
  );

  test(
    'serializes concurrent writes and keeps every request below the byte limit',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'professor-log-batch-test-',
      );
      Hive.init(directory.path);
      final queue = await Hive.openBox<dynamic>('professor-batch-queue');
      final metadata = await Hive.openBox<dynamic>('professor-batch-metadata');
      final transport = _FakeTransport();
      final service = AppLogService.forTesting(transport);
      await service.initialize(
        baseUrl: 'https://example.invalid',
        ingestionKey: 'x' * 32,
        application: 'PROFESSOR',
        appVersion: '1.0.0',
        buildNumber: '1',
        scheduleRetries: false,
        autoFlush: false,
        queueBox: queue,
        metadataBox: metadata,
      );

      final largeStack = StackTrace.fromString(List.filled(32000, 'x').join());
      await Future.wait(
        List.generate(
          30,
          (index) => service.record(
            level: 'ERROR',
            eventName: 'test.concurrent',
            message: index == 0 ? '   ' : 'fallo $index',
            stackTrace: largeStack,
            context: index == 0
                ? {
                    for (var item = 0; item < 100; item++)
                      'key$item': List.filled(8000, 'y').join(),
                  }
                : null,
          ),
        ),
      );

      final events = queue.values
          .map((value) => Map<String, dynamic>.from(value as Map))
          .toList();
      expect(
        events.map((event) => event['sequence'] as int).toSet(),
        hasLength(events.length),
      );
      expect(
        events.firstWhere(
          (event) => event['eventName'] == 'test.concurrent',
        )['message'],
        isNotEmpty,
      );
      expect(
        events.firstWhere(
          (event) =>
              event['context'] is Map && event['context']['_truncated'] == true,
        )['context']['_truncated'],
        isTrue,
      );

      await service.flush(force: true);
      expect(service.pendingCount, 0);
      expect(transport.payloads.length, greaterThan(1));
      for (final payload in transport.payloads) {
        expect(utf8.encode(jsonEncode(payload)).length, lessThan(850000));
      }

      await service.close();
      await queue.close();
      await metadata.close();
      await directory.delete(recursive: true);
    },
  );
}

class _FakeTransport implements AppLogTransport {
  bool shouldFail = false;
  int? maxAcknowledgements;
  final payloads = <Map<String, dynamic>>[];
  @override
  Future<Set<String>> send({
    required String baseUrl,
    required String ingestionKey,
    required Map<String, dynamic> payload,
  }) async {
    payloads.add(payload);
    if (shouldFail) throw const AppLogTransportException('offline');
    return (payload['events'] as List)
        .take(maxAcknowledgements ?? (payload['events'] as List).length)
        .map((event) => (event as Map)['eventId'].toString())
        .toSet();
  }
}
