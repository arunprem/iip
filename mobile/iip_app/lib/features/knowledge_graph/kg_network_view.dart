import 'dart:math' as math;
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
import 'kg_edge_render_state.dart';
import 'kg_ring_layout_algorithm.dart';

/// Network canvas — relation filters fade edges in/out without relayout.
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

class _KgNetworkViewState extends State<KgNetworkView> with TickerProviderStateMixin {
  static const _doubleTapMs = 420;
  static const _edgeFadeMs = 420;
  static const _zoomFitMs = 480;

  late final TransformationController _transformController;
  late final GraphViewController _gvController;
  final _photos = ValueNotifier<Map<String, ui.Image>>({});
  final _nodeById = <String, GraphNode>{};
  final _edgeById = <String, GraphEdge>{};
  final _lastTap = <String, DateTime>{};
  final _edgeState = KgEdgeRenderState();
  final _pinnedPositions = <String, Offset>{};

  late Graph _graph;
  late KgRingLayoutAlgorithm _algorithm;
  String? _centerNodeId;
  int _lastFitToken = 0;
  int _graphRevision = 0;
  Size? _viewportSize;
  late final AnimationController _edgeFadeController;
  AnimationController? _zoomController;
  final Map<String, double> _fadeTargets = {};
  final Map<String, double> _fadeStarts = {};

