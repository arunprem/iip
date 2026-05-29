import 'dart:typed_data';

import 'package:flutter/material.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/iip_colors.dart';
import '../../models/map_marker.dart';
import '../suspects/suspect_repository.dart';

class MapMarkerSheet extends StatefulWidget {
  const MapMarkerSheet({
    super.key,
    required this.marker,
    required this.colors,
    required this.api,
    required this.onViewDetails,
  });

  final MapMarkerItem marker;
  final IipColors colors;
  final ApiClient api;
  final VoidCallback onViewDetails;

  @override
  State<MapMarkerSheet> createState() => _MapMarkerSheetState();
}

class _MapMarkerSheetState extends State<MapMarkerSheet> {
  Uint8List? _photoBytes;

  @override
  void initState() {
    super.initState();
    _loadPhoto();
  }

  Future<void> _loadPhoto() async {
    final key = widget.marker.storageKey;
    if (key == null || key.isEmpty) return;
    final bytes = await SuspectRepository(widget.api).fetchPhotoBytes(key);
    if (mounted) setState(() => _photoBytes = bytes);
  }

  @override
  Widget build(BuildContext context) {
    final colors = widget.colors;
    final marker = widget.marker;

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
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: colors.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: SizedBox(
                  width: 72,
                  height: 72,
                  child: _photoBytes != null
                      ? Image.memory(_photoBytes!, fit: BoxFit.cover)
                      : ColoredBox(
                          color: colors.primary.withValues(alpha: 0.1),
                          child: Icon(Icons.person, color: colors.primary, size: 36),
                        ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _TypeBadge(type: marker.markerType, colors: colors),
                    const SizedBox(height: 8),
                    Text(
                      marker.title,
                      style: TextStyle(
                        color: colors.text,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (marker.subtitle.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        marker.subtitle,
                        style: TextStyle(color: colors.textMuted, fontSize: 13),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            '${marker.latitude.toStringAsFixed(5)}, ${marker.longitude.toStringAsFixed(5)}',
            style: TextStyle(color: colors.textMuted, fontSize: 11),
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: widget.onViewDetails,
              style: FilledButton.styleFrom(
                backgroundColor: colors.primary,
                minimumSize: const Size.fromHeight(46),
              ),
              child: const Text('View details'),
            ),
          ),
        ],
      ),
    );
  }
}

class _TypeBadge extends StatelessWidget {
  const _TypeBadge({required this.type, required this.colors});

  final String type;
  final IipColors colors;

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (type) {
      'suspect' => ('Suspect', colors.primary),
      'crime' => ('Crime scene', colors.error),
      'event' => ('Event', const Color(0xFFA78BFA)),
      'task' => ('Task', colors.warning),
      _ => (type, colors.textMuted),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(
        label.toUpperCase(),
        style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w800),
      ),
    );
  }
}
