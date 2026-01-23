import 'package:flutter/material.dart';
import 'uat_colors.dart';

/// Tema personalizado de la Universidad Autónoma de Tamaulipas
class UATTheme {
  UATTheme._();

  /// Tema principal de la aplicación
  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,

      // Esquema de colores basado en la paleta UAT
      colorScheme: ColorScheme.light(
        primary: UATColors.primary,
        onPrimary: UATColors.onPrimary,
        secondary: UATColors.accent,
        onSecondary: UATColors.onAccent,
        tertiary: UATColors.secondary,
        surface: UATColors.surface,
        onSurface: UATColors.neutral,
        error: UATColors.error,
        outline: UATColors.neutral40,
        outlineVariant: UATColors.neutral20,
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
        fillColor: UATColors.surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: UATColors.neutral20),
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
        labelStyle: TextStyle(color: UATColors.neutral80, fontSize: 14),
        hintStyle: TextStyle(color: UATColors.neutral60, fontSize: 14),
      ),

      // Card theme
      cardTheme: CardThemeData(
        color: UATColors.surface,
        elevation: 8,
        shadowColor: UATColors.neutral40.withOpacity(0.3),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
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
          color: UATColors.neutral,
        ),
        titleMedium: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w500,
          color: UATColors.neutral,
        ),
        titleSmall: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: UATColors.neutral,
        ),
        bodyLarge: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w400,
          color: UATColors.neutral80,
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w400,
          color: UATColors.neutral80,
        ),
        bodySmall: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w400,
          color: UATColors.neutral60,
        ),
        labelLarge: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w600,
          color: UATColors.neutral,
        ),
        labelMedium: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: UATColors.neutral80,
        ),
        labelSmall: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: UATColors.neutral60,
        ),
      ),

      // Icon theme
      iconTheme: IconThemeData(color: UATColors.neutral80, size: 24),

      // Divider theme
      dividerTheme: DividerThemeData(
        color: UATColors.neutral20,
        thickness: 1,
        space: 1,
      ),

      // Chip theme
      chipTheme: ChipThemeData(
        backgroundColor: UATColors.neutral20,
        labelStyle: TextStyle(color: UATColors.neutral),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  /// Tema oscuro (para implementar en el futuro)
  static ThemeData get darkTheme {
    // TODO: Implementar tema oscuro con colores UAT
    return lightTheme;
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
