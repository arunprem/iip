import 'package:flutter/material.dart';
import 'package:graphview/graphview.dart';

import '../../models/knowledge_graph_models.dart';
import 'kg_graph_theme.dart';

/// Canvas edge renderer with relation labels (extends graphview ArrowEdgeRenderer).
class KgRelationEdgeRenderer extends ArrowEdgeRenderer {
  KgRelationEdgeRenderer({
    required this.theme,
    required this.edgeById,
    required this.focusNodeId,
    super.noArrow = false,
  });

  final KgGraphTheme theme;
  final Map<String, GraphEdge> edgeById;
  final String? focusNodeId;

  @override
  void renderEdge(Canvas canvas, Edge edge, Paint paint) {
    final meta = _meta(edge);
    final isRelative = meta?.linkKind == GraphLinkKind.relative;
    final dimmed = _isDimmed(edge);

    final stroke = Paint()
      ..color = (isRelative == true ? theme.relativeLinkColor : theme.linkColor)
          .withValues(alpha: dimmed ? 0.2 : 1)
      ..strokeWidth = isRelative == true ? 1.2 : 1.8
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    if (isRelative == true) {
      edge.destination.lineType = LineType.DashedLine;
    }

    super.renderEdge(canvas, edge, stroke);

    if (dimmed || meta == null) return;

    final src = getNodeCenter(edge.source);
    final dst = getNodeCenter(edge.destination);
    final mid = Offset((src.dx + dst.dx) / 2, (src.dy + dst.dy) / 2);
    final label = formatRelationRole(meta.role);
    _drawLabel(canvas, mid, label, isRelative == true);
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
    final focus = focusNodeId;
    if (focus == null) return false;
    return _nodeId(edge.source) != focus && _nodeId(edge.destination) != focus;
  }

  void _drawLabel(Canvas canvas, Offset pos, String text, bool isRelative) {
    final style = TextStyle(
      fontSize: isRelative ? 8 : 9,
      fontWeight: isRelative ? FontWeight.w600 : FontWeight.w700,
      color: isRelative ? theme.relativeLinkLabelText : theme.linkLabelText,
      fontFamily: 'monospace',
    );
    final tp = TextPainter(
      text: TextSpan(text: text, style: style),
      textDirection: TextDirection.ltr,
      maxLines: 1,
    )..layout(maxWidth: 110);

    const pad = 5.0;
    const h = 13.0;
    final rect = Rect.fromCenter(center: pos, width: tp.width + pad * 2, height: h);
    final rrect = RRect.fromRectAndRadius(rect, const Radius.circular(3));
    canvas.drawRRect(
      rrect,
      Paint()..color = isRelative ? theme.relativeLinkLabelBg : theme.linkLabelBg,
    );
    canvas.drawRRect(
      rrect,
      Paint()
        ..color = isRelative ? theme.relativeLinkLabelBorder : theme.linkLabelBorder
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
    tp.paint(canvas, Offset(rect.left + pad, rect.top + (h - tp.height) / 2));
  }
}
