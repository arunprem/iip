import 'package:flutter/material.dart';
import '../../../core/theme/iip_colors.dart';

/// Standard mobile text field (52dp touch target).
class MobileTextField extends StatelessWidget {
  const MobileTextField({
    super.key,
    required this.colors,
    required this.controller,
    required this.label,
    this.hint,
    this.icon,
    this.obscureText = false,
    this.focusNode,
    this.textInputAction,
    this.onSubmitted,
    this.enabled = true,
    this.suffix,
    this.validator,
    this.autovalidateMode,
  });

  final IipColors colors;
  final TextEditingController controller;
  final String label;
  final String? hint;
  final IconData? icon;
  final bool obscureText;
  final FocusNode? focusNode;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;
  final bool enabled;
  final Widget? suffix;
  final FormFieldValidator<String>? validator;
  final AutovalidateMode? autovalidateMode;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final fieldFill = isDark ? colors.bg : const Color(0xFFF8FAFC);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            color: colors.text,
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        TextFormField(
          controller: controller,
          focusNode: focusNode,
          obscureText: obscureText,
          enabled: enabled,
          textInputAction: textInputAction,
          onFieldSubmitted: onSubmitted,
          validator: validator,
          autovalidateMode: autovalidateMode ?? AutovalidateMode.disabled,
          style: TextStyle(
            color: colors.text,
            fontSize: 16,
            fontWeight: FontWeight.w500,
          ),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: TextStyle(
              color: colors.textMuted,
              fontWeight: FontWeight.w400,
            ),
            prefixIcon: icon != null ? Icon(icon, size: 20, color: colors.textMuted) : null,
            suffixIcon: suffix,
            filled: true,
            fillColor: fieldFill,
            contentPadding: const EdgeInsets.symmetric(vertical: 14),
            errorStyle: TextStyle(color: colors.error, fontSize: 12, height: 1.3),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: colors.border),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: colors.border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: colors.primary, width: 2),
            ),
            errorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: colors.error),
            ),
            focusedErrorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: colors.error, width: 2),
            ),
          ),
        ),
      ],
    );
  }
}
