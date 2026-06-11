import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/motion/iip_page_route.dart';
import '../../core/theme/iip_colors.dart';
import '../../models/knowledge_graph_models.dart';
import '../auth/auth_controller.dart';
import '../suspects/suspect_dossier_detail_screen.dart';
import '../suspects/suspect_repository.dart';
import 'kg_graph_theme.dart';
import 'kg_relation_colors.dart';
import 'kg_network_view.dart';
import 'kg_node_intel_sheet.dart';
import 'knowledge_graph_repository.dart';

/// Knowledge Graph — link analysis (mobile parity with web KG Canvas).
class KnowledgeGraphScreen extends StatefulWidget {
  const KnowledgeGraphScreen({
    super.key,
    this.initialMasterSuspectId,
    this.initialDisplayName,
    this.initialDossierId,
  });

  final String? initialMasterSuspectId;
  final String? initialDisplayName;
  final String? initialDossierId;

  @override
  State<KnowledgeGraphScreen> createState() => _KnowledgeGraphScreenState();
}

class _KnowledgeGraphScreenState extends State<KnowledgeGraphScreen> {
  late final KnowledgeGraphRepository _kgRepo;
  late final SuspectRepository _suspectRepo;

  final _searchController = TextEditingController();
  final _searchFocusNode = FocusNode();
  final _canvasFocusNode = FocusNode();
  bool _searching = false;
  bool _loadingGraph = false;
  List<SuspectProfileHit> _results = [];
  bool _hasMoreResults = false;
  bool _loadingMore = false;
  SuspectProfileHit? _selected;
  NetworkGraphResponse? _graph;
  String? _error;

  bool _showAssociates = true;
  bool _showRelatives = true;
  Set<String> _relationFilters = {};
  String? _focusNodeId;
  int _fitToken = 0;

