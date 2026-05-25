import 'package:flutter/material.dart';

/// Matches web portal CSS tokens (index.css).
class IipColors {
  const IipColors({
    required this.bg,
    required this.surface,
    required this.surfaceHover,
    required this.primary,
    required this.primaryHover,
    required this.text,
    required this.textMuted,
    required this.border,
    required this.error,
    required this.success,
    required this.warning,
  });

  final Color bg;
  final Color surface;
  final Color surfaceHover;
  final Color primary;
  final Color primaryHover;
  final Color text;
  final Color textMuted;
  final Color border;
  final Color error;
  final Color success;
  final Color warning;

  static const light = IipColors(
    bg: Color(0xFFF8FAFC),
    surface: Color(0xFFFFFFFF),
    surfaceHover: Color(0xFFF1F5F9),
    primary: Color(0xFF465FFF),
    primaryHover: Color(0xFF374FE0),
    text: Color(0xFF0F172A),
    textMuted: Color(0xFF64748B),
    border: Color(0xFFE2E8F0),
    error: Color(0xFFDC2626),
    success: Color(0xFF10B981),
    warning: Color(0xFFD97706),
  );

  static const dark = IipColors(
    bg: Color(0xFF09090B),
    surface: Color(0xFF18181B),
    surfaceHover: Color(0xFF27272A),
    primary: Color(0xFF38BDF8),
    primaryHover: Color(0xFF0284C7),
    text: Color(0xFFF4F4F5),
    textMuted: Color(0xFFA1A1AA),
    border: Color(0xFF27272A),
    error: Color(0xFFF87171),
    success: Color(0xFF34D399),
    warning: Color(0xFFFBBF24),
  );

  factory IipColors.fromJson(Map<String, dynamic> json) {
    Color parse(String? hex, Color fallback) {
      if (hex == null || !hex.startsWith('#')) return fallback;
      final value = hex.replaceFirst('#', '');
      if (value.length == 6) {
        return Color(int.parse('FF$value', radix: 16));
      }
      return fallback;
    }

    final colors = json['colors'] as Map<String, dynamic>? ?? {};
    final base = json['mode'] == 'light' ? light : dark;
    return IipColors(
      bg: parse(colors['bg'] as String?, base.bg),
      surface: parse(colors['surface'] as String?, base.surface),
      surfaceHover: parse(colors['surfaceHover'] as String?, base.surfaceHover),
      primary: parse(colors['primary'] as String?, base.primary),
      primaryHover: parse(colors['primaryHover'] as String?, base.primaryHover),
      text: parse(colors['text'] as String?, base.text),
      textMuted: parse(colors['textMuted'] as String?, base.textMuted),
      border: parse(colors['border'] as String?, base.border),
      error: parse(colors['error'] as String?, base.error),
      success: parse(colors['success'] as String?, base.success),
      warning: parse(colors['warning'] as String?, base.warning),
    );
  }
}
