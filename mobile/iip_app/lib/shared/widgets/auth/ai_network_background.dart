import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../../core/theme/iip_colors.dart';

/// Clustered person-style network graph for auth screens.
class AiNetworkBackground extends StatelessWidget {
  const AiNetworkBackground({
    super.key,
    required this.colors,
    required this.isDark,
    required this.child,
  });

  final IipColors colors;
  final bool isDark;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final veilTop = isDark ? colors.bg : Colors.white;

    return Stack(
      fit: StackFit.expand,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: isDark
                  ? [
                      const Color(0xFF030712),
                      colors.bg,
                      colors.bg,
                    ]
                  : [
                      const Color(0xFFDBEAFE),
                      const Color(0xFFEFF6FF),
                      colors.bg,
                    ],
            ),
          ),
        ),
        Positioned(
          top: -80,
          right: -60,
          child: _GlowBlob(
            color: colors.primary.withValues(alpha: isDark ? 0.16 : 0.12),
            size: 240,
          ),
        ),
        Positioned(
          bottom: -40,
          left: -30,
          child: _GlowBlob(
            color: const Color(0xFF22D3EE).withValues(alpha: isDark ? 0.12 : 0.09),
            size: 200,
          ),
        ),
        // Full-screen clustered network (top + behind sign-in button).
        Positioned.fill(
          child: RepaintBoundary(
            child: CustomPaint(
              isComplex: true,
              willChange: false,
              painter: _ClusterNetworkPainter(
              linkColor: isDark
                  ? colors.primary.withValues(alpha: 0.3)
                  : colors.primary.withValues(alpha: 0.24),
              bridgeColor: isDark
                  ? const Color(0xFF22D3EE).withValues(alpha: 0.22)
                  : const Color(0xFF0EA5E9).withValues(alpha: 0.18),
              nodeColor: isDark
                  ? const Color(0xFF38BDF8).withValues(alpha: 0.55)
                  : colors.primary.withValues(alpha: 0.42),
              hubColor: isDark
                  ? const Color(0xFF7DD3FC).withValues(alpha: 0.7)
                  : colors.primary.withValues(alpha: 0.55),
            ),
            child: const SizedBox.expand(),
            ),
          ),
        ),
        // Veil: strong only over form fields; lighter at bottom so mesh shows behind button.
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                stops: const [0.0, 0.2, 0.38, 0.52, 0.68, 1.0],
                colors: [
                  Colors.transparent,
                  veilTop.withValues(alpha: isDark ? 0.1 : 0.14),
                  veilTop.withValues(alpha: isDark ? 0.68 : 0.74),
                  veilTop.withValues(alpha: isDark ? 0.58 : 0.62),
                  veilTop.withValues(alpha: isDark ? 0.32 : 0.38),
                  veilTop.withValues(alpha: isDark ? 0.22 : 0.28),
                ],
              ),
            ),
          ),
        ),
        child,
      ],
    );
  }
}

class _GlowBlob extends StatelessWidget {
  const _GlowBlob({required this.color, required this.size});

  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(shape: BoxShape.circle, color: color),
    );
  }
}

class _GraphNode {
  _GraphNode({
    required this.position,
    required this.radius,
    required this.isHub,
    required this.clusterId,
  });

  final Offset position;
  final double radius;
  final bool isHub;
  final int clusterId;
}

class _GraphEdge {
  _GraphEdge(this.from, this.to, {this.isBridge = false});

  final int from;
  final int to;
  final bool isBridge;
}

/// Organic clustered network — hub nodes, dense groups, sparse bridges.
class _ClusterNetworkPainter extends CustomPainter {
  _ClusterNetworkPainter({
    required this.linkColor,
    required this.bridgeColor,
    required this.nodeColor,
    required this.hubColor,
  });

  final Color linkColor;
  final Color bridgeColor;
  final Color nodeColor;
  final Color hubColor;