  @override
  void initState() {
    super.initState();
    final api = context.read<AuthController>().api;
    _kgRepo = KnowledgeGraphRepository(api);
    _suspectRepo = SuspectRepository(api);

    final masterId = widget.initialMasterSuspectId;
    if (masterId != null && masterId.isNotEmpty) {
      final hit = SuspectProfileHit(
        masterSuspectId: masterId,
        displayName: widget.initialDisplayName ?? 'Subject',
        criminalName: widget.initialDisplayName ?? 'Subject',
        dossierId: widget.initialDossierId ?? '',
      );
      WidgetsBinding.instance.addPostFrameCallback((_) => _runAnalysis(hit));
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    _searchFocusNode.dispose();
    _canvasFocusNode.dispose();
    super.dispose();
  }

  void _dismissSearchKeyboard() {
    _searchFocusNode.unfocus();
    FocusManager.instance.primaryFocus?.unfocus();
  }

  void _focusCanvas() {
    _dismissSearchKeyboard();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _canvasFocusNode.requestFocus();
    });
  }

  Future<void> _loadMoreResults() async {
    final q = _searchController.text.trim();
    if (q.length < 2 || _loadingMore) return;
    setState(() => _loadingMore = true);
    try {
      final res = await _kgRepo.searchProfiles(q, offset: _results.length);
      if (!mounted) return;
      setState(() {
        _results = groupProfileHitsByMaster([..._results, ...res.results]);
        _hasMoreResults = res.hasMore;
        _loadingMore = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loadingMore = false);
      _showSnack('Could not load more profiles.');
    }
  }

  Future<void> _runSearch() async {
    final q = _searchController.text.trim();
    if (q.length < 2) return;
    _dismissSearchKeyboard();
    setState(() {
      _searching = true;
      _error = null;
      _selected = null;
      _graph = null;
      _relationFilters = {};
      _focusNodeId = null;
    });
    try {
      final res = await _kgRepo.searchProfiles(q);
      if (!mounted) return;
      setState(() {
        _results = groupProfileHitsByMaster(res.results);
        _hasMoreResults = res.hasMore;
        _searching = false;
      });
      _dismissSearchKeyboard();
      if (res.results.isEmpty) {
        _showSnack('No matching suspect profiles found.');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _results = [];
        _searching = false;
        _error = e.toString().replaceFirst('ApiException: ', '');
      });
      _dismissSearchKeyboard();
    }
  }

  Future<void> _runAnalysis(SuspectProfileHit hit) async {
    _dismissSearchKeyboard();
    setState(() {
      _selected = hit;
      _loadingGraph = true;
      _graph = null;
      _relationFilters = {};
      _focusNodeId = null;
      _error = null;
    });
    try {
      final network = await _kgRepo.fetchNetwork(hit.masterSuspectId);
      if (!mounted) return;
      setState(() {
        _graph = network;
        _loadingGraph = false;
        _fitToken++;
      });
      _focusCanvas();
      if (network.error != null && network.error!.isNotEmpty) {
        _showSnack(network.error!);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _graph = null;
        _loadingGraph = false;
        _error = e.toString().replaceFirst('ApiException: ', '');
      });
    }
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), behavior: SnackBarBehavior.floating),
    );
  }

  void _toggleRelationFilter(String key) {
    setState(() {
      final next = Set<String>.from(_relationFilters);
      if (next.contains(key)) {
        next.remove(key);
      } else {
        next.add(key);
      }
      _relationFilters = next;
    });
  }

  Future<void> _openDossierForNode(GraphNode node) async {
    String? dossierId = _selected?.masterSuspectId == node.id ? _selected?.dossierId : null;
    dossierId ??= await _kgRepo.resolveDossierIdForMaster(node.id);
    if (!mounted) return;
    if (dossierId == null || dossierId.isEmpty) {
      _showSnack('No dossier available for this profile.');
      return;
    }
    context.pushSmooth(
      SuspectDossierDetailScreen(dossierId: dossierId),
    );
  }

  void _showNodeSheet(GraphNode node) {
    final colors = context.read<AuthController>().colors;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (ctx) => KgNodeIntelSheet(
        node: node,
        edges: _graph?.edges ?? [],
        colors: colors,
        repo: _suspectRepo,
        onFocus: () {
          Navigator.pop(ctx);
          setState(() => _focusNodeId = node.id);
        },
        onOpenDossier: () {
          Navigator.pop(ctx);
          _openDossierForNode(node);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.watch<AuthController>().colors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final graphTheme = KgGraphTheme.forBrightness(isDark ? Brightness.dark : Brightness.light);
    final showGraphStage = _selected != null || _graph != null || _loadingGraph;
    final relationStats = _graph?.edges != null ? buildRelationStats(_graph!.edges) : <KgRelationStat>[];

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        title: const Text('Knowledge Graph'),
        actions: [
          if (showGraphStage)
            IconButton(
              tooltip: 'Fit view',
              onPressed: () => setState(() => _fitToken++),
              icon: const Icon(Icons.fit_screen_outlined),
            ),
        ],
      ),
      body: GestureDetector(
        onTap: _dismissSearchKeyboard,
        behavior: HitTestBehavior.translucent,
        child: Column(
        children: [
          _SearchPanel(
            colors: colors,
            controller: _searchController,
            focusNode: _searchFocusNode,
            searching: _searching,
            onSearch: _runSearch,
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Text(_error!, style: TextStyle(color: colors.error, fontSize: 12)),
            ),
          if (!showGraphStage) ...[
            Expanded(
              child: _SearchResultsList(
                colors: colors,
                results: _results,
                repo: _suspectRepo,
                onAnalyze: _runAnalysis,
                hasMore: _hasMoreResults,
                loadingMore: _loadingMore,
                onLoadMore: _loadMoreResults,
              ),
            ),
          ] else ...[
            if (_selected != null)
              _SelectedBanner(hit: _selected!, colors: colors),
            if (relationStats.isNotEmpty)
              _RelationFilterBar(
                colors: colors,
                isDark: isDark,
                stats: relationStats,
                active: _relationFilters,
                onToggle: _toggleRelationFilter,
              ),
            _GraphToolbar(
              colors: colors,
              showAssociates: _showAssociates,
              showRelatives: _showRelatives,
              focusActive: _focusNodeId != null,
              onToggleAssociates: () => setState(() => _showAssociates = !_showAssociates),
              onToggleRelatives: () => setState(() => _showRelatives = !_showRelatives),
              onClearFocus: () => setState(() => _focusNodeId = null),
            ),
            Expanded(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 280),
                switchInCurve: Curves.easeOutCubic,
                switchOutCurve: Curves.easeInCubic,
                child: _loadingGraph
                    ? _GraphLoadingState(key: const ValueKey('loading'), colors: colors)
                    : _graph == null
                        ? Center(
                            key: const ValueKey('empty'),
                            child: Text(
                              'Deploy analysis from search results.',
                              style: TextStyle(color: colors.textMuted),
                            ),
                          )
                        : Padding(
                            key: ValueKey(_graph!.centerId),
                            padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(16),
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  border: Border.all(color: colors.border),
                                  boxShadow: [
                                    BoxShadow(
                                      color: colors.primary.withValues(alpha: 0.08),
                                      blurRadius: 18,
                                      offset: const Offset(0, 6),
                                    ),
                                  ],
                                ),
                                child: Focus(
                                  focusNode: _canvasFocusNode,
                                  canRequestFocus: true,
                                  descendantsAreFocusable: true,
                                  child: KgNetworkView(
                                    key: ValueKey(
                                      'kg-${isDark ? 1 : 0}-${_graph!.centerId}',
                                    ),
                                    graph: _graph!,
                                    theme: graphTheme,
                                    repo: _suspectRepo,
                                    showAssociates: _showAssociates,
                                    showRelatives: _showRelatives,
                                    relationFilters: _relationFilters,
                                    focusNodeId: _focusNodeId,
                                    fitRequestToken: _fitToken,
                                    onNodeTap: _showNodeSheet,
                                    onNodeDoubleTap: _openDossierForNode,
                                  ),
                                ),
                              ),
                            ),
                          ),
              ),
            ),
          ],
        ],
        ),
      ),
    );
  }
}

