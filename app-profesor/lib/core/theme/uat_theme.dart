import 'package:flutter/material.dart';
import 'uat_colors.dart';

/// Tema personalizado de la Universidad Autónoma de Tamaulipas
class UATTheme {
  UATTheme._();

  /// Tema principal de la aplicación
  static ThemeData get lightTheme {
    const palette = UATPalette.light;

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: palette.appBackground,
      extensions: const [UATPalette.light],

      // Esquema de colores basado en la paleta UAT
      colorScheme: ColorScheme.light(
        primary: UATColors.primary,
        onPrimary: UATColors.onPrimary,
        secondary: UATColors.accent,
        onSecondary: UATColors.onAccent,
        tertiary: UATColors.secondary,
        surface: palette.surface,
        onSurface: palette.textPrimary,
        error: UATColors.error,
        outline: palette.border,
        outlineVariant: palette.surfaceMuted,
      ),

      // AppBar theme con colores UAT
      appBarTheme: AppBarTheme(
        backgroundColor: UATColors.accent,
        foregroundColor: UATColors.onAccent,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: const TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: UATColors.onAccent,
        ),
      ),

      // Elevated Button theme
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: UATColors.primary,
          foregroundColor: UATColors.onPrimary,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.5,
          ),
        ),
      ),

      // Input Decoration theme
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: palette.surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: palette.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: UATColors.primary, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: UATColors.error),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: UATColors.error, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
        labelStyle: TextStyle(color: palette.textSecondary, fontSize: 14),
        hintStyle: TextStyle(color: palette.textTertiary, fontSize: 14),
      ),

      // Card theme
      cardTheme: CardThemeData(
        color: palette.surface,
        elevation: 8,
        shadowColor: palette.shadow,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      ),

      dialogTheme: DialogThemeData(
        backgroundColor: palette.surfaceElevated,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),

      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: palette.surfaceElevated,
        modalBackgroundColor: palette.surfaceElevated,
      ),

      textSelectionTheme: TextSelectionThemeData(
        cursorColor: UATColors.primary,
        selectionColor: UATColors.primary.withValues(alpha: 0.24),
        selectionHandleColor: UATColors.primary,
      ),

      // Text theme con tipografía institucional
      textTheme: TextTheme(
        displayLarge: TextStyle(
          fontSize: 57,
          fontWeight: FontWeight.w300,
          color: UATColors.accent,
        ),
        displayMedium: TextStyle(
          fontSize: 45,
          fontWeight: FontWeight.w300,
          color: UATColors.accent,
        ),
        displaySmall: TextStyle(
          fontSize: 36,
          fontWeight: FontWeight.w300,
          color: UATColors.accent,
        ),
        headlineLarge: TextStyle(
          fontSize: 32,
          fontWeight: FontWeight.w400,
          color: UATColors.accent,
        ),
        headlineMedium: TextStyle(
          fontSize: 28,
          fontWeight: FontWeight.w400,
          color: UATColors.accent,
        ),
        headlineSmall: TextStyle(
          fontSize: 24,
          fontWeight: FontWeight.w400,
          color: UATColors.accent,
        ),
        titleLarge: TextStyle(
          fontSize: 22,
          fontWeight: FontWeight.w500,
          color: palette.textPrimary,
        ),
        titleMedium: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w500,
          color: palette.textPrimary,
        ),
        titleSmall: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: palette.textPrimary,
        ),
        bodyLarge: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w400,
          color: palette.textSecondary,
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w400,
          color: palette.textSecondary,
        ),
        bodySmall: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w400,
          color: palette.textTertiary,
        ),
        labelLarge: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w600,
          color: palette.textPrimary,
        ),
        labelMedium: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: palette.textSecondary,
        ),
        labelSmall: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: palette.textTertiary,
        ),
      ),

      // Icon theme
      iconTheme: IconThemeData(color: palette.textSecondary, size: 24),

      // Divider theme
      dividerTheme: DividerThemeData(
        color: palette.border,
        thickness: 1,
        space: 1,
      ),

      // Chip theme
      chipTheme: ChipThemeData(
        backgroundColor: palette.surfaceMuted,
        labelStyle: TextStyle(color: palette.textPrimary),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  static ThemeData get darkTheme {
    final base = lightTheme;
    final palette = UATPalette.dark;

    return base.copyWith(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: palette.appBackground,
      extensions: const [UATPalette.dark],
      colorScheme: ColorScheme.dark(
        primary: UATColors.primary,
        onPrimary: UATColors.onPrimary,
        secondary: UATColors.accent80,
        onSecondary: UATColors.onAccent,
        tertiary: UATColors.secondary80,
        surface: palette.surface,
        onSurface: palette.textPrimary,
        error: UATColors.error,
        outline: palette.border,
        outlineVariant: palette.surfaceMuted,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: palette.appBackground,
        foregroundColor: palette.textPrimary,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: palette.textPrimary,
        ),
      ),
      cardTheme: CardThemeData(
        color: palette.surface,
        elevation: 8,
        shadowColor: palette.shadow,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: palette.surfaceElevated,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: palette.surfaceElevated,
        modalBackgroundColor: palette.surfaceElevated,
      ),
      textSelectionTheme: TextSelectionThemeData(
        cursorColor: UATColors.primary,
        selectionColor: UATColors.primary.withValues(alpha: 0.28),
        selectionHandleColor: UATColors.primary,
      ),
      iconTheme: IconThemeData(color: palette.textSecondary, size: 24),
      dividerTheme: DividerThemeData(
        color: palette.border,
        thickness: 1,
        space: 1,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: palette.surfaceMuted,
        labelStyle: TextStyle(color: palette.textPrimary),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      inputDecorationTheme: base.inputDecorationTheme.copyWith(
        fillColor: palette.surface,
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: palette.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: UATColors.primary, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: UATColors.error),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: UATColors.error, width: 2),
        ),
        labelStyle: TextStyle(color: palette.textSecondary, fontSize: 14),
        hintStyle: TextStyle(color: palette.textTertiary, fontSize: 14),
      ),
      textTheme: base.textTheme.apply(
        bodyColor: palette.textPrimary,
        displayColor: palette.textPrimary,
      ),
    );
  }
}

/// Utilidades para gradientes UAT
class UATGradients {
  UATGradients._();

  /// Gradiente para fondos principales
  static const LinearGradient background = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [UATColors.surface, Color(0xFFFFFFFE), UATColors.surface],
    stops: [0.0, 0.5, 1.0],
  );

  /// Gradiente para elementos destacados
  static const LinearGradient primary = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [UATColors.primary, UATColors.secondary],
  );

  /// Gradiente para elementos de acento
  static const LinearGradient accent = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [UATColors.accent, UATColors.accent80],
  );

  /// Gradiente sutil para cards
  static const LinearGradient card = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [UATColors.surface, Colors.white],
  );
}
