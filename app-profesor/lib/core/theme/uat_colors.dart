import 'package:flutter/material.dart';

/// Paleta de colores institucionales de la Universidad Autónoma de Tamaulipas (UAT)
/// Basada en los colores Pantone oficiales de la institución
class UATColors {
  UATColors._();

  // Pantone 159 C - Naranja institucional principal
  static const Color primary = Color(0xFFCC6633); // 100%
  static const Color primary80 = Color(0xFFD47A52); // 80%
  static const Color primary60 = Color(0xFFDB8F70); // 60%
  static const Color primary40 = Color(0xFFE3A38F); // 40%
  static const Color primary20 = Color(0xFFEAB8AD); // 20%

  // Pantone 1525 C - Naranja complementario
  static const Color secondary = Color(0xFFB85C3E); // 100%
  static const Color secondary80 = Color(0xFFC3705A); // 80%
  static const Color secondary60 = Color(0xFFCE8576); // 60%
  static const Color secondary40 = Color(0xFFD99A93); // 40%
  static const Color secondary20 = Color(0xFFE4AFAF); // 20%

  // Pantone Cool Gray 11 C - Gris institucional
  static const Color neutral = Color(0xFF53565A); // 100%
  static const Color neutral80 = Color(0xFF6F7174); // 80%
  static const Color neutral60 = Color(0xFF8B8C8F); // 60%
  static const Color neutral40 = Color(0xFFA7A8AA); // 40%
  static const Color neutral20 = Color(0xFFC3C4C5); // 20%

  // Pantone 302 C - Azul institucional
  static const Color accent = Color(0xFF003F5C); // 100%
  static const Color accent80 = Color(0xFF335F73); // 80%
  static const Color accent60 = Color(0xFF667F8A); // 60%
  static const Color accent40 = Color(0xFF999FA2); // 40%
  static const Color accent20 = Color(0xFFCCBFB9); // 20%

  // Colores derivados para la interfaz
  static const Color surface = Color(0xFFFFFBF7);
  static const Color background = Color(0xFFFAF6F2);
  static const Color onPrimary = Colors.white;
  static const Color onSecondary = Colors.white;
  static const Color onNeutral = Colors.white;
  static const Color onAccent = Colors.white;

  // Estados de error, warning, success
  static const Color error = Color(0xFFD32F2F);
  static const Color warning = primary;
  static const Color success = Color(0xFF2E7D32);

  // Gradientes institucionales
  static const LinearGradient primaryGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [primary, secondary],
  );

  static const LinearGradient accentGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [accent, accent80],
  );

  static const LinearGradient backgroundGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [background, surface, primary20],
  );
}

/// Tokens semánticos de color para adaptar la UI entre modo claro y oscuro.
@immutable
class UATPalette extends ThemeExtension<UATPalette> {
  final Color appBackground;
  final Color surface;
  final Color surfaceElevated;
  final Color surfaceMuted;
  final Color textPrimary;
  final Color textSecondary;
  final Color textTertiary;
  final Color iconMuted;
  final Color border;
  final Color controlBackground;
  final Color controlBorder;
  final Color controlIcon;
  final Color shadow;
  final Color skeletonBase;
  final Color skeletonHighlight;

  const UATPalette({
    required this.appBackground,
    required this.surface,
    required this.surfaceElevated,
    required this.surfaceMuted,
    required this.textPrimary,
    required this.textSecondary,
    required this.textTertiary,
    required this.iconMuted,
    required this.border,
    required this.controlBackground,
    required this.controlBorder,
    required this.controlIcon,
    required this.shadow,
    required this.skeletonBase,
    required this.skeletonHighlight,
  });

  static const UATPalette dark = UATPalette(
    appBackground: Color(0xFF000000),
    surface: Color(0xFF1C1C1E),
    surfaceElevated: Color(0xFF242426),
    surfaceMuted: Color(0xFF2C2C2E),
    textPrimary: Color(0xFFFFFFFF),
    textSecondary: Color(0xFFB8B8BE),
    textTertiary: Color(0xFF74747A),
    iconMuted: Color(0xFF8E8E93),
    border: Color(0x1FFFFFFF),
    controlBackground: Color(0xB82C2C2E),
    controlBorder: Color(0x1AFFFFFF),
    controlIcon: Color(0xFFFFFFFF),
    shadow: Color(0x8A000000),
    skeletonBase: Color(0xFF15151A),
    skeletonHighlight: Color(0xFFFFFFFF),
  );

