import 'package:flutter/material.dart';

import 'kg_graph_theme.dart';

class RelationLinkStyle {
  const RelationLinkStyle({
    required this.line,
    required this.arrow,
    required this.label,
    required this.labelBorder,
    required this.labelBg,
    required this.glow,
  });

  final Color line;
  final Color arrow;
  final Color label;
  final Color labelBorder;
  final Color labelBg;
  final Color glow;
}

String normalizeRelationRole(String role) {
  return role.trim().toUpperCase().replaceAll(RegExp(r'\s+'), '_');
}

RelationLinkStyle _styleDark(String role) {
  const map = <String, RelationLinkStyle>{
    'ACCOMPLICE': RelationLinkStyle(
      line: Color(0xD1EF4444),
      arrow: Color(0xFAFCA5A5),
      label: Color(0xFFFECACA),
      labelBorder: Color(0xD9EF4444),
      labelBg: Color(0xEB450A0A),
      glow: Color(0x8CEF4444),
    ),
    'CONTACT': RelationLinkStyle(
      line: Color(0xD1F97316),
      arrow: Color(0xFAFDBA74),
      label: Color(0xFFFED7AA),
      labelBorder: Color(0xD9F97316),
      labelBg: Color(0xEB431407),
      glow: Color(0x8CF97316),
    ),
    'HANDLER': RelationLinkStyle(
      line: Color(0xD1A855F7),
      arrow: Color(0xFAD8B4FE),
      label: Color(0xFFE9D5FF),
      labelBorder: Color(0xD9A855F7),
      labelBg: Color(0xEB3B0764),
      glow: Color(0x8CA855F7),
    ),
    'FINANCIER': RelationLinkStyle(
      line: Color(0xD110B981),
      arrow: Color(0xFA6EE7B7),
      label: Color(0xFFA7F3D0),
      labelBorder: Color(0xD910B981),
      labelBg: Color(0xEB064E3B),
      glow: Color(0x8C10B981),
    ),
    'FRIEND': RelationLinkStyle(
      line: Color(0xD1F43F5E),
      arrow: Color(0xFAFDA4AF),
      label: Color(0xFFFECDD3),
      labelBorder: Color(0xD9F43F5E),
      labelBg: Color(0xEB4C0519),
      glow: Color(0x8CF43F5E),
    ),
  };
  return map[normalizeRelationRole(role)] ?? map['CONTACT']!;
}

RelationLinkStyle _styleLight(String role) {
  const map = <String, RelationLinkStyle>{
    'ACCOMPLICE': RelationLinkStyle(
      line: Color(0xC7DC2626),
      arrow: Color(0xF2B91C1C),
      label: Color(0xFF991B1B),
      labelBorder: Color(0xA6DC2626),
      labelBg: Color(0xF5FEF2F2),
      glow: Color(0x59DC2626),
    ),
    'CONTACT': RelationLinkStyle(
      line: Color(0xC7EA580C),
      arrow: Color(0xF2C2410C),
      label: Color(0xFF9A3412),
      labelBorder: Color(0xA6EA580C),
      labelBg: Color(0xF5FFF7ED),
      glow: Color(0x59EA580C),
    ),
    'HANDLER': RelationLinkStyle(
      line: Color(0xC79333EA),
      arrow: Color(0xF27E22CE),
      label: Color(0xFF6B21A8),
      labelBorder: Color(0xA69333EA),
      labelBg: Color(0xF5FAF5FF),
      glow: Color(0x599333EA),
    ),
    'FINANCIER': RelationLinkStyle(
      line: Color(0xC7059669),
      arrow: Color(0xF2047857),
      label: Color(0xFF065F46),
      labelBorder: Color(0xA6059669),
      labelBg: Color(0xF5ECFDF5),
      glow: Color(0x59059669),
    ),
    'FRIEND': RelationLinkStyle(
      line: Color(0xC7E11D48),
      arrow: Color(0xF2BE123C),
      label: Color(0xFF9F1239),
      labelBorder: Color(0xA6E11D48),
      labelBg: Color(0xF5FFF1F2),
      glow: Color(0x59E11D48),
    ),
  };
  return map[normalizeRelationRole(role)] ?? map['CONTACT']!;
}

RelationLinkStyle getRelationLinkStyle(String role, bool isDark) {
  return isDark ? _styleDark(role) : _styleLight(role);
}

RelationLinkStyle resolveLinkVisuals({
  required String role,
  required bool isRelative,
  required KgGraphTheme theme,
  required bool filtersActive,
  required bool passesFilter,
  required double alpha,
}) {
  if (filtersActive && passesFilter && alpha > 0.08) {
    return getRelationLinkStyle(role, theme.isDark);
  }
  if (isRelative) {
    return RelationLinkStyle(
      line: theme.relativeLinkColor,
      arrow: theme.relativeLinkArrow,
      label: theme.relativeLinkLabelText,
      labelBorder: theme.relativeLinkLabelBorder,
      labelBg: theme.relativeLinkLabelBg,
      glow: theme.relativeGlow,
    );
  }
  return RelationLinkStyle(
    line: theme.linkColor,
    arrow: theme.linkArrow,
    label: theme.linkLabelText,
    labelBorder: theme.linkLabelBorder,
    labelBg: theme.linkLabelBg,
    glow: theme.associateGlow,
  );
}

Color relationChipColor(String role, bool isDark) {
  return getRelationLinkStyle(role, isDark).line;
}
