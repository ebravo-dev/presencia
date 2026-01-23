import 'package:flutter/material.dart';

class EmailSuggestionOverlay {
  static OverlayEntry? _overlayEntry;

  static void show({
    required BuildContext context,
    required String currentText,
    required Function(String) onSuggestionTapped,
  }) {
    hide(); // Ocultar cualquier overlay existente

    if (currentText.isEmpty || !currentText.contains('@')) return;

    final suggestions = _generateSuggestions(currentText);
    if (suggestions.isEmpty) return;

    _overlayEntry = OverlayEntry(
      builder: (context) => Positioned(
        bottom: MediaQuery.of(
          context,
        ).viewInsets.bottom, // Justo arriba del teclado
        left: 0,
        right: 0,
        child: Material(
          color: Colors.transparent,
          child: Container(
            height: 44, // Altura exacta de iOS
            decoration: BoxDecoration(
              // Gradiente sutil como las sugerencias reales de iOS
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [const Color(0xFFF7F7F7), const Color(0xFFE8E8E8)],
              ),
              border: Border(
                top: BorderSide(color: const Color(0xFFBBBBBB), width: 0.5),
                bottom: BorderSide(color: const Color(0xFFAAAAAA), width: 0.5),
              ),
            ),
            child: Row(
              children: [
                // Cada sugerencia ocupa 1/3 del ancho, como en iOS
                for (int i = 0; i < suggestions.length; i++) ...[
                  Expanded(
                    child: _buildIOSSuggestion(suggestions[i], () {
                      if (suggestions[i] == '🗑️ Borrar') {
                        // Borrar todo el contenido del campo
                        onSuggestionTapped('');
                      } else {
                        // Construir el email completo con el dominio seleccionado
                        final completeEmail = currentText + suggestions[i];
                        onSuggestionTapped(completeEmail);
                      }
                      hide();
                    }, showDivider: i < suggestions.length - 1),
                  ),
                ],
                // Rellenar espacios vacíos si hay menos de 3 sugerencias
                for (int i = suggestions.length; i < 3; i++)
                  const Expanded(child: SizedBox()),
              ],
            ),
          ),
        ),
      ),
    );

    Overlay.of(context).insert(_overlayEntry!);
  }

  static void hide() {
    _overlayEntry?.remove();
    _overlayEntry = null;
  }

  static Widget _buildIOSSuggestion(
    String suggestion,
    VoidCallback onTap, {
    required bool showDivider,
  }) {
    final isDeleteOption = suggestion.contains('Borrar');

    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: double.infinity,
        decoration: BoxDecoration(
          // Divisor vertical como en iOS (solo si no es el último)
          border: showDivider
              ? Border(
                  right: BorderSide(color: const Color(0xFFBBBBBB), width: 0.5),
                )
              : null,
        ),
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8.0),
            child: Text(
              suggestion,
              style: TextStyle(
                fontSize: 14,
                color: isDeleteOption
                    ? const Color(
                        0xFFFF3B30,
                      ) // Rojo de iOS para acciones destructivas
                    : const Color(0xFF007AFF), // Azul normal para dominios
                fontWeight: FontWeight.w400,
              ),
              textAlign: TextAlign.center,
              overflow: TextOverflow.ellipsis,
              maxLines: 1,
            ),
          ),
        ),
      ),
    );
  }

  static List<String> _generateSuggestions(String text) {
    if (text.isEmpty || !text.contains('@')) return [];

    // Dominios disponibles + opción de borrar
    final suggestions = ['uat.edu.mx', 'docentes.uat.edu.mx', '🗑️ Borrar'];
    return suggestions;
  }
}

// Widget dummy para mantener compatibilidad
class EmailSuggestionBar extends StatelessWidget {
  final String currentText;
  final Function(String) onSuggestionTapped;
  final bool isVisible;

  const EmailSuggestionBar({
    super.key,
    required this.currentText,
    required this.onSuggestionTapped,
    required this.isVisible,
  });

  @override
  Widget build(BuildContext context) {
    return const SizedBox.shrink(); // No mostramos nada aquí
  }
}