  static const UATPalette light = UATPalette(
    appBackground: Color(0xFFF4F1EC),
    surface: Color(0xFFFBF8F3),
    surfaceElevated: Color(0xFFF0ECE6),
    surfaceMuted: Color(0xFFE8E2DA),
    textPrimary: Color(0xFF171512),
    textSecondary: Color(0xFF5F5B54),
    textTertiary: Color(0xFF8D887F),
    iconMuted: Color(0xFF7D776F),
    border: Color(0x262D2924),
    controlBackground: Color(0xEAFBF8F3),
    controlBorder: Color(0x332D2924),
    controlIcon: Color(0xFF221F1B),
    shadow: Color(0x24000000),
    skeletonBase: Color(0xFFE1DAD0),
    skeletonHighlight: Color(0xFFFFFFFF),
  );

  @override
  UATPalette copyWith({
    Color? appBackground,
    Color? surface,
    Color? surfaceElevated,
    Color? surfaceMuted,
    Color? textPrimary,
    Color? textSecondary,
    Color? textTertiary,
    Color? iconMuted,
    Color? border,
    Color? controlBackground,
    Color? controlBorder,
    Color? controlIcon,
    Color? shadow,
    Color? skeletonBase,
    Color? skeletonHighlight,
  }) {
    return UATPalette(
      appBackground: appBackground ?? this.appBackground,
      surface: surface ?? this.surface,
      surfaceElevated: surfaceElevated ?? this.surfaceElevated,
      surfaceMuted: surfaceMuted ?? this.surfaceMuted,
      textPrimary: textPrimary ?? this.textPrimary,
      textSecondary: textSecondary ?? this.textSecondary,
      textTertiary: textTertiary ?? this.textTertiary,
      iconMuted: iconMuted ?? this.iconMuted,
      border: border ?? this.border,
      controlBackground: controlBackground ?? this.controlBackground,
      controlBorder: controlBorder ?? this.controlBorder,
      controlIcon: controlIcon ?? this.controlIcon,
      shadow: shadow ?? this.shadow,
      skeletonBase: skeletonBase ?? this.skeletonBase,
      skeletonHighlight: skeletonHighlight ?? this.skeletonHighlight,
    );
  }

  @override
  UATPalette lerp(ThemeExtension<UATPalette>? other, double t) {
    if (other is! UATPalette) return this;

    return UATPalette(
      appBackground: Color.lerp(appBackground, other.appBackground, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      surfaceElevated: Color.lerp(surfaceElevated, other.surfaceElevated, t)!,
      surfaceMuted: Color.lerp(surfaceMuted, other.surfaceMuted, t)!,
      textPrimary: Color.lerp(textPrimary, other.textPrimary, t)!,
      textSecondary: Color.lerp(textSecondary, other.textSecondary, t)!,
      textTertiary: Color.lerp(textTertiary, other.textTertiary, t)!,
      iconMuted: Color.lerp(iconMuted, other.iconMuted, t)!,
      border: Color.lerp(border, other.border, t)!,
      controlBackground: Color.lerp(
        controlBackground,
        other.controlBackground,
        t,
      )!,
      controlBorder: Color.lerp(controlBorder, other.controlBorder, t)!,
      controlIcon: Color.lerp(controlIcon, other.controlIcon, t)!,
      shadow: Color.lerp(shadow, other.shadow, t)!,
      skeletonBase: Color.lerp(skeletonBase, other.skeletonBase, t)!,
      skeletonHighlight: Color.lerp(
        skeletonHighlight,
        other.skeletonHighlight,
        t,
      )!,
    );
  }
}

extension UATPaletteContext on BuildContext {
  UATPalette get uatPalette =>
      Theme.of(this).extension<UATPalette>() ?? UATPalette.dark;

  bool get isUatLightMode => Theme.of(this).brightness == Brightness.light;
}

/// Extensión para facilitar el uso de colores UAT.
extension UATColorExtension on Color {
  /// Convierte un color UAT a MaterialColor para usar en temas
  MaterialColor toMaterialColor() {
    final int red = (r * 255.0).round().clamp(0, 255);
    final int green = (g * 255.0).round().clamp(0, 255);
    final int blue = (b * 255.0).round().clamp(0, 255);

    final Map<int, Color> shades = {
      50: Color.fromRGBO(red, green, blue, .1),
      100: Color.fromRGBO(red, green, blue, .2),
      200: Color.fromRGBO(red, green, blue, .3),
      300: Color.fromRGBO(red, green, blue, .4),
      400: Color.fromRGBO(red, green, blue, .5),
      500: Color.fromRGBO(red, green, blue, .6),
      600: Color.fromRGBO(red, green, blue, .7),
      700: Color.fromRGBO(red, green, blue, .8),
      800: Color.fromRGBO(red, green, blue, .9),
      900: Color.fromRGBO(red, green, blue, 1),
    };

    return MaterialColor(toARGB32(), shades);
  }
}