  @override
  void initState() {
    super.initState();
    _transformController = TransformationController();
    _gvController = GraphViewController(transformationController: _transformController);
    _edgeFadeController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: _edgeFadeMs),
    )..addListener(_onEdgeFadeTick);
    _rebuildGraph();
    _algorithm = _createAlgorithm();
    _loadPhotos();
    _scheduleFitToView();
  }

  void _onEdgeFadeTick() {
    if (!mounted) return;
    final t = Curves.easeInOutCubic.transform(_edgeFadeController.value);
    for (final entry in _fadeTargets.entries) {
      final start = _fadeStarts[entry.key] ?? 1.0;
      _edgeState.alphas[entry.key] = start + (entry.value - start) * t;
    }
    setState(() {});
  }

  @override
  void didUpdateWidget(KgNetworkView oldWidget) {
    super.didUpdateWidget(oldWidget);
    final graphChanged = oldWidget.graph != widget.graph;
    final layerChanged = oldWidget.showAssociates != widget.showAssociates ||
        oldWidget.showRelatives != widget.showRelatives;
    final relationChanged = !setEquals(oldWidget.relationFilters, widget.relationFilters);
    final focusChanged = oldWidget.focusNodeId != widget.focusNodeId;
    final themeChanged = oldWidget.theme.isDark != widget.theme.isDark;

    if (graphChanged) {
      _pinnedPositions.clear();
      _edgeState.alphas.clear();
      _rebuildGraph();
      _algorithm = _createAlgorithm();
      _loadPhotos();
      _scheduleFitToView();
    } else if (layerChanged) {
      _rebuildGraph(preserveLayout: true);
      _algorithm = _createAlgorithm();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _animateEdgeAlphas();
      });
    } else if (relationChanged) {
      _syncEdgeState();
      _algorithm = _createAlgorithm();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _animateEdgeAlphas(fitAfter: true);
      });
    } else if (focusChanged || themeChanged) {
      _syncEdgeState();
      _algorithm = _createAlgorithm();
      setState(() {});
    }

    if (widget.fitRequestToken != _lastFitToken) {
      _lastFitToken = widget.fitRequestToken;
      _scheduleFitToView();
    }
  }

  void _syncEdgeState() {
    _edgeState.relationFilters = Set<String>.from(widget.relationFilters);
    _edgeState.showAssociates = widget.showAssociates;
    _edgeState.showRelatives = widget.showRelatives;
    _edgeState.focusNodeId = widget.focusNodeId;
  }

  void _animateEdgeAlphas({bool fitAfter = false}) {
    if (!mounted) return;
    _syncEdgeState();
    _fadeTargets.clear();
    _fadeStarts.clear();
    for (final edge in _edgeById.values) {
      final target = _edgeState.shouldShow(
        edge,
        _nodeById[edge.source],
        _nodeById[edge.target],
      )
          ? 1.0
          : 0.0;
      _fadeTargets[edge.id] = target;
      _fadeStarts[edge.id] = _edgeState.alphaFor(
        edge.id,
        edge,
        _nodeById[edge.source],
        _nodeById[edge.target],
      );
    }
    _edgeFadeController
      ..stop()
      ..reset()
      ..forward();

    if (!fitAfter) return;
    void onStatus(AnimationStatus status) {
      if (status != AnimationStatus.completed) return;
      _edgeFadeController.removeStatusListener(onStatus);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _animateFitToVisibleNetwork();
      });
    }

    _edgeFadeController.addStatusListener(onStatus);
  }

  Set<String> _nodeIdsForFit() {
    if (widget.relationFilters.isEmpty) {
      return _nodeById.keys.toSet();
    }
    final ids = <String>{};
    if (_centerNodeId != null) ids.add(_centerNodeId!);
    for (final edge in _edgeById.values) {
      if (!_edgeState.shouldShow(
        edge,
        _nodeById[edge.source],
        _nodeById[edge.target],
      )) {
        continue;
      }
      ids.add(edge.source);
      ids.add(edge.target);
    }
    return ids;
  }

  Rect? _graphNodeRect(String id) {
    try {
      final node = _graph.getNodeUsingId(id);
      return Rect.fromLTWH(node.x, node.y, node.width, node.height);
    } catch (_) {
      return null;
    }
  }

  Offset? _graphNodeCenter(String id) {
    return _graphNodeRect(id)?.center;
  }

  Rect? _boundsForNodeIds(Iterable<String> nodeIds) {
    var count = 0;
    var left = double.infinity;
    var top = double.infinity;
    var right = double.negativeInfinity;
    var bottom = double.negativeInfinity;

    for (final id in nodeIds) {
      final rect = _graphNodeRect(id);
      if (rect == null) continue;
      left = math.min(left, rect.left);
      top = math.min(top, rect.top);
      right = math.max(right, rect.right);
      bottom = math.max(bottom, rect.bottom);
      count++;
    }
    if (count == 0) return null;

    const pad = 28.0;
    return Rect.fromLTRB(left - pad, top - pad, right + pad, bottom + pad);
  }

  Matrix4 _matrixForBounds(Rect bounds, Size viewport, double fillFactor) {
    final scale = math.min(
          viewport.width / bounds.width,
          viewport.height / bounds.height,
        ) *
        fillFactor;
    final scaledW = bounds.width * scale;
    final scaledH = bounds.height * scale;
    final dx = (viewport.width - scaledW) / 2 - bounds.left * scale;
    final dy = (viewport.height - scaledH) / 2 - bounds.top * scale;
    return Matrix4.translationValues(dx, dy, 0) *
        Matrix4.diagonal3Values(scale, scale, 1);
  }

  /// Keep the analyzed suspect at viewport centre while zooming to filtered neighbours.
  Matrix4? _matrixForCenteredSuspectFit(
    Set<String> nodeIds,
    Size viewport,
    double fillFactor,
  ) {
    final centerId = _centerNodeId;
    if (centerId == null) return null;
    final centerPoint = _graphNodeCenter(centerId);
    if (centerPoint == null) return null;

    final centerRect = _graphNodeRect(centerId);
    var maxReachX = (centerRect?.width ?? 80) / 2;
    var maxReachY = (centerRect?.height ?? 80) / 2;

    for (final id in nodeIds) {
      final rect = _graphNodeRect(id);
      if (rect == null) continue;
      maxReachX = math.max(
        maxReachX,
        (rect.center.dx - centerPoint.dx).abs() + rect.width / 2,
      );
      maxReachY = math.max(
        maxReachY,
        (rect.center.dy - centerPoint.dy).abs() + rect.height / 2,
      );
    }

    const pad = 36.0;
    maxReachX += pad;
    maxReachY += pad;

    final scale = math.min(
          (viewport.width / 2) / maxReachX,
          (viewport.height / 2) / maxReachY,
        ) *
        fillFactor;

    final dx = viewport.width / 2 - centerPoint.dx * scale;
    final dy = viewport.height / 2 - centerPoint.dy * scale;
    return Matrix4.translationValues(dx, dy, 0) *
        Matrix4.diagonal3Values(scale, scale, 1);
  }

  Matrix4 _lerpTransform(Matrix4 from, Matrix4 to, double t) {
    final scale = from.getMaxScaleOnAxis() +
        (to.getMaxScaleOnAxis() - from.getMaxScaleOnAxis()) * t;
    final dx = from.storage[12] + (to.storage[12] - from.storage[12]) * t;
    final dy = from.storage[13] + (to.storage[13] - from.storage[13]) * t;
    return Matrix4.translationValues(dx, dy, 0) *
        Matrix4.diagonal3Values(scale, scale, 1);
  }

  void _animateFitToVisibleNetwork() {
    final filtered = widget.relationFilters.isNotEmpty;
    _applyFitToNodes(
      _nodeIdsForFit(),
      fillFactor: filtered ? 0.9 : 0.98,
      animate: true,
    );
  }

  void _applyFitToNodes(
    Set<String> nodeIds, {
    required double fillFactor,
    required bool animate,
  }) {
    final viewport = _viewportSize;
    if (viewport == null || viewport.width <= 0 || viewport.height <= 0) {
      _scheduleFitToView();
      return;
    }

    final Matrix4? target;
    if (widget.relationFilters.isNotEmpty) {
      target = _matrixForCenteredSuspectFit(nodeIds, viewport, fillFactor);
    } else {
      final bounds = _boundsForNodeIds(nodeIds);
      if (bounds == null || bounds.width <= 1 || bounds.height <= 1) return;
      target = _matrixForBounds(bounds, viewport, fillFactor);
    }
    if (target == null) return;
    final fitTarget = target;
    if (!animate) {
      _zoomController?.stop();
      _transformController.value = fitTarget;
      return;
    }

    _zoomController?.dispose();
    final start = Matrix4.copy(_transformController.value);
    _zoomController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: _zoomFitMs),
    )..addListener(() {
        if (!mounted) return;
        final t = Curves.easeInOutCubic.transform(_zoomController!.value);
        _transformController.value = _lerpTransform(start, fitTarget, t);
      });
    _zoomController!.forward();
  }

  /// Wait for graphview layout, then zoom to fill the viewport (tight fit, all nodes visible).
  void _scheduleFitToView() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _fitToView();
        });
      });
    });
  }

  void _fitToView() {
    if (_graph.nodeCount() == 0) return;
    final filtered = widget.relationFilters.isNotEmpty;
    _applyFitToNodes(
      _nodeIdsForFit(),
      fillFactor: filtered ? 0.9 : 0.98,
      animate: false,
    );
  }

  KgRingLayoutAlgorithm _createAlgorithm() {
    _syncEdgeState();
    return KgRingLayoutAlgorithm(
      centerNodeId: _centerNodeId,
      renderer: KgRelationEdgeRenderer(
        theme: widget.theme,
        edgeById: _edgeById,
        nodeById: _nodeById,
        renderState: _edgeState,
      ),
    );
  }

  List<GraphNode> _layerNodes() {
    return widget.graph.nodes.where((n) {
      if (n.isCenter) return true;
      if (n.resolvedKind == GraphNodeKind.relative) return widget.showRelatives;
      return widget.showAssociates;
    }).toList();
  }

  void _rebuildGraph({bool preserveLayout = false}) {
    if (!preserveLayout) _graphRevision++;
    _nodeById.clear();
    _edgeById.clear();
    _syncEdgeState();

    final layoutNodes = _layerNodes()
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

    if (preserveLayout && _pinnedPositions.isNotEmpty) {
      for (final node in layoutNodes) {
        final pinned = _pinnedPositions[node.id];
        if (pinned != null) {
          node.x = pinned.dx;
          node.y = pinned.dy;
        }
      }
    } else {
      spreadKgNodes(layoutNodes);
      for (final node in layoutNodes) {
        _pinnedPositions[node.id] = Offset(node.x, node.y);
      }
    }

    final layoutById = {for (final n in layoutNodes) n.id: n};
    _centerNodeId = layoutNodes.where((n) => n.isCenter).map((n) => n.id).firstOrNull;
    final layerIds = layoutNodes.map((n) => n.id).toSet();

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

    final layoutEdges = widget.graph.edges.where(
      (e) => layerIds.contains(e.source) && layerIds.contains(e.target),
    );
    for (final edge in layoutEdges) {
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
    if (!preserveLayout) {
      for (final edge in layoutEdges) {
        _edgeState.alphas[edge.id] = 1.0;
      }
    }
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
    _edgeFadeController.dispose();
    _zoomController?.dispose();
    _photos.dispose();
    _transformController.dispose();
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

    return LayoutBuilder(
      builder: (context, constraints) {
        final nextViewport = Size(constraints.maxWidth, constraints.maxHeight);
        if (nextViewport.width > 0 &&
            nextViewport.height > 0 &&
            nextViewport != _viewportSize) {
          _viewportSize = nextViewport;
          _scheduleFitToView();
        }

        return DecoratedBox(
          decoration: BoxDecoration(color: widget.theme.canvasBg),
          child: GraphView.builder(
            key: ValueKey('gv-$_graphRevision'),
            graph: _graph,
            algorithm: _algorithm,
            controller: _gvController,
            animated: false,
            autoZoomToFit: false,
            centerGraph: false,
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
              final filterOpacity =
                  _edgeState.nodeAlphaFor(id, data, _edgeById.values, _nodeById);
              final focusDimmed =
                  widget.focusNodeId != null && !focused && !_isConnectedToFocus(id);
              final nodeOpacity = filterOpacity * (focusDimmed ? 0.28 : 1.0);
              final storageKey = data.storageKey ?? '';

              return ValueListenableBuilder<Map<String, ui.Image>>(
                valueListenable: _photos,
                builder: (_, photos, __) {
                  return KgNodeWidget(
                    node: data,
                    theme: widget.theme,
                    photo: photos[storageKey],
                    opacity: nodeOpacity,
                    focused: focused,
                    onTap: () => _handleNodeTap(data),
                    onDoubleTap: () => widget.onNodeDoubleTap(data),
                  );
                },
              );
            },
          ),
        );
      },
    );
  }
}
