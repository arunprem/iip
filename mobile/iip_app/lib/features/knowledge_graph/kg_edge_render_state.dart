import '../../models/knowledge_graph_models.dart';

/// Mutable edge visibility/alpha state — updated without rebuilding the graph layout.
class KgEdgeRenderState {
  Set<String> relationFilters = {};
  bool showAssociates = true;
  bool showRelatives = true;
  String? focusNodeId;
  final Map<String, double> alphas = {};

  bool layerAllows(GraphEdge edge, GraphNode? src, GraphNode? tgt) {
    bool layerOk(GraphNode n) {
      if (n.isCenter) return true;
      if (n.resolvedKind == GraphNodeKind.relative) return showRelatives;
      return showAssociates;
    }

    if (src == null || tgt == null) return false;
    if (edge.linkKind == GraphLinkKind.relative && !showRelatives) return false;
    if (edge.linkKind != GraphLinkKind.relative && !showAssociates) return false;
    return layerOk(src) && layerOk(tgt);
  }

  bool relationAllows(GraphEdge edge) {
    if (relationFilters.isEmpty) return true;
    return relationFilters.contains(relationStatKey(edge));
  }

  bool filtersActive() => relationFilters.isNotEmpty;

  bool shouldShow(GraphEdge edge, GraphNode? src, GraphNode? tgt) {
    return layerAllows(edge, src, tgt) && relationAllows(edge);
  }

  /// Default 1.0 so edges animate out instead of snapping hidden.
  double alphaFor(String edgeId, GraphEdge edge, GraphNode? src, GraphNode? tgt) {
    if (!layerAllows(edge, src, tgt)) return 0;
    if (alphas.containsKey(edgeId)) return alphas[edgeId]!;
    return 1.0;
  }

  double nodeAlphaFor(
    String nodeId,
    GraphNode node,
    Iterable<GraphEdge> edges,
    Map<String, GraphNode> nodeById,
  ) {
    if (node.isCenter) return 1.0;
    if (!filtersActive()) return 1.0;
    final hasVisible = edges.any((e) {
      if (e.source != nodeId && e.target != nodeId) return false;
      return alphaFor(
            e.id,
            e,
            nodeById[e.source],
            nodeById[e.target],
          ) >
          0.25;
    });
    return hasVisible ? 1.0 : 0.2;
  }
}
