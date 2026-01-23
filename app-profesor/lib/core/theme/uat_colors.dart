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

/// Extensión para facilitar el uso de colores UAT
extension UATColorExtension on Color {
  /// Convierte un color UAT a MaterialColor para usar en temas
  MaterialColor toMaterialColor() {
    final int red = this.red;
    final int green = this.green;
    final int blue = this.blue;

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

    return MaterialColor(value, shades);
  }
}