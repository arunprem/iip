import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../core/theme/iip_colors.dart';
import '../../models/knowledge_graph_models.dart';
import '../suspects/suspect_repository.dart';

class KgNodeIntelSheet extends StatefulWidget {
  const KgNodeIntelSheet({
    super.key,
    required this.node,
    required this.edges,
    required this.colors,
    required this.repo,
    required this.onOpenDossier,
    required this.onFocus,
  });

  final GraphNode node;
  final List<GraphEdge> edges;
  final IipColors colors;
  final SuspectRepository repo;
  final VoidCallback onOpenDossier;
  final VoidCallback onFocus;

  @override
  State<KgNodeIntelSheet> createState() => _KgNodeIntelSheetState();
}

class _KgNodeIntelSheetState extends State<KgNodeIntelSheet> {
  Uint8List? _photoBytes;

  @override
  void initState() {
    super.initState();
    _loadPhoto();
  }

  Future<void> _loadPhoto() async {
    final key = widget.node.storageKey;
    if (key == null || key.isEmpty) return;
    final bytes = await widget.repo.fetchPhotoBytes(key);
    if (mounted) setState(() => _photoBytes = bytes);
  }

  List<GraphEdge> get _connections {
    return widget.edges
        .where((e) => e.source == widget.node.id || e.target == widget.node.id)
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final colors = widget.colors;
    final node = widget.node;
    final kindLabel = switch (node.resolvedKind) {
      GraphNodeKind.center => 'Analysis target',
      GraphNodeKind.relative => 'Family relative',
      GraphNodeKind.associate => 'Operational associate',
    };

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 4),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Avatar(bytes: _photoBytes, gender: node.gender, colors: colors),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      node.label,
                      style: TextStyle(
                        color: colors.text,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      kindLabel,
                      style: TextStyle(color: colors.primary, fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                    if (node.criminalName != null && node.criminalName!.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        node.criminalName!,
                        style: TextStyle(color: colors.textMuted, fontSize: 13),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            'Connections (${_connections.length})',
            style: TextStyle(
              color: colors.text,
              fontWeight: FontWeight.w700,
              fontSize: 13,
            ),
          ),
          const SizedBox(height: 8),
          if (_connections.isEmpty)
            Text('No visible links in this layer.', style: TextStyle(color: colors.textMuted, fontSize: 12))
          else
            ..._connections.take(6).map(
                  (e) => Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Row(
                      children: [
                        Icon(Icons.link, size: 14, color: colors.textMuted),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            formatRelationRole(e.role),
                            style: TextStyle(color: colors.textMuted, fontSize: 12),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: widget.onFocus,
                  icon: const Icon(Icons.center_focus_strong, size: 18),
                  label: const Text('Focus'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton.icon(
                  onPressed: widget.onOpenDossier,
                  icon: const Icon(Icons.folder_open_outlined, size: 18),
                  label: const Text('Dossier'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.bytes, required this.gender, required this.colors});

  final Uint8List? bytes;
  final String? gender;
  final IipColors colors;

  @override
  Widget build(BuildContext context) {
    final g = (gender ?? '').toLowerCase();
    final fallback = g.contains('female')
        ? Icons.face_3_outlined
        : g.contains('male')
            ? Icons.face_outlined
            : Icons.person_outline;

    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: 64,
        height: 64,
        color: colors.surfaceHover,
        child: bytes != null
            ? Image.memory(bytes!, fit: BoxFit.cover)
            : Icon(fallback, color: colors.textMuted, size: 32),
      ),
    );
  }
}
