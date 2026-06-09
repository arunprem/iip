import '../../models/knowledge_graph_models.dart';

/// Filters nodes/edges for display (parity with web AssociateNetworkGraph).
class KgVisibleGraph {
  KgVisibleGraph({required this.nodes, required this.edges});

  final List<GraphNode> nodes;
  final List<GraphEdge> edges;

  static KgVisibleGraph fromResponse({
    required NetworkGraphResponse response,
    required bool showAssociates,
    required bool showRelatives,
    required Set<String> relationFilters,
  }) {
    bool layerOk(GraphNode n) {
      if (n.isCenter) return true;
      if (n.resolvedKind == GraphNodeKind.relative) return showRelatives;
      return showAssociates;
    }

    var links = response.edges.where((e) {
      if (e.linkKind == GraphLinkKind.relative && !showRelatives) return false;
      if (e.linkKind != GraphLinkKind.relative && !showAssociates) return false;
      if (relationFilters.isNotEmpty && !relationFilters.contains(relationStatKey(e))) {
        return false;
      }
      return true;
    }).toList();

    final nodeById = {for (final n in response.nodes) n.id: n};
    links = links.where((e) {
      final src = nodeById[e.source];
      final tgt = nodeById[e.target];
      if (src == null || tgt == null) return false;
      return layerOk(src) && layerOk(tgt);
    }).toList();

    final connected = <String>{};
    for (final link in links) {
      connected.add(link.source);
      connected.add(link.target);
    }

    final nodes = response.nodes.where((n) {
      if (n.isCenter) return true;
      if (!connected.contains(n.id)) return false;
      return layerOk(n);
    }).toList();

    final visibleIds = nodes.map((n) => n.id).toSet();
    final edges = links
        .where((e) => visibleIds.contains(e.source) && visibleIds.contains(e.target))
        .toList();

    return KgVisibleGraph(nodes: nodes, edges: edges);
  }
}