class _SearchPanel extends StatelessWidget {
  const _SearchPanel({
    required this.colors,
    required this.controller,
    required this.focusNode,
    required this.searching,
    required this.onSearch,
  });

  final IipColors colors;
  final TextEditingController controller;
  final FocusNode focusNode;
  final bool searching;
  final VoidCallback onSearch;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: controller,
              focusNode: focusNode,
              decoration: InputDecoration(
                hintText: 'Criminal name or alias',
                prefixIcon: Icon(Icons.search, color: colors.textMuted),
                filled: true,
                fillColor: colors.surface,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: colors.border),
                ),
              ),
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => onSearch(),
            ),
          ),
          const SizedBox(width: 8),
          FilledButton(
            onPressed: searching ? null : onSearch,
            child: searching
                ? SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: colors.surface),
                  )
                : const Text('Scan'),
          ),
        ],
      ),
    );
  }
}

class _SearchResultsList extends StatelessWidget {
  const _SearchResultsList({
    required this.colors,
    required this.results,
    required this.repo,
    required this.onAnalyze,
    required this.hasMore,
    required this.loadingMore,
    required this.onLoadMore,
  });

  final IipColors colors;
  final List<SuspectProfileHit> results;
  final SuspectRepository repo;
  final ValueChanged<SuspectProfileHit> onAnalyze;
  final bool hasMore;
  final bool loadingMore;
  final VoidCallback onLoadMore;

  @override
  Widget build(BuildContext context) {
    if (results.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'Search for a suspect profile to begin link analysis.',
            textAlign: TextAlign.center,
            style: TextStyle(color: colors.textMuted, height: 1.4),
          ),
        ),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: results.length + (hasMore ? 1 : 0),
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        if (index >= results.length) {
          return OutlinedButton(
            onPressed: loadingMore ? null : onLoadMore,
            child: Text(loadingMore ? 'Loading…' : 'Load more matches'),
          );
        }
        final hit = results[index];
        return _SearchResultTile(
          hit: hit,
          colors: colors,
          repo: repo,
          onAnalyze: () => onAnalyze(hit),
        );
      },
    );
  }
}

class _SearchResultTile extends StatefulWidget {
  const _SearchResultTile({
    required this.hit,
    required this.colors,
    required this.repo,
    required this.onAnalyze,
  });

  final SuspectProfileHit hit;
  final IipColors colors;
  final SuspectRepository repo;
  final VoidCallback onAnalyze;

  @override
  State<_SearchResultTile> createState() => _SearchResultTileState();
}

class _SearchResultTileState extends State<_SearchResultTile> {
  Uint8List? _photoBytes;

  @override
  void initState() {
    super.initState();
    _loadPhoto();
  }

  Future<void> _loadPhoto() async {
    final key = widget.hit.storageKey;
    if (key == null || key.isEmpty) return;
    final bytes = await widget.repo.fetchPhotoBytes(key);
    if (mounted) setState(() => _photoBytes = bytes);
  }

