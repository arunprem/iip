import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../core/theme/iip_colors.dart';

/// Officer's current position on the intelligence map — distinct from suspect pins.
class UserLocationMapMarker extends StatelessWidget {
  const UserLocationMapMarker({
    super.key,
    required this.colors,
    required this.initials,
    this.photoBytes,
    this.isLoadingPhoto = false,
    this.size = 56,
  });

  final IipColors colors;
  final String initials;
  final Uint8List? photoBytes;
  final bool isLoadingPhoto;
  final double size;

  /// Accent for "you" — green/teal, not suspect primary blue.
  Color get _accent => colors.success;

  @override
  Widget build(BuildContext context) {
    final inner = size - 10;
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.center,
        children: [
          // Outer pulse ring
          Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: _accent.withValues(alpha: 0.18),
              border: Border.all(color: _accent.withValues(alpha: 0.45), width: 2),
            ),
          ),
          // Photo / initials
          Container(
            width: inner,
            height: inner,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: _accent, width: 3),
              boxShadow: [
                BoxShadow(
                  color: _accent.withValues(alpha: 0.35),
                  blurRadius: 10,
                  offset: const Offset(0, 2),
                ),
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.22),
                  blurRadius: 6,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: ClipOval(child: _avatarContent(inner)),
          ),
          // Location badge
          Positioned(
            right: -2,
            bottom: -2,
            child: Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                color: _accent,
                shape: BoxShape.circle,
                border: Border.all(color: colors.surface, width: 2),
              ),
              child: const Icon(
                Icons.my_location,
                color: Colors.white,
                size: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _avatarContent(double inner) {
    if (isLoadingPhoto) {
      return ColoredBox(
        color: colors.surface,
        child: Center(
          child: SizedBox(
            width: inner * 0.35,
            height: inner * 0.35,
            child: CircularProgressIndicator(strokeWidth: 2, color: _accent),
          ),
        ),
      );
    }
    if (photoBytes != null) {
      return Image.memory(
        photoBytes!,
        fit: BoxFit.cover,
        width: inner,
        height: inner,
      );
    }
    return ColoredBox(
      color: _accent.withValues(alpha: 0.2),
      child: Center(
        child: Text(
          initials,
          style: TextStyle(
            color: _accent,
            fontSize: inner * 0.34,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }
}
