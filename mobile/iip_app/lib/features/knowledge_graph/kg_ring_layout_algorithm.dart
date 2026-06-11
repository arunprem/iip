import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:graphview/graphview.dart';

/// Fixed ring layout (web `spreadNodesInitially`) — avoids force-layout stacking on star graphs.
class KgRingLayoutAlgorithm implements Algorithm {
  KgRingLayoutAlgorithm({
    required this.centerNodeId,
    required this.renderer,
  });

  final String? centerNodeId;

  @override
  EdgeRenderer? renderer;

  @override
  void init(Graph? graph) {}

  @override
  void setDimensions(double width, double height) {}

  @override
  Size run(Graph? graph, double shiftX, double shiftY) {
    if (graph == null || graph.nodes.isEmpty) return Size.zero;

    _resolveOverlaps(graph, pinnedId: centerNodeId);

    final bounds = graph.calculateGraphBounds();
    const layoutPad = 12.0;
    final dx = shiftX - bounds.left + layoutPad;
    final dy = shiftY - bounds.top + layoutPad;
    for (final node in graph.nodes) {
      node.position = Offset(node.position.dx + dx, node.position.dy + dy);
    }

    return Size(bounds.width + layoutPad * 2, bounds.height + layoutPad * 2);
  }

  void _resolveOverlaps(Graph graph, {required String? pinnedId}) {
    const iterations = 48;
    const pad = 12.0;

    for (var pass = 0; pass < iterations; pass++) {
      var moved = false;
      final nodes = graph.nodes;
      for (var i = 0; i < nodes.length; i++) {
        for (var j = i + 1; j < nodes.length; j++) {
          final a = nodes[i];
          final b = nodes[j];
          final ra = Rect.fromLTWH(a.x, a.y, a.width, a.height);
          final rb = Rect.fromLTWH(b.x, b.y, b.width, b.height);
          if (!ra.overlaps(rb)) continue;

          final ca = ra.center;
          final cb = rb.center;
          var delta = ca - cb;
          if (delta.distance < 0.5) {
            delta = Offset(math.cos(i * 0.7 + j), math.sin(i * 0.5 + j));
          }
          final dist = delta.distance;
          final overlapX = math.min(ra.right, rb.right) - math.max(ra.left, rb.left);
          final overlapY = math.min(ra.bottom, rb.bottom) - math.max(ra.top, rb.top);
          final overlap = math.max(overlapX, overlapY) + pad;
          final push = delta / dist * (overlap / 2);

          final aId = (a.key as ValueKey).value as String;
          final bId = (b.key as ValueKey).value as String;
          final aPinned = aId == pinnedId;
          final bPinned = bId == pinnedId;

          if (aPinned && bPinned) continue;

          if (aPinned) {
            b.position -= push * 2;
          } else if (bPinned) {
            a.position += push * 2;
          } else {
            a.position += push;
            b.position -= push;
          }
          moved = true;
        }
      }
      if (!moved) break;
    }
  }
}
