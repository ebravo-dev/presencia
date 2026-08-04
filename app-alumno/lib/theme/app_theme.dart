import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

abstract final class AppColors {
  static const brandRed = Color(0xFFD01018);
  static const brandRedDark = Color(0xFFE00E17);
  static const indigo = Color(0xFF1D10D0);
  static const indigoDark = Color(0xFF3324F2);
  static const orange = Color(0xFFE8800F);
  static const success = Color(0xFF16A34A);
}

abstract final class AppSpacing {
  static const xs = 8.0;
  static const sm = 12.0;
  static const md = 16.0;
  static const lg = 20.0;
  static const xl = 24.0;
  static const xxl = 32.0;
}

ThemeData buildAppTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  final background = dark ? const Color(0xFF141415) : Colors.white;
  final surface = dark ? const Color(0xFF1E1E1F) : const Color(0xFFF7F7F7);
  final text = dark ? const Color(0xFFF0F0F0) : const Color(0xFF1E1E1F);
  final muted = dark ? const Color(0xFFC1C1C2) : const Color(0xFF78787A);
  final border = dark ? const Color(0xFF303031) : const Color(0xFFDDDDDE);

  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    scaffoldBackgroundColor: background,
    colorScheme: ColorScheme.fromSeed(
      seedColor: dark ? AppColors.brandRedDark : AppColors.brandRed,
      brightness: brightness,
      primary: dark ? AppColors.brandRedDark : AppColors.brandRed,
      secondary: dark ? AppColors.indigoDark : AppColors.indigo,
      surface: surface,
    ),
    textTheme: GoogleFonts.interTextTheme(
      TextTheme(
        headlineSmall: TextStyle(
          fontSize: 23,
          fontWeight: FontWeight.w700,
          color: text,
        ),
        titleLarge: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w700,
          color: text,
        ),
        titleMedium: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: text,
        ),
        bodyLarge: TextStyle(fontSize: 14, color: text),
        bodyMedium: TextStyle(fontSize: 13, color: muted),
        bodySmall: TextStyle(fontSize: 12, color: muted),
        labelSmall: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: muted,
        ),
      ),
    ),
    cardTheme: CardThemeData(
      color: surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: border),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: dark ? const Color(0xFF303031) : const Color(0xFFF0F0F0),
      constraints: const BoxConstraints(minHeight: 52),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide.none,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.brandRed, width: 1.5),
      ),
    ),
  );
}

Color appSurface(BuildContext context) => Theme.of(context).cardTheme.color!;

Color appMuted(BuildContext context) =>
    Theme.of(context).textTheme.bodyMedium!.color!;
