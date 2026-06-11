import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../../models/knowledge_graph_models.dart';
import 'kg_graph_layout.dart';
import 'kg_graph_theme.dart';

/// GPU-friendly node rendered as widgets (not canvas) for smooth pan/zoom.
class KgNodeWidget extends StatelessWidget {
  const KgNodeWidget({
    super.key,
    required this.node,
    required this.theme,
    required this.photo,
    this.opacity = 1,
    required this.focused,
    required this.onTap,
    required this.onDoubleTap,
  });

  final GraphNode node;
  final KgGraphTheme theme;
  final ui.Image? photo;
  final double opacity;
  final bool focused;
  final VoidCallback onTap;
  final VoidCallback onDoubleTap;

  @override
  Widget build(BuildContext context) {
    final kind = node.resolvedKind;
    final r = kgNodeRadius(node);
    final ring = kind == GraphNodeKind.center
        ? theme.centerRing
        : kind == GraphNodeKind.relative
            ? theme.relativeRing
            : theme.associateRing;
    final labelColor = kind == GraphNodeKind.center
        ? theme.centerLabel
        : kind == GraphNodeKind.relative
            ? theme.relativeLabel
            : theme.associateLabel;
    final isRelative = kind == GraphNodeKind.relative;
    final label = node.label.length > 18 ? '${node.label.substring(0, 16)}…' : node.label;
    final size = (r + (isRelative ? 3 : 5)) * 2 + 4;

    return GestureDetector(
      onTap: onTap,
      onDoubleTap: onDoubleTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 420),
        curve: Curves.easeInOutCubic,
        opacity: opacity.clamp(0.0, 1.0),
        child: SizedBox(
          width: size,
          height: size + 28,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AnimatedScale(
                duration: const Duration(milliseconds: 220),
                curve: Curves.easeOutCubic,
                scale: focused ? 1.08 : 1,
                child: Container(
                  width: size,
                  height: size,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    boxShadow: focused
                        ? [
                            BoxShadow(
                              color: ring.withValues(alpha: 0.55),
                              blurRadius: 14,
                              spreadRadius: 2,
                            ),
                          ]
                        : null,
                  ),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: ring,
                        width: isRelative ? 1.5 : 2.5,
                        strokeAlign: BorderSide.strokeAlignOutside,
                      ),
                    ),
                    child: ClipOval(
                      child: _Avatar(
                        photo: photo,
                        gender: node.gender,
                        muted: isRelative,
                        radius: r,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 6),
              DecoratedBox(
                decoration: BoxDecoration(
                  color: theme.labelBg,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: isRelative ? 10 : 11,
                      fontWeight: isRelative ? FontWeight.w500 : FontWeight.w600,
                      color: labelColor,
                      fontFamily: 'monospace',
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({
    required this.photo,
    required this.gender,
    required this.muted,
    required this.radius,
  });

  final ui.Image? photo;
  final String? gender;
  final bool muted;
  final double radius;

  @override
  Widget build(BuildContext context) {
    if (!muted && photo != null) {
      return RawImage(
        image: photo,
        fit: BoxFit.cover,
        width: radius * 2,
        height: radius * 2,
        filterQuality: FilterQuality.medium,
      );
    }
    return CustomPaint(
      size: Size(radius * 2, radius * 2),
      painter: _GenderPlaceholderPainter(gender: gender, muted: muted),
    );
  }
}

class _GenderPlaceholderPainter extends CustomPainter {
  _GenderPlaceholderPainter({required this.gender, required this.muted});

  final String? gender;
  final bool muted;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final r = size.width / 2;
    final g = normalizeKgGender(gender);
    final stops = _colors(g, muted);
    final rect = Rect.fromCircle(center: center, radius: r);
    canvas.drawCircle(
      center,
      r,
      Paint()
        ..shader = RadialGradient(colors: stops, stops: const [0.1, 1]).createShader(rect),
    );
    final figure = Paint()..color = Colors.white.withValues(alpha: muted ? 0.85 : 0.92);
    canvas.drawCircle(Offset(center.dx, center.dy - r * 0.22), r * 0.3, figure);
    final body = Path()
      ..moveTo(center.dx - r * 0.55, center.dy + r * 0.95)
      ..quadraticBezierTo(center.dx, center.dy + r * 0.35, center.dx + r * 0.55, center.dy + r * 0.95)
      ..lineTo(center.dx + r * 0.55, center.dy + r)
      ..lineTo(center.dx - r * 0.55, center.dy + r)
      ..close();
    canvas.drawPath(body, figure);
  }

  List<Color> _colors(KgNormalizedGender g, bool muted) {
    if (muted) {
      return switch (g) {
        KgNormalizedGender.female => [const Color(0xFFE9D5FF), const Color(0xFF6B7280)],
        KgNormalizedGender.male => [const Color(0xFFCBD5E1), const Color(0xFF64748B)],
        KgNormalizedGender.unknown => [const Color(0xFFE2E8F0), const Color(0xFF94A3B8)],
      };
    }
    return switch (g) {
      KgNormalizedGender.female => [const Color(0xFFF472B6), const Color(0xFF831843)],
      KgNormalizedGender.male => [const Color(0xFF60A5FA), const Color(0xFF1E3A8A)],
      KgNormalizedGender.unknown => [const Color(0xFF22D3EE), const Color(0xFF0E7490)],
    };
  }

  @override
  bool shouldRepaint(covariant _GenderPlaceholderPainter oldDelegate) =>
      oldDelegate.gender != gender || oldDelegate.muted != muted;
}
