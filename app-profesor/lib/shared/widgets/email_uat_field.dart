import 'package:flutter/material.dart';

class EmailUATField extends StatefulWidget {
  final TextEditingController controller;
  final String? Function(String?)? validator;
  final bool enabled;
  final VoidCallback? onSubmitted;

  const EmailUATField({
    super.key,
    required this.controller,
    this.validator,
    this.enabled = true,
    this.onSubmitted,
  });

  @override
  State<EmailUATField> createState() => _EmailUATFieldState();
}

class _EmailUATFieldState extends State<EmailUATField> {
  final LayerLink _layerLink = LayerLink();
  OverlayEntry? _overlayEntry;
  final FocusNode _focusNode = FocusNode();

  final List<String> _domains = ['@uat.edu.mx', '@docentes.uat.edu.mx'];

  List<String> _suggestions = [];

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
    _hideOverlay();
    super.dispose();
  }

  void _onTextChanged() {
    final text = widget.controller.text;
    if (text.isNotEmpty && !text.contains('@')) {
      setState(() {
        _suggestions = _domains.map((domain) => text + domain).toList();
      });
      _showOverlay();
    } else {
      _hideOverlay();
    }
  }

  void _onFocusChanged() {
    if (!_focusNode.hasFocus) {
      _hideOverlay();
    }
  }

  void _showOverlay() {
    if (_overlayEntry != null) return;

    _overlayEntry = OverlayEntry(
      builder: (context) => Positioned(
        width: 350,
        child: CompositedTransformFollower(
          link: _layerLink,
          showWhenUnlinked: false,
          offset: const Offset(0, 60),
          child: Material(
            elevation: 4,
            borderRadius: BorderRadius.circular(8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: _suggestions.map((suggestion) {
                return ListTile(
                  dense: true,
                  title: Text(suggestion),
                  onTap: () {
                    widget.controller.text = suggestion;
                    widget.controller.selection = TextSelection.fromPosition(
                      TextPosition(offset: suggestion.length),
                    );
                    _hideOverlay();
                    if (widget.onSubmitted != null) {
                      widget.onSubmitted!();
                    }
                  },
                );
              }).toList(),
            ),
          ),
        ),
      ),
    );

    Overlay.of(context).insert(_overlayEntry!);
  }

  void _hideOverlay() {
    _overlayEntry?.remove();
    _overlayEntry = null;
  }

  @override
  Widget build(BuildContext context) {
    return CompositedTransformTarget(
      link: _layerLink,
      child: TextFormField(
        controller: widget.controller,
        focusNode: _focusNode,
        keyboardType: TextInputType.emailAddress,
        textInputAction: TextInputAction.next,
        enabled: widget.enabled,
        autocorrect: false,
        enableSuggestions: true,
        autofillHints: const [AutofillHints.email],
        decoration: const InputDecoration(
          labelText: 'Email institucional',
          hintText: 'Escribe tu usuario (ej: ejgonzalez)',
          prefixIcon: Icon(Icons.email_outlined),
        ),
        validator: widget.validator,
        onFieldSubmitted: (_) {
          _hideOverlay();
          if (widget.onSubmitted != null) {
            widget.onSubmitted!();
          }
        },
      ),
    );
  }
}
