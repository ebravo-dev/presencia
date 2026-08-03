import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:hive/hive.dart';

import 'package:appprofesoresuniversidad/main.dart';
import 'package:appprofesoresuniversidad/services/auth_storage_service.dart';

void main() {
  late Directory testDir;

  setUpAll(() async {
    FlutterSecureStorage.setMockInitialValues({});
    testDir = Directory.systemTemp.createTempSync('profesor_app_test_');
    Hive.init(testDir.path);
    await AuthStorageService().init();
    await AuthStorageService().clearSession();
  });

  tearDownAll(() async {
    await Hive.close();
    if (testDir.existsSync()) {
      testDir.deleteSync(recursive: true);
    }
  });

  testWidgets('App starts and shows the active professor login', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    await tester.pumpWidget(const ProviderScope(child: MyApp()));
    await tester.pumpAndSettle();

    expect(find.text('Universidad Autónoma de Tamaulipas'), findsOneWidget);
    expect(find.text('Sistema de Asistencia Profesores'), findsOneWidget);
    expect(find.text('Email institucional'), findsOneWidget);
    expect(find.text('Contraseña'), findsOneWidget);
  });
}
