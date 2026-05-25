import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../core/theme/iip_colors.dart';

/// OTP-style PIN entry with individual boxes.
class PinCodeInput extends StatefulWidget {
  const PinCodeInput({
    super.key,
    required this.colors,
    required this.onChanged,
    required this.onCompleted,
    this.enabled = true,
    this.length = 6,
    this.autofocus = false,
  });

  final IipColors colors;
  final ValueChanged<String> onChanged;
  final ValueChanged<String> onCompleted;
  final bool enabled;
  final int length;
  final bool autofocus;

  @override
  State<PinCodeInput> createState() => PinCodeInputState();
}

class PinCodeInputState extends State<PinCodeInput> {
  late final List<TextEditingController> _controllers;
  late final List<FocusNode> _focusNodes;

  @override
  void initState() {
    super.initState();
    _controllers = List.generate(widget.length, (_) => TextEditingController());
    _focusNodes = List.generate(widget.length, (_) => FocusNode());
    if (widget.autofocus) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && widget.enabled) _focusNodes.first.requestFocus();
      });
    }
  }

  @override
  void dispose() {
    for (final c in _controllers) {
      c.dispose();
    }
    for (final f in _focusNodes) {
      f.dispose();
    }
    super.dispose();
  }

  void clear() {
    for (final c in _controllers) {
      c.clear();
    }
    if (widget.enabled) {
      _focusNodes.first.requestFocus();
    }
    widget.onChanged('');
  }

  String get _value => _controllers.map((c) => c.text).join();

  void _notify() {
    final v = _value;
    widget.onChanged(v);
    if (v.length == widget.length) {
      widget.onCompleted(v);
    }
  }

  void _onChanged(int index, String value) {
    if (value.length > 1) {
      final chars = value.replaceAll(RegExp(r'\D'), '').split('');
      for (var i = 0; i < chars.length && index + i < widget.length; i++) {
        _controllers[index + i].text = chars[i];
      }
      final next = (index + chars.length).clamp(0, widget.length - 1);
      _focusNodes[next].requestFocus();
    } else if (value.isNotEmpty && index < widget.length - 1) {
      _focusNodes[index + 1].requestFocus();
    } else if (value.isEmpty && index > 0) {
      _focusNodes[index - 1].requestFocus();
    }
    _notify();
  }

  static const double _cellWidth = 46;
  static const double _cellHeight = 58;
  static const double _cellGap = 6;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: List.generate(widget.length, (index) {
          return Padding(
            padding: EdgeInsets.only(left: index == 0 ? 0 : _cellGap),
            child: SizedBox(
              width: _cellWidth,
              height: _cellHeight,
              child: TextField(
                controller: _controllers[index],
                focusNode: _focusNodes[index],
                enabled: widget.enabled,
                textAlign: TextAlign.center,
                keyboardType: TextInputType.number,
                maxLength: 1,
                style: TextStyle(
                  color: widget.colors.text,
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                ),
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: InputDecoration(
                  counterText: '',
                  filled: true,
                  fillColor: widget.colors.bg,
                  contentPadding: EdgeInsets.zero,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: widget.colors.border),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: widget.colors.border),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: widget.colors.primary, width: 2),
                  ),
                ),
                onChanged: (v) => _onChanged(index, v),
              ),
            ),
          );
        }),
      ),
    );
  }
}
