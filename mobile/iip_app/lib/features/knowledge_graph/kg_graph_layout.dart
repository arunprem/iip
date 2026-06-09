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

/// Minimum arc spacing between node centers on a ring.
double _ringSpacing(GraphNode node) {
  final r = kgNodeRadius(node);
  return r * 2 + kKgLabelClearance + 28;
}

double _ringRadiusForCount(List<GraphNode> nodes, {required double floor}) {
  if (nodes.isEmpty) return floor;
  if (nodes.length == 1) return floor;
  final spacing = nodes.map(_ringSpacing).reduce(math.max);
  final circumference = spacing * nodes.length;
  return math.max(floor, circumference / (2 * math.pi));
}

void spreadKgNodes(List<GraphNode> nodes) {
  final center = nodes.where((n) => n.isCenter).firstOrNull;
  final associates =
      nodes.where((n) => !n.isCenter && n.resolvedKind != GraphNodeKind.relative).toList();
  final relatives = nodes.where((n) => n.resolvedKind == GraphNodeKind.relative).toList();

  final centerReach = center != null ? _ringSpacing(center) : 120.0;
  final associateRing = _ringRadiusForCount(associates, floor: centerReach + 90);
  final relativeRing = associateRing +
      _ringRadiusForCount(relatives, floor: relatives.isEmpty ? 0 : 120);

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
