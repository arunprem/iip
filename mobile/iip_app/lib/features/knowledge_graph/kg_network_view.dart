import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:graphview/graphview.dart';

import '../../core/storage/suspect_photo_cache.dart';
import '../../models/knowledge_graph_models.dart';
import '../suspects/suspect_repository.dart';
import 'kg_graph_layout.dart';
import 'kg_graph_theme.dart';
import 'kg_node_widget.dart';
import 'kg_relation_edge_renderer.dart';
import 'kg_ring_layout_algorithm.dart';
import 'kg_visible_graph.dart';

/// Force-directed network canvas powered by [graphview] (InteractiveViewer.builder).
class KgNetworkView extends StatefulWidget {
  const KgNetworkView({
    super.key,
    required this.graph,
    required this.theme,
    required this.repo,
    required this.showAssociates,
    required this.showRelatives,
    required this.relationFilters,
    required this.focusNodeId,
    required this.onNodeTap,
    required this.onNodeDoubleTap,
    required this.fitRequestToken,
  });

  final NetworkGraphResponse graph;
  final KgGraphTheme theme;
  final SuspectRepository repo;
  final bool showAssociates;
  final bool showRelatives;
  final Set<String> relationFilters;
  final String? focusNodeId;
  final ValueChanged<GraphNode> onNodeTap;
  final ValueChanged<GraphNode> onNodeDoubleTap;
  final int fitRequestToken;

  @override
  State<KgNetworkView> createState() => _KgNetworkViewState();
}

class _KgNetworkViewState extends State<KgNetworkView> {
  static const _doubleTapMs = 420;

  final _gvController = GraphViewController();
  final _photos = ValueNotifier<Map<String, ui.Image>>({});
  final _nodeById = <String, GraphNode>{};
  final _edgeById = <String, GraphEdge>{};
  final _lastTap = <String, DateTime>{};

  late Graph _graph;
  late KgRingLayoutAlgorithm _algorithm;
  String? _centerNodeId;
  int _lastFitToken = 0;
  int _graphRevision = 0;