  static final Map<int, _NetworkGraph> _graphBySizeKey = {};

  late final Paint _linkPaint = Paint()
    ..strokeWidth = 0.95
    ..style = PaintingStyle.stroke
    ..strokeCap = StrokeCap.round;
  late final Paint _bridgePaint = Paint()
    ..strokeWidth = 0.75
    ..style = PaintingStyle.stroke
    ..strokeCap = StrokeCap.round;
  late final Paint _nodeGlowPaint = Paint();
  late final Paint _nodePaint = Paint();
  late final Paint _hubGlowPaint = Paint();
  late final Paint _hubPaint = Paint();
  late final Paint _hubCorePaint = Paint()
    ..color = Colors.white.withValues(alpha: 0.85);

  static int _sizeKey(Size size) =>
      (size.width.round() << 16) | size.height.round();

  void _syncPaints() {
    _linkPaint.color = linkColor;
    _bridgePaint.color = bridgeColor;
    _nodePaint.color = nodeColor;
    _hubPaint.color = hubColor;
    _nodeGlowPaint.color = nodeColor.withValues(alpha: 0.15);
    _hubGlowPaint.color = hubColor.withValues(alpha: 0.18);
  }

  static const _clusterSeeds = <_ClusterSeed>[
    // Upper clusters (header / logo zone)
    _ClusterSeed(0.18, 0.26, 7, 0.13, 11),
    _ClusterSeed(0.78, 0.20, 6, 0.11, 23),
    _ClusterSeed(0.52, 0.40, 8, 0.13, 37),
    _ClusterSeed(0.32, 0.58, 5, 0.09, 51),
    _ClusterSeed(0.84, 0.52, 5, 0.09, 67),
    // Lower clusters (behind sign-in button & footer)
    _ClusterSeed(0.14, 0.78, 5, 0.08, 79),
    _ClusterSeed(0.50, 0.86, 6, 0.09, 91),
    _ClusterSeed(0.86, 0.80, 5, 0.08, 103),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    _syncPaints();
    final graph = _graphBySizeKey.putIfAbsent(_sizeKey(size), () => _buildGraph(size));

    for (final edge in graph.edges) {
      final a = graph.nodes[edge.from].position;
      final b = graph.nodes[edge.to].position;
      final paint = edge.isBridge ? _bridgePaint : _linkPaint;
      _drawCurvedEdge(canvas, a, b, paint, edge.isBridge);
    }

    for (final node in graph.nodes) {
      if (node.isHub) {
        canvas.drawCircle(node.position, node.radius + 5, _hubGlowPaint);
        canvas.drawCircle(node.position, node.radius, _hubPaint);
        canvas.drawCircle(node.position, node.radius * 0.45, _hubCorePaint);
      } else {
        canvas.drawCircle(node.position, node.radius + 3, _nodeGlowPaint);
        canvas.drawCircle(node.position, node.radius, _nodePaint);
      }
    }
  }

  void _drawCurvedEdge(Canvas canvas, Offset a, Offset b, Paint paint, bool longBridge) {
    final mid = Offset((a.dx + b.dx) / 2, (a.dy + b.dy) / 2);
    final dx = b.dx - a.dx;
    final dy = b.dy - a.dy;
    final len = math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    final nx = -dy / len;
    final ny = dx / len;
    final bendFactor = longBridge ? 0.14 : 0.1;
    final bend = len * bendFactor * (a.hashCode % 2 == 0 ? 1 : -1);
    final control = Offset(mid.dx + nx * bend, mid.dy + ny * bend);

    canvas.drawPath(
      Path()
        ..moveTo(a.dx, a.dy)
        ..quadraticBezierTo(control.dx, control.dy, b.dx, b.dy),
      paint,
    );
  }

