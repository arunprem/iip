import 'dart:typed_data';

import 'package:flutter/material.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/iip_colors.dart';
import '../suspects/suspect_repository.dart';

/// Circular map pin showing suspect front photo (or type icon fallback).
class MapPhotoMarker extends StatefulWidget {
  const MapPhotoMarker({
    super.key,
    required this.api,
    required this.colors,
    required this.storageKey,
    required this.markerType,
    required this.onTap,
    this.size = 48,
  });

  final ApiClient api;
  final IipColors colors;
  final String? storageKey;
  final String markerType;
  final VoidCallback onTap;
  final double size;

  @override
  State<MapPhotoMarker> createState() => _MapPhotoMarkerState();
}

class _MapPhotoMarkerState extends State<MapPhotoMarker> {
  Uint8List? _bytes;
  late final SuspectRepository _repo;

  @override
  void initState() {
    super.initState();
    _repo = SuspectRepository(widget.api);
    _load();
  }

  Future<void> _load() async {
    final key = widget.storageKey;
    if (key == null || key.isEmpty) return;
    final bytes = await _repo.fetchPhotoBytes(key);
    if (mounted) setState(() => _bytes = bytes);
  }

  @override
  Widget build(BuildContext context) {
    final border = widget.colors.primary;
    return GestureDetector(
      onTap: widget.onTap,
      child: Container(
        width: widget.size,
        height: widget.size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: border, width: 2.5),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.28),
              blurRadius: 8,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        child: ClipOval(
          child: _bytes != null
              ? Image.memory(_bytes!, fit: BoxFit.cover, width: widget.size, height: widget.size)
              : ColoredBox(
                  color: widget.colors.surface,
                  child: Center(
                    child: _bytes == null && widget.storageKey != null
                        ? SizedBox(
                            width: widget.size * 0.4,
                            height: widget.size * 0.4,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: widget.colors.primary,
                            ),
                          )
                        : Icon(
                            _iconForType(widget.markerType),
                            color: widget.colors.primary,
                            size: widget.size * 0.5,
                          ),
                  ),
                ),
        ),
      ),
    );
  }

  IconData _iconForType(String type) {
    return switch (type) {
      'crime' => Icons.report,
      'event' => Icons.event,
      'task' => Icons.task_alt,
      _ => Icons.person,
    };
  }
}