  @override
  void initState() {
    super.initState();
    _rebuildGraph();
    _algorithm = _createAlgorithm();
    _loadPhotos();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _gvController.zoomToFit();
    });
  }

  @override
  void didUpdateWidget(KgNetworkView oldWidget) {
    super.didUpdateWidget(oldWidget);
    final graphChanged = oldWidget.graph != widget.graph;
    final viewChanged = oldWidget.showAssociates != widget.showAssociates ||
        oldWidget.showRelatives != widget.showRelatives ||
        !setEquals(oldWidget.relationFilters, widget.relationFilters) ||
        oldWidget.focusNodeId != widget.focusNodeId ||
        oldWidget.theme.isDark != widget.theme.isDark;

    if (graphChanged) {
      _rebuildGraph();
      _algorithm = _createAlgorithm();
      _loadPhotos();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _gvController.zoomToFit();
      });
    } else if (viewChanged) {
      _rebuildGraph();
      _algorithm = _createAlgorithm();
      _gvController.forceRecalculation();
    }

    if (widget.fitRequestToken != _lastFitToken) {
      _lastFitToken = widget.fitRequestToken;
      _gvController.zoomToFit();
    }
  }

  KgRingLayoutAlgorithm _createAlgorithm() {
    return KgRingLayoutAlgorithm(
      centerNodeId: _centerNodeId,
      renderer: KgRelationEdgeRenderer(
        theme: widget.theme,
        edgeById: _edgeById,
        focusNodeId: widget.focusNodeId,
      ),
    );
  }

  void _rebuildGraph() {
    _graphRevision++;
    _nodeById.clear();
    _edgeById.clear();

    final visible = KgVisibleGraph.fromResponse(
      response: widget.graph,
      showAssociates: widget.showAssociates,
      showRelatives: widget.showRelatives,
      relationFilters: widget.relationFilters,
    );

    final layoutNodes = visible.nodes
        .map(
          (n) => GraphNode(
            id: n.id,
            label: n.label,
            isCenter: n.isCenter,
            nodeKind: n.nodeKind,
            gender: n.gender,
            criminalName: n.criminalName,
            photoId: n.photoId,
            dossierDraftId: n.dossierDraftId,
            storageKey: n.storageKey,
          ),
        )
        .toList();
    spreadKgNodes(layoutNodes);
    final layoutById = {for (final n in layoutNodes) n.id: n};
    _centerNodeId = layoutNodes.where((n) => n.isCenter).map((n) => n.id).firstOrNull;

    final g = Graph();
    for (final data in layoutNodes) {
      _nodeById[data.id] = data;
      final node = Node.Id(data.id);
      final size = _nodeSize(data);
      node.size = size;
      final laid = layoutById[data.id];
      if (laid != null) {
        // graphview positions are top-left; spreadKgNodes uses center coordinates.
        node.position = Offset(
          laid.x - size.width / 2,
          laid.y - size.height / 2,
        );
      }
      if (data.resolvedKind == GraphNodeKind.relative) {
        node.lineType = LineType.DashedLine;
      }
      g.addNode(node);
    }

    for (final edge in visible.edges) {
      _edgeById[edge.id] = edge;
      final src = g.getNodeUsingId(edge.source);
      final dst = g.getNodeUsingId(edge.target);
      final isRelative = edge.linkKind == GraphLinkKind.relative;
      g.addEdge(
        src,
        dst,
        paint: Paint()
          ..color = isRelative ? widget.theme.relativeLinkColor : widget.theme.linkColor
          ..strokeWidth = isRelative ? 1.2 : 1.8
          ..style = PaintingStyle.stroke,
      );
      final added = g.getEdgeBetween(src, dst);
      if (added != null) {
        added.key = ValueKey(edge.id);
      }
    }

    _graph = g;
    setState(() {});
  }

  Size _nodeSize(GraphNode node) {
    final r = kgNodeRadius(node);
    final ringPad = node.resolvedKind == GraphNodeKind.relative ? 3.0 : 5.0;
    final w = (r + ringPad) * 2 + 4;
    return Size(w, w + 28);
  }

  Future<void> _loadPhotos() async {
    final keys = <String>{};
    for (final node in _nodeById.values) {
      final key = node.storageKey;
      if (key == null || key.isEmpty || node.resolvedKind == GraphNodeKind.relative) continue;
      keys.add(key);
    }
    if (keys.isEmpty) return;

    final loaded = SuspectPhotoCache.snapshotThumbnails(keys);
    if (loaded.isNotEmpty && mounted) {
      _photos.value = loaded;
    }

    await Future.wait(keys.map((key) async {
      if (loaded.containsKey(key)) return;
      final image = await widget.repo.fetchPhotoThumbnail(key);
      if (!mounted || image == null) return;
      loaded[key] = image;
    }));
    if (mounted) _photos.value = Map<String, ui.Image>.from(loaded);
  }

  bool _isConnectedToFocus(String nodeId) {
    final focus = widget.focusNodeId;
    if (focus == null) return true;
    if (focus == nodeId) return true;
    return widget.graph.edges.any(
      (e) =>
          (e.source == focus && e.target == nodeId) ||
          (e.target == focus && e.source == nodeId),
    );
  }

  void _handleNodeTap(GraphNode data) {
    final now = DateTime.now();
    final prev = _lastTap[data.id];
    _lastTap[data.id] = now;

    if (prev != null &&
        now.difference(prev).inMilliseconds < _doubleTapMs &&
        data.resolvedKind != GraphNodeKind.relative) {
      widget.onNodeDoubleTap(data);
      return;
    }
    widget.onNodeTap(data);
  }

  @override
  void dispose() {
    _photos.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_graph.nodeCount() == 0) {
      return Center(
        child: Text(
          'No links to display for current filters.',
          style: TextStyle(color: widget.theme.isDark ? Colors.white70 : Colors.black54),
        ),
      );
    }

    return DecoratedBox(
      decoration: BoxDecoration(color: widget.theme.canvasBg),
      child: GraphView.builder(
        key: ValueKey('gv-$_graphRevision'),
        graph: _graph,
        algorithm: _algorithm,
        controller: _gvController,
        animated: false,
        autoZoomToFit: true,
        centerGraph: true,
        panAnimationDuration: const Duration(milliseconds: 380),
        toggleAnimationDuration: const Duration(milliseconds: 320),
        paint: Paint()
          ..color = widget.theme.linkColor
          ..strokeWidth = 1.8
          ..style = PaintingStyle.stroke,
        builder: (node) {
          final id = (node.key as ValueKey).value as String;
          final data = _nodeById[id];
          if (data == null) return const SizedBox.shrink();

          final focused = widget.focusNodeId == id;
          final dimmed =
              widget.focusNodeId != null && !focused && !_isConnectedToFocus(id);
          final storageKey = data.storageKey ?? '';

          return ValueListenableBuilder<Map<String, ui.Image>>(
            valueListenable: _photos,
            builder: (_, photos, __) {
              return KgNodeWidget(
                node: data,
                theme: widget.theme,
                photo: photos[storageKey],
                dimmed: dimmed,
                focused: focused,
                onTap: () => _handleNodeTap(data),
                onDoubleTap: () => widget.onNodeDoubleTap(data),
              );
            },
          );
        },
      ),
    );
  }
}