  _NetworkGraph _buildGraph(Size size) {
    final nodes = <_GraphNode>[];
    final clusterStart = <int>[];
    final hubIndices = <int>[];

    for (var c = 0; c < _clusterSeeds.length; c++) {
      clusterStart.add(nodes.length);
      final seed = _clusterSeeds[c];
      final rng = math.Random(seed.randomSeed);
      final center = Offset(seed.nx * size.width, seed.ny * size.height);
      final spread = seed.spread * size.width;

      hubIndices.add(nodes.length);
      nodes.add(_GraphNode(
        position: center,
        radius: 4.2,
        isHub: true,
        clusterId: c,
      ));

      for (var i = 0; i < seed.satellites; i++) {
        final angle = (2 * math.pi * i / seed.satellites) + rng.nextDouble() * 0.5;
        final dist = spread * (0.38 + rng.nextDouble() * 0.5);
        nodes.add(_GraphNode(
          position: Offset(
            center.dx + math.cos(angle) * dist,
            center.dy + math.sin(angle) * dist,
          ),
          radius: 2.0 + rng.nextDouble() * 1.0,
          isHub: false,
          clusterId: c,
        ));
      }
    }

    final edges = <_GraphEdge>[];

    for (var c = 0; c < _clusterSeeds.length; c++) {
      final start = clusterStart[c];
      final hub = start;
      final count = 1 + _clusterSeeds[c].satellites;

      for (var i = 1; i < count; i++) {
        edges.add(_GraphEdge(hub, start + i));
        if (i < count - 1) {
          edges.add(_GraphEdge(start + i, start + i + 1));
        } else if (count > 2) {
          edges.add(_GraphEdge(start + i, start + 1));
        }
      }
    }

    for (var i = 0; i < hubIndices.length; i++) {
      final next = (i + 1) % hubIndices.length;
      edges.add(_GraphEdge(hubIndices[i], hubIndices[next], isBridge: true));
    }

    edges.add(_GraphEdge(hubIndices[0], hubIndices[2], isBridge: true));
    edges.add(_GraphEdge(hubIndices[1], hubIndices[4], isBridge: true));

    // Vertical bridges: upper mesh ↔ lower mesh (behind button area).
    if (hubIndices.length >= 8) {
      edges.add(_GraphEdge(hubIndices[2], hubIndices[6], isBridge: true));
      edges.add(_GraphEdge(hubIndices[3], hubIndices[5], isBridge: true));
      edges.add(_GraphEdge(hubIndices[4], hubIndices[7], isBridge: true));
      edges.add(_GraphEdge(hubIndices[5], hubIndices[6], isBridge: true));
      edges.add(_GraphEdge(hubIndices[6], hubIndices[7], isBridge: true));
    }

    final bridgePairs = <(int, int)>[
      if (clusterStart[0] + 2 < nodes.length) (clusterStart[0] + 2, hubIndices[2]),
      if (clusterStart[3] + 1 < nodes.length) (clusterStart[3] + 1, hubIndices[1]),
      if (hubIndices.length > 5) (hubIndices[5], hubIndices[2]),
      if (hubIndices.length > 6) (hubIndices[6], hubIndices[4]),
    ];
    for (final pair in bridgePairs) {
      edges.add(_GraphEdge(pair.$1, pair.$2, isBridge: true));
    }

    return _NetworkGraph(nodes, edges);
  }

  @override
  bool shouldRepaint(covariant _ClusterNetworkPainter oldDelegate) =>
      linkColor != oldDelegate.linkColor ||
      bridgeColor != oldDelegate.bridgeColor ||
      nodeColor != oldDelegate.nodeColor ||
      hubColor != oldDelegate.hubColor;
}

class _NetworkGraph {
  _NetworkGraph(this.nodes, this.edges);

  final List<_GraphNode> nodes;
  final List<_GraphEdge> edges;
}

class _ClusterSeed {
  const _ClusterSeed(this.nx, this.ny, this.satellites, this.spread, this.randomSeed);

  final double nx;
  final double ny;
  final int satellites;
  final double spread;
  final int randomSeed;
}
