import 'package:flutter/material.dart';

import '../../core/motion/iip_page_route.dart';
import '../../core/theme/iip_colors.dart';
import '../suspects/quick_suspect_gallery_screen.dart';
import 'frs_capture_screen.dart';
import 'frs_live_screen.dart';

/// Choose live camera scan vs single photo search.
Future<void> showFrsModeSheet(BuildContext context, {required IipColors colors}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: colors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) {
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
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
              Text(
                'Field face recognition',
                style: TextStyle(
                  color: colors.text,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Scan suspects in the field using the camera.',
                style: TextStyle(color: colors.textMuted, fontSize: 13),
              ),
              const SizedBox(height: 20),
              _ModeTile(
                colors: colors,
                icon: Icons.videocam_rounded,
                title: 'Live scan',
                subtitle: 'Detect multiple faces from the camera feed',
                onTap: () {
                  Navigator.pop(ctx);
                  Future.delayed(const Duration(milliseconds: 150), () {
                    if (context.mounted) {
                      context.pushSmooth(const FrsLiveScreen());
                    }
                  });
                },
              ),
              const SizedBox(height: 10),
              _ModeTile(
                colors: colors,
                icon: Icons.photo_camera_rounded,
                title: 'Photo search',
                subtitle: 'Take one photo and search the index',
                onTap: () {
                  Navigator.pop(ctx);
                  Future.delayed(const Duration(milliseconds: 150), () {
                    if (context.mounted) {
                      context.pushSmooth(const FrsCaptureScreen());
                    }
                  });
                },
              ),
              const SizedBox(height: 10),
              _ModeTile(
                colors: colors,
                icon: Icons.auto_awesome_motion_rounded,
                title: 'Quick suspect gallery',
                subtitle: 'Capture offline suspect photos and sync later',
                onTap: () {
                  Navigator.pop(ctx);
                  Future.delayed(const Duration(milliseconds: 150), () {
                    if (context.mounted) {
                      context.pushSmooth(const QuickSuspectGalleryScreen());
                    }
                  });
                },
              ),
            ],
          ),
        ),
      );
    },
  );
}

class _ModeTile extends StatelessWidget {
  const _ModeTile({
    required this.colors,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IipColors colors;
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: colors.surfaceHover,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: colors.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: colors.primary),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        color: colors.text,
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: TextStyle(color: colors.textMuted, fontSize: 12),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: colors.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}
