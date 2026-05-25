import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../core/theme/iip_colors.dart';

/// Security captcha block — matches web portal login security check section.
class SecurityCheckCard extends StatelessWidget {
  const SecurityCheckCard({
    super.key,
    required this.colors,
    required this.captchaController,
    required this.captchaImageBase64,
    required this.isLoading,
    required this.onRefresh,
    this.enabled = true,
    this.focusNode,
    this.textInputAction,
    this.onSubmitted,
    this.compact = false,
  });

  final IipColors colors;
  final TextEditingController captchaController;
  final String captchaImageBase64;
  final bool isLoading;
  final VoidCallback onRefresh;
  final bool enabled;
  final FocusNode? focusNode;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    if (compact) {
      return _CompactSecurityCheck(
        colors: colors,
        captchaController: captchaController,
        captchaImageBase64: captchaImageBase64,
        isLoading: isLoading,
        onRefresh: onRefresh,
        enabled: enabled,
        focusNode: focusNode,
        textInputAction: textInputAction,
        onSubmitted: onSubmitted,
      );
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.bg.withValues(alpha: 0.65),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'SECURITY CHECK',
            style: TextStyle(
              color: colors.textMuted,
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.6,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Container(
                width: 168,
                height: 48,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: colors.border),
                ),
                alignment: Alignment.center,
                child: _CaptchaImage(dataUrl: captchaImageBase64, loading: isLoading),
              ),
              const SizedBox(width: 10),
              _RefreshButton(
                colors: colors,
                isLoading: isLoading,
                onRefresh: onRefresh,
                size: 46,
              ),
            ],
          ),
          const SizedBox(height: 12),
          _CaptchaTextField(
            colors: colors,
            controller: captchaController,
            enabled: enabled,
            isLoading: isLoading,
            focusNode: focusNode,
            textInputAction: textInputAction,
            onSubmitted: onSubmitted,
            hint: 'Enter security code',
          ),
        ],
      ),
    );
  }
}

class _CompactSecurityCheck extends StatelessWidget {
  const _CompactSecurityCheck({
    required this.colors,
    required this.captchaController,
    required this.captchaImageBase64,
    required this.isLoading,
    required this.onRefresh,
    required this.enabled,
    this.focusNode,
    this.textInputAction,
    this.onSubmitted,
  });

  final IipColors colors;
  final TextEditingController captchaController;
  final String captchaImageBase64;
  final bool isLoading;
  final VoidCallback onRefresh;
  final bool enabled;
  final FocusNode? focusNode;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'SECURITY CHECK',
          style: TextStyle(
            color: colors.textMuted,
            fontSize: 10,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.4,
          ),
        ),
        const SizedBox(height: 8),
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Container(
              width: 100,
              height: 40,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: colors.border),
              ),
              alignment: Alignment.center,
              child: _CaptchaImage(dataUrl: captchaImageBase64, loading: isLoading),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _CaptchaTextField(
                colors: colors,
                controller: captchaController,
                enabled: enabled,
                isLoading: isLoading,
                focusNode: focusNode,
                textInputAction: textInputAction,
                onSubmitted: onSubmitted,
                hint: 'Code',
                compact: true,
              ),
            ),
            const SizedBox(width: 6),
            _RefreshButton(
              colors: colors,
              isLoading: isLoading,
              onRefresh: onRefresh,
              size: 40,
            ),
          ],
        ),
      ],
    );
  }
}

class _RefreshButton extends StatelessWidget {
  const _RefreshButton({
    required this.colors,
    required this.isLoading,
    required this.onRefresh,
    required this.size,
  });

  final IipColors colors;
  final bool isLoading;
  final VoidCallback onRefresh;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: colors.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: isLoading ? null : onRefresh,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: size,
          height: size,
          child: Center(
            child: isLoading
                ? SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: colors.primary),
                  )
                : Icon(Icons.refresh_rounded, color: colors.primary, size: 22),
          ),
        ),
      ),
    );
  }
}

class _CaptchaTextField extends StatelessWidget {
  const _CaptchaTextField({
    required this.colors,
    required this.controller,
    required this.enabled,
    required this.isLoading,
    required this.hint,
    this.focusNode,
    this.textInputAction,
    this.onSubmitted,
    this.compact = false,
  });

  final IipColors colors;
  final TextEditingController controller;
  final bool enabled;
  final bool isLoading;
  final String hint;
  final FocusNode? focusNode;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      focusNode: focusNode,
      enabled: enabled && !isLoading,
      textInputAction: textInputAction,
      onSubmitted: onSubmitted,
      textAlign: TextAlign.center,
      style: TextStyle(
        color: colors.text,
        fontSize: compact ? 16 : 17,
        fontWeight: FontWeight.w600,
        letterSpacing: compact ? 4 : 5,
        fontFamily: 'monospace',
      ),
      inputFormatters: [
        FilteringTextInputFormatter.allow(RegExp(r'[a-zA-Z0-9]')),
        LengthLimitingTextInputFormatter(8),
      ],
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(
          color: colors.textMuted.withValues(alpha: 0.75),
          letterSpacing: 0.5,
          fontWeight: FontWeight.w400,
          fontSize: compact ? 14 : 15,
        ),
        filled: true,
        fillColor: colors.surface,
        contentPadding: EdgeInsets.symmetric(vertical: compact ? 12 : 14, horizontal: 12),
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
      ),
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
        width: 22,
        height: 22,
        child: CircularProgressIndicator(strokeWidth: 2),
      );
    }
    if (dataUrl.isEmpty) {
      return const Text('Unavailable', style: TextStyle(fontSize: 12, color: Colors.grey));
    }
    try {
      final base64 = dataUrl.contains(',') ? dataUrl.split(',').last : dataUrl;
      final bytes = base64Decode(base64);
      return Image.memory(bytes, fit: BoxFit.contain, filterQuality: FilterQuality.high);
    } catch (_) {
      return const Icon(Icons.broken_image_outlined, color: Colors.grey);
    }
  }
}
