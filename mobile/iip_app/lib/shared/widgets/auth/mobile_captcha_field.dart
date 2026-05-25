import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../core/theme/iip_colors.dart';

/// Compact captcha row for mobile login — image, code field, refresh.
class MobileCaptchaField extends StatelessWidget {
  const MobileCaptchaField({
    super.key,
    required this.colors,
    required this.controller,
    required this.imageBase64,
    required this.isLoading,
    required this.onRefresh,
    this.enabled = true,
    this.focusNode,
    this.onSubmitted,
    this.validator,
    this.autovalidateMode,
  });

  final IipColors colors;
  final TextEditingController controller;
  final String imageBase64;
  final bool isLoading;
  final VoidCallback onRefresh;
  final bool enabled;
  final FocusNode? focusNode;
  final ValueChanged<String>? onSubmitted;
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
          'Security code',
          style: TextStyle(
            color: colors.text,
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Container(
              width: 108,
              height: 48,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: colors.border),
              ),
              alignment: Alignment.center,
              child: _CaptchaImage(dataUrl: imageBase64, loading: isLoading),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: TextFormField(
                controller: controller,
                focusNode: focusNode,
                enabled: enabled && !isLoading,
                onFieldSubmitted: onSubmitted,
                validator: validator,
                autovalidateMode: autovalidateMode ?? AutovalidateMode.disabled,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: colors.text,
                  fontSize: 17,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 3,
                ),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[a-zA-Z0-9]')),
                  LengthLimitingTextInputFormatter(8),
                ],
                decoration: InputDecoration(
                  hintText: 'Code',
                  hintStyle: TextStyle(color: colors.textMuted.withValues(alpha: 0.75)),
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
            ),
            const SizedBox(width: 8),
            IconButton(
              onPressed: isLoading ? null : onRefresh,
              style: IconButton.styleFrom(
                backgroundColor: fieldFill,
                foregroundColor: colors.primary,
                side: BorderSide(color: colors.border),
                minimumSize: const Size(48, 48),
              ),
              icon: isLoading
                  ? SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: colors.primary),
                    )
                  : const Icon(Icons.refresh_rounded, size: 22),
            ),
          ],
        ),
      ],
    );
  }
}

class _CaptchaImage extends StatelessWidget {
  const _CaptchaImage({required this.dataUrl, required this.loading});

  final String dataUrl;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const SizedBox(
        width: 20,
        height: 20,
        child: CircularProgressIndicator(strokeWidth: 2),
      );
    }
    if (dataUrl.isEmpty) {
      return const Text('—', style: TextStyle(fontSize: 12, color: Colors.grey));
    }
    try {
      final base64 = dataUrl.contains(',') ? dataUrl.split(',').last : dataUrl;
      final bytes = base64Decode(base64);
      return Image.memory(bytes, fit: BoxFit.contain);
    } catch (_) {
      return const Icon(Icons.broken_image_outlined, size: 20, color: Colors.grey);
    }
  }
}
