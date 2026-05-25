import 'package:flutter/material.dart';
import '../../../core/theme/iip_colors.dart';

class AuthFormCard extends StatelessWidget {
  const AuthFormCard({super.key, required this.colors, required this.child, this.compact = false});

  final IipColors colors;
  final Widget child;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      height: compact ? double.infinity : null,
      padding: EdgeInsets.all(compact ? 14 : 20),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(compact ? 16 : 20),
        border: Border.all(color: colors.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: compact ? 12 : 20,
            offset: Offset(0, compact ? 4 : 8),
          ),
        ],
      ),
      child: child,
    );
  }
}

class AuthTextField extends StatelessWidget {
  const AuthTextField({
    super.key,
    required this.colors,
    required this.controller,
    required this.label,
    this.hint,
    this.icon,
    this.obscureText = false,
    this.textInputAction,
    this.keyboardType,
    this.onSubmitted,
    this.enabled = true,
    this.focusNode,
    this.suffix,
    this.compact = false,
  });

  final IipColors colors;
  final TextEditingController controller;
  final String label;
  final String? hint;
  final IconData? icon;
  final bool obscureText;
  final TextInputAction? textInputAction;
  final TextInputType? keyboardType;
  final ValueChanged<String>? onSubmitted;
  final bool enabled;
  final FocusNode? focusNode;
  final Widget? suffix;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final fieldPad = compact ? 12.0 : 16.0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            color: colors.text,
            fontSize: compact ? 12 : 13,
            fontWeight: FontWeight.w600,
          ),
        ),
        SizedBox(height: compact ? 4 : 8),
        TextField(
          controller: controller,
          focusNode: focusNode,
          obscureText: obscureText,
          enabled: enabled,
          textInputAction: textInputAction,
          keyboardType: keyboardType,
          onSubmitted: onSubmitted,
          style: TextStyle(color: colors.text, fontSize: compact ? 15 : 16),
          decoration: InputDecoration(
            hintText: hint ?? label,
            hintStyle: TextStyle(color: colors.textMuted.withValues(alpha: 0.75)),
            suffixIcon: suffix,
            prefixIcon: icon != null
                ? Icon(icon, size: compact ? 18 : 20, color: colors.textMuted)
                : null,
            filled: true,
            fillColor: colors.bg,
            contentPadding: EdgeInsets.symmetric(
              horizontal: icon != null ? 12 : 16,
              vertical: fieldPad,
            ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(compact ? 12 : 14),
              borderSide: BorderSide(color: colors.border),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: colors.border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: colors.primary, width: 2),
            ),
          ),
        ),
      ],
    );
  }
}

class AuthErrorBanner extends StatelessWidget {
  const AuthErrorBanner({super.key, required this.message, required this.colors, this.compact = false});

  final String message;
  final IipColors colors;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: EdgeInsets.symmetric(horizontal: 12, vertical: compact ? 8 : 12),
      decoration: BoxDecoration(
        color: colors.error.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colors.error.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline, color: colors.error, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: TextStyle(color: colors.error, fontSize: 13, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}

class AuthPrimaryButton extends StatelessWidget {
  const AuthPrimaryButton({
    super.key,
    required this.colors,
    required this.label,
    required this.onPressed,
    this.isLoading = false,
    this.icon,
    this.compact = false,
  });

  final IipColors colors;
  final String label;
  final VoidCallback? onPressed;
  final bool isLoading;
  final IconData? icon;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: compact ? 46 : 52,
      child: FilledButton(
        onPressed: isLoading ? null : onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: colors.primary,
          foregroundColor: Colors.white,
          disabledBackgroundColor: colors.primary.withValues(alpha: 0.4),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          elevation: 0,
        ),
        child: isLoading
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
              )
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    label,
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                  ),
                  if (icon != null) ...[
                    const SizedBox(width: 8),
                    Icon(icon, size: 18),
                  ],
                ],
              ),
      ),
    );
  }
}

class AuthTextButton extends StatelessWidget {
  const AuthTextButton({
    super.key,
    required this.colors,
    required this.label,
    required this.onPressed,
    this.icon,
  });

  final IipColors colors;
  final String label;
  final VoidCallback onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return TextButton.icon(
      onPressed: onPressed,
      icon: Icon(icon ?? Icons.arrow_back, size: 18, color: colors.textMuted),
      label: Text(
        label,
        style: TextStyle(color: colors.textMuted, fontWeight: FontWeight.w500),
      ),
    );
  }
}
