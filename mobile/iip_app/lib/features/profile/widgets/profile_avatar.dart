import 'dart:typed_data';

import 'package:flutter/material.dart';
import '../../../core/theme/iip_colors.dart';

class ProfileAvatar extends StatelessWidget {
  const ProfileAvatar({
    super.key,
    required this.colors,
    required this.initials,
    this.photoBytes,
    this.size = 96,
    this.onTap,
    this.showCameraBadge = false,
    this.isLoading = false,
  });

  final IipColors colors;
  final String initials;
  final Uint8List? photoBytes;
  final double size;
  final VoidCallback? onTap;
  final bool showCameraBadge;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    final avatar = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: colors.primary.withValues(alpha: 0.35), width: 2),
        boxShadow: [
          BoxShadow(
            color: colors.primary.withValues(alpha: 0.15),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: ClipOval(
        child: isLoading
            ? ColoredBox(
                color: colors.surface,
                child: Center(
                  child: SizedBox(
                    width: size * 0.35,
                    height: size * 0.35,
                    child: CircularProgressIndicator(strokeWidth: 2, color: colors.primary),
                  ),
                ),
              )
            : photoBytes != null
                ? Image.memory(photoBytes!, fit: BoxFit.cover, width: size, height: size)
                : ColoredBox(
                    color: colors.primary.withValues(alpha: 0.15),
                    child: Center(
                      child: Text(
                        initials,
                        style: TextStyle(
                          color: colors.primary,
                          fontSize: size * 0.32,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
      ),
    );

    if (!showCameraBadge && onTap == null) return avatar;

    return GestureDetector(
      onTap: isLoading ? null : onTap,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          avatar,
          if (showCameraBadge)
            Positioned(
              right: 0,
              bottom: 0,
              child: Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: colors.primary,
                  shape: BoxShape.circle,
                  border: Border.all(color: colors.surface, width: 2),
                ),
                child: const Icon(Icons.camera_alt_rounded, color: Colors.white, size: 16),
              ),
            ),
        ],
      ),
    );
  }
}
