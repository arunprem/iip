import 'package:flutter/material.dart';
import 'package:graphview/graphview.dart';

import '../../models/knowledge_graph_models.dart';
import 'kg_edge_render_state.dart';
import 'kg_graph_theme.dart';
import 'kg_relation_colors.dart';

/// Canvas edge renderer with relation labels and animated filter fade.
class KgRelationEdgeRenderer extends ArrowEdgeRenderer {
  KgRelationEdgeRenderer({
    required this.theme,
    required this.edgeById,
    required this.nodeById,
    required this.renderState,
    super.noArrow = false,
  });

  final KgGraphTheme theme;
  final Map<String, GraphEdge> edgeById;
  final Map<String, GraphNode> nodeById;
  final KgEdgeRenderState renderState;

  @override
  void renderEdge(Canvas canvas, Edge edge, Paint paint) {
    final meta = _meta(edge);
    if (meta == null) return;

    final src = nodeById[meta.source];
    final tgt = nodeById[meta.target];
    final alpha = renderState.alphaFor(meta.id, meta, src, tgt);
    if (alpha < 0.02) return;

    final isRelative = meta.linkKind == GraphLinkKind.relative;
    final passes = renderState.relationAllows(meta);
    final visuals = resolveLinkVisuals(
      role: meta.role,
      isRelative: isRelative,
      theme: theme,
      filtersActive: renderState.filtersActive(),
      passesFilter: passes,
      alpha: alpha,
    );
    final dimmed = _isDimmed(edge);
    final boosted = renderState.filtersActive() && passes && alpha > 0.65;
    final strokeW = (isRelative ? 1.4 : 2.2) * alpha * (boosted ? 1.55 : 1);

    if (boosted && alpha > 0.5) {
      final glow = Paint()
        ..color = visuals.glow.withValues(alpha: 0.45 * alpha)
        ..strokeWidth = strokeW + 6
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4);
      _drawLine(canvas, edge, glow);
    }

    final stroke = Paint()
      ..color = visuals.line.withValues(alpha: alpha * (dimmed ? 0.18 : 0.95))
      ..strokeWidth = strokeW
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    if (isRelative) {
      edge.destination.lineType = LineType.DashedLine;
    }

    super.renderEdge(canvas, edge, stroke);

    if (dimmed || alpha < 0.4) return;

    final srcCenter = getNodeCenter(edge.source);
    final dstCenter = getNodeCenter(edge.destination);
    final mid = Offset((srcCenter.dx + dstCenter.dx) / 2, (srcCenter.dy + dstCenter.dy) / 2);
    _drawLabel(
      canvas,
      mid,
      formatRelationRole(meta.role),
      alpha,
      boosted,
      visuals,
    );
  }

  void _drawLine(Canvas canvas, Edge edge, Paint paint) {
    final src = getNodeCenter(edge.source);
    final dst = getNodeCenter(edge.destination);
    canvas.drawLine(src, dst, paint);
  }

  GraphEdge? _meta(Edge edge) {
    if (edge.key is ValueKey) {
      final id = (edge.key as ValueKey).value;
      if (id is String) return edgeById[id];
    }
    return null;
  }

  String _nodeId(Node node) => (node.key as ValueKey).value as String;

  bool _isDimmed(Edge edge) {
    final focus = renderState.focusNodeId;
    if (focus == null) return false;
    return _nodeId(edge.source) != focus && _nodeId(edge.destination) != focus;
  }

  void _drawLabel(
    Canvas canvas,
    Offset pos,
    String text,
    double alpha,
    bool boosted,
    RelationLinkStyle visuals,
  ) {
    final style = TextStyle(
      fontSize: boosted ? 10 : 9,
      fontWeight: boosted ? FontWeight.w800 : FontWeight.w700,
      color: visuals.label.withValues(alpha: alpha),
      fontFamily: 'monospace',
    );
    final tp = TextPainter(
      text: TextSpan(text: text, style: style),
      textDirection: TextDirection.ltr,
      maxLines: 1,
    )..layout(maxWidth: 120);

    const pad = 6.0;
    const h = 15.0;
    final rect = Rect.fromCenter(center: pos, width: tp.width + pad * 2, height: h);
    final rrect = RRect.fromRectAndRadius(rect, const Radius.circular(4));

    if (boosted) {
      canvas.drawRRect(
        rrect,
        Paint()
          ..color = visuals.glow.withValues(alpha: 0.3 * alpha)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3),
      );
    }

    canvas.drawRRect(
      rrect,
      Paint()..color = visuals.labelBg.withValues(alpha: alpha),
    );
    canvas.drawRRect(
      rrect,
      Paint()
        ..color = visuals.labelBorder.withValues(alpha: alpha * (boosted ? 1 : 0.85))
        ..style = PaintingStyle.stroke
        ..strokeWidth = boosted ? 1.4 : 1,
    );
    tp.paint(canvas, Offset(rect.left + pad, rect.top + (h - tp.height) / 2));
  }
}
