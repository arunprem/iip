import 'dart:math' as math;

import '../../models/knowledge_graph_models.dart';

const double kKgNodeRCenter = 30;
const double kKgNodeRAssociate = 24;
const double kKgNodeRRelative = 18;
const double kKgLabelClearance = 34;

double kgNodeRadius(GraphNode node) {
  final kind = node.resolvedKind;
  if (kind == GraphNodeKind.center) return kKgNodeRCenter;
  if (kind == GraphNodeKind.relative) return kKgNodeRRelative;
  return kKgNodeRAssociate;
}

double kgNodeFitExtent(GraphNode node) => kgNodeRadius(node) + kKgLabelClearance + 16;

void spreadKgNodes(List<GraphNode> nodes) {
  final center = nodes.where((n) => n.isCenter).firstOrNull;
  final associates =
      nodes.where((n) => !n.isCenter && n.resolvedKind != GraphNodeKind.relative).toList();
  final relatives = nodes.where((n) => n.resolvedKind == GraphNodeKind.relative).toList();

  // Match web `spreadNodesInitially` — compact rings so fit-to-view zooms in further.
  final associateRing = math.max(120.0, associates.length * 56.0);
  final relativeRing =
      associateRing + (relatives.isEmpty ? 0.0 : math.max(85.0, relatives.length * 44.0));

  if (center != null) {
    center.x = 0;
    center.y = 0;
  }

  for (var i = 0; i < associates.length; i++) {
    final angle =
        (2 * math.pi * i) / (associates.isEmpty ? 1 : associates.length) - math.pi / 2;
    associates[i].x = math.cos(angle) * associateRing;
    associates[i].y = math.sin(angle) * associateRing;
  }

  for (var i = 0; i < relatives.length; i++) {
    final offset = relatives.length > 1 ? math.pi / relatives.length : 0.0;
    final angle =
        (2 * math.pi * i) / (relatives.isEmpty ? 1 : relatives.length) - math.pi / 2 + offset;
    relatives[i].x = math.cos(angle) * relativeRing;
    relatives[i].y = math.sin(angle) * relativeRing;
  }
}
