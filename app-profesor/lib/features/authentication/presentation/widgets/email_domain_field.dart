import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../../core/theme/uat_colors.dart';

class EmailDomainField extends StatefulWidget {
  final TextEditingController controller;
  final bool enabled;
  final String? Function(String?)? validator;
  final TextInputAction? textInputAction;
  final void Function(String)? onFieldSubmitted;

  const EmailDomainField({
    super.key,
    required this.controller,
    this.enabled = true,
    this.validator,
    this.textInputAction,
    this.onFieldSubmitted,
  });

  @override
  State<EmailDomainField> createState() => _EmailDomainFieldState();
}

class _EmailDomainFieldState extends State<EmailDomainField> {
  static const List<String> domains = ['@docentes.uat.edu.mx', '@uat.edu.mx'];

  OverlayEntry? _keyboardChipsEntry;
  final FocusNode _focusNode = FocusNode();

  // Lista de sugerencias para el teclado
  List<String> get keyboardSuggestions {
    // Siempre mostrar los dominios como sugerencias en el teclado
    return ['@docentes.uat.edu.mx', '@uat.edu.mx'];
  }

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onTextChanged);
    _focusNode.addListener(_onFocusChanged);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onTextChanged);
    _focusNode.removeListener(_onFocusChanged);
    _focusNode.dispose();
    _removeKeyboardChips();
    super.dispose();
  }

  void _onTextChanged() {
    final text = widget.controller.text;

    // Mostrar sugerencias solo cuando hay @ y no es dominio completo
    if (text.contains('@') && !domains.any((domain) => text.endsWith(domain))) {
      if (_focusNode.hasFocus) {
        _showKeyboardSuggestions();
      }
    } else {
      _removeKeyboardChips();
    }
  }

  void _onFocusChanged() {
    if (!_focusNode.hasFocus) {
      _removeKeyboardChips();
    } else {
      // Revisar si debe mostrar sugerencias al ganar foco
      _onTextChanged();
    }
  }

  void _selectDomain(String selectedDomain) {
    final text = widget.controller.text;
    final atIndex = text.lastIndexOf('@');

    if (atIndex != -1) {
      final beforeAt = text.substring(0, atIndex);
      widget.controller.text = beforeAt + selectedDomain;
      widget.controller.selection = TextSelection.fromPosition(
        TextPosition(offset: widget.controller.text.length),
      );
    }

    _removeKeyboardChips();
  }

  // Barra de sugerencias estilo iOS nativo
  void _showKeyboardSuggestions() {
    _removeKeyboardChips();

    if (!_focusNode.hasFocus) return;

    _keyboardChipsEntry = OverlayEntry(
      builder: (context) {
        final bottomInset = MediaQuery.of(context).viewInsets.bottom;
        if (bottomInset == 0) return const SizedBox.shrink();

        return Positioned(
          left: 0,
          right: 0,
          bottom: bottomInset, // Sin espacio, pegado al teclado
          child: Container(
            height: 44, // Altura estándar de la barra de sugerencias de iOS
            decoration: BoxDecoration(
              color: const Color(0xFFD1D5DB), // Gris claro como iOS
              border: Border(
                top: BorderSide(color: const Color(0xFFB5B5B5), width: 0.5),
              ),
            ),
            child: Row(
              children: [
                // Padding izquierdo
                const SizedBox(width: 16),

                // Primera sugerencia
                Expanded(
                  child: _NativeSuggestionButton(
                    text: domains[0],
                    onTap: () => _selectDomain(domains[0]),
                  ),
                ),

                // Separador vertical
                Container(
                  width: 0.5,
                  height: 28,
                  color: const Color(0xFFB5B5B5),
                ),

                // Segunda sugerencia
                Expanded(
                  child: _NativeSuggestionButton(
                    text: domains[1],
                    onTap: () => _selectDomain(domains[1]),
                  ),
                ),

                // Separador vertical
                Container(
                  width: 0.5,
                  height: 28,
                  color: const Color(0xFFB5B5B5),
                ),

                // Espacio vacío para tercera sugerencia (como iOS)
                const Expanded(child: SizedBox()),

                // Padding derecho
                const SizedBox(width: 16),
              ],
            ),
          ),
        );
      },
    );

    Overlay.of(context).insert(_keyboardChipsEntry!);
  }

  void _removeKeyboardChips() {
    _keyboardChipsEntry?.remove();
    _keyboardChipsEntry = null;
  }

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: widget.controller,
      focusNode: _focusNode,
      enabled: widget.enabled,
      decoration: InputDecoration(
        labelText: 'Email institucional',
        hintText: 'ejgonzalez@d  o  ejgonzalez@u',
        prefixIcon: Icon(
          Icons.alternate_email,
          color: UATColors.neutral80,
          size: 20,
        ),
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
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
      ),
      validator: widget.validator,
      textInputAction: widget.textInputAction,
      onFieldSubmitted: widget.onFieldSubmitted,
      style: const TextStyle(fontSize: 13),
      keyboardType: TextInputType.emailAddress,
      autofillHints: [AutofillHints.email, ...keyboardSuggestions],
      smartDashesType: SmartDashesType.disabled,
      smartQuotesType: SmartQuotesType.disabled,
    );
  }
}

class _NativeSuggestionButton extends StatelessWidget {
  final String text;
  final VoidCallback onTap;

  const _NativeSuggestionButton({required this.text, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Container(
          height: double.infinity,
          alignment: Alignment.center,
          child: Text(
            text,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w400,
              color: Color(0xFF007AFF), // Azul de iOS
            ),
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }
}