  @override
  Widget build(BuildContext context) {
    final hit = widget.hit;
    final colors = widget.colors;
    final meta = hit.metaLine;

    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: widget.onAnalyze,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Container(
                  width: 52,
                  height: 52,
                  color: colors.surfaceHover,
                  child: _photoBytes != null
                      ? Image.memory(_photoBytes!, fit: BoxFit.cover)
                      : Icon(Icons.person_outline, color: colors.textMuted),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      hit.displayName.isNotEmpty ? hit.displayName : hit.criminalName,
                      style: TextStyle(
                        color: colors.text,
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                    if (hit.matchTags.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 6,
                        runSpacing: 4,
                        children: hit.matchTags
                            .map(
                              (tag) => Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: colors.primary.withValues(alpha: 0.12),
                                  borderRadius: BorderRadius.circular(999),
                                  border: Border.all(color: colors.primary.withValues(alpha: 0.35)),
                                ),
                                child: Text(
                                  tag,
                                  style: TextStyle(
                                    color: colors.primary,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            )
                            .toList(),
                      ),
                    ],
                    if (meta.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(meta, style: TextStyle(color: colors.textMuted, fontSize: 12)),
                    ],
                  ],
                ),
              ),
              Icon(Icons.hub_outlined, color: colors.primary),
            ],
          ),
        ),
      ),
    );
  }
}

class _SelectedBanner extends StatelessWidget {
  const _SelectedBanner({required this.hit, required this.colors});

  final SuspectProfileHit hit;
  final IipColors colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: colors.primary.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: colors.primary.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          Icon(Icons.radar, size: 16, color: colors.primary),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Target: ${hit.displayName.isNotEmpty ? hit.displayName : hit.criminalName}',
              style: TextStyle(color: colors.text, fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

class _RelationFilterBar extends StatelessWidget {
  const _RelationFilterBar({
    required this.colors,
    required this.isDark,
    required this.stats,
    required this.active,
    required this.onToggle,
  });

  final IipColors colors;
  final bool isDark;
  final List<KgRelationStat> stats;
  final Set<String> active;
  final ValueChanged<String> onToggle;

  String _roleFromKey(String key) {
    final idx = key.indexOf(':');
    return idx >= 0 ? key.substring(idx + 1) : key;
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: stats.length,
        separatorBuilder: (_, __) => const SizedBox(width: 6),
        itemBuilder: (context, index) {
          final stat = stats[index];
          final selected = active.contains(stat.key);
          final chipColor = relationChipColor(_roleFromKey(stat.key), isDark);
          return FilterChip(
            avatar: CircleAvatar(
              radius: 5,
              backgroundColor: chipColor,
            ),
            label: Text('${stat.label} (${stat.count})'),
            selected: selected,
            onSelected: (_) => onToggle(stat.key),
            selectedColor: chipColor.withValues(alpha: 0.22),
            checkmarkColor: chipColor,
            side: BorderSide(
              color: selected ? chipColor : colors.border,
              width: selected ? 1.5 : 1,
            ),
            visualDensity: VisualDensity.compact,
          );
        },
      ),
    );
  }
}

class _GraphToolbar extends StatelessWidget {
  const _GraphToolbar({
    required this.colors,
    required this.showAssociates,
    required this.showRelatives,
    required this.focusActive,
    required this.onToggleAssociates,
    required this.onToggleRelatives,
    required this.onClearFocus,
  });

  final IipColors colors;
  final bool showAssociates;
  final bool showRelatives;
  final bool focusActive;
  final VoidCallback onToggleAssociates;
  final VoidCallback onToggleRelatives;
  final VoidCallback onClearFocus;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Row(
        children: [
          _ToggleChip(
            label: 'Associates',
            active: showAssociates,
            onTap: onToggleAssociates,
            colors: colors,
          ),
          const SizedBox(width: 6),
          _ToggleChip(
            label: 'Relatives',
            active: showRelatives,
            onTap: onToggleRelatives,
            colors: colors,
          ),
          const Spacer(),
          if (focusActive)
            TextButton.icon(
              onPressed: onClearFocus,
              icon: const Icon(Icons.clear, size: 16),
              label: const Text('Clear focus'),
            ),
        ],
      ),
    );
  }
}

class _GraphLoadingState extends StatelessWidget {
  const _GraphLoadingState({super.key, required this.colors});

  final IipColors colors;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 36,
            height: 36,
            child: CircularProgressIndicator(
              strokeWidth: 2.5,
              color: colors.primary,
            ),
          ),
          const SizedBox(height: 14),
          Text(
            'Mapping associate network…',
            style: TextStyle(color: colors.textMuted, fontSize: 13),
          ),
        ],
      ),
    );
  }
}

class _ToggleChip extends StatelessWidget {
  const _ToggleChip({
    required this.label,
    required this.active,
    required this.onTap,
    required this.colors,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;
  final IipColors colors;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: active ? colors.primary.withValues(alpha: 0.15) : colors.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: active ? colors.primary : colors.border,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: active ? colors.primary : colors.textMuted,
            fontSize: 11,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}
