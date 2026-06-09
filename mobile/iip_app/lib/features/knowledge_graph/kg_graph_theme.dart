import 'package:flutter/material.dart';

class KgGraphTheme {
  const KgGraphTheme({
    required this.isDark,
    required this.centerRing,
    required this.associateRing,
    required this.relativeRing,
    required this.centerGlow,
    required this.associateGlow,
    required this.relativeGlow,
    required this.labelBg,
    required this.centerLabel,
    required this.associateLabel,
    required this.relativeLabel,
    required this.linkLabelBg,
    required this.linkLabelBorder,
    required this.linkLabelText,
    required this.relativeLinkLabelBg,
    required this.relativeLinkLabelBorder,
    required this.relativeLinkLabelText,
    required this.linkColor,
    required this.linkArrow,
    required this.relativeLinkColor,
    required this.relativeLinkArrow,
    required this.canvasBg,
    required this.gridColor,
  });

  final bool isDark;
  final Color centerRing;
  final Color associateRing;
  final Color relativeRing;
  final Color centerGlow;
  final Color associateGlow;
  final Color relativeGlow;
  final Color labelBg;
  final Color centerLabel;
  final Color associateLabel;
  final Color relativeLabel;
  final Color linkLabelBg;
  final Color linkLabelBorder;
  final Color linkLabelText;
  final Color relativeLinkLabelBg;
  final Color relativeLinkLabelBorder;
  final Color relativeLinkLabelText;
  final Color linkColor;
  final Color linkArrow;
  final Color relativeLinkColor;
  final Color relativeLinkArrow;
  final Color canvasBg;
  final Color gridColor;

  factory KgGraphTheme.forBrightness(Brightness brightness) {
    if (brightness == Brightness.dark) {
      return const KgGraphTheme(
        isDark: true,
        centerRing: Color(0xFFFBBF24),
        associateRing: Color(0xFF22D3EE),
        relativeRing: Color(0xFF94A3B8),
        centerGlow: Color(0xE6FBBF24),
        associateGlow: Color(0xD922D3EE),
        relativeGlow: Color(0x5994A3B8),
        labelBg: Color(0xD1020817),
        centerLabel: Color(0xFFFDE68A),
        associateLabel: Color(0xFFA5F3FC),
        relativeLabel: Color(0xFFCBD5E1),
        linkLabelBg: Color(0xEB020817),
        linkLabelBorder: Color(0xBF22D3EE),
        linkLabelText: Color(0xFF67E8F9),
        relativeLinkLabelBg: Color(0xE015233B),
        relativeLinkLabelBorder: Color(0x8094A3B8),
        relativeLinkLabelText: Color(0xFF94A3B8),
        linkColor: Color(0x7322D3EE),
        linkArrow: Color(0xE667E8F9),
        relativeLinkColor: Color(0x5994A3B8),
        relativeLinkArrow: Color(0xA694A3B8),
        canvasBg: Color(0xFF020617),
        gridColor: Color(0x1A22D3EE),
      );
    }
    return const KgGraphTheme(
      isDark: false,
      centerRing: Color(0xFFD97706),
      associateRing: Color(0xFF0284C7),
      relativeRing: Color(0xFF94A3B8),
      centerGlow: Color(0x59D97706),
      associateGlow: Color(0x4D0284C7),
      relativeGlow: Color(0x4094A3B8),
      labelBg: Color(0xF0FFFFFF),
      centerLabel: Color(0xFF92400E),
      associateLabel: Color(0xFF0C4A6E),
      relativeLabel: Color(0xFF475569),
      linkLabelBg: Color(0xF5FFFFFF),
      linkLabelBorder: Color(0x730284C7),
      linkLabelText: Color(0xFF0369A1),
      relativeLinkLabelBg: Color(0xF5F8FAFC),
      relativeLinkLabelBorder: Color(0x8C94A3B8),
      relativeLinkLabelText: Color(0xFF64748B),
      linkColor: Color(0x590284C7),
      linkArrow: Color(0xD90369A1),
      relativeLinkColor: Color(0x7394A3B8),
      relativeLinkArrow: Color(0xBF64748B),
      canvasBg: Color(0xFFF1F5F9),
      gridColor: Color(0x1A0284C7),
    );
  }
}

enum KgNormalizedGender { male, female, unknown }

KgNormalizedGender normalizeKgGender(String? gender) {
  final raw = (gender ?? '').trim().toLowerCase();
  if (raw.contains('female') || raw == 'f' || raw == 'woman') {
    return KgNormalizedGender.female;
  }
  if (raw.contains('male') || raw == 'm' || raw == 'man') {
    return KgNormalizedGender.male;
  }
  return KgNormalizedGender.unknown;
}
