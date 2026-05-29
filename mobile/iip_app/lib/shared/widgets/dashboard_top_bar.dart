import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme/iip_colors.dart';
import '../../features/auth/auth_controller.dart';
import '../../features/profile/widgets/profile_avatar.dart';
import 'iip_logo.dart';

/// Home dashboard app bar: emblem, greeting, and officer profile photo.
class DashboardTopBar extends StatefulWidget {
  const DashboardTopBar({
    super.key,
    required this.colors,
    required this.greeting,
    this.subtitle,
    this.onProfileTap,
  });

  final IipColors colors;
  final String greeting;
  final String? subtitle;
  final VoidCallback? onProfileTap;

  @override
  State<DashboardTopBar> createState() => _DashboardTopBarState();
}

class _DashboardTopBarState extends State<DashboardTopBar> {
  Uint8List? _photoBytes;
  bool _loadingPhoto = false;
  int _loadedPhotoVersion = -1;
  bool _lastHasPhoto = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _ensureProfileAndPhoto());
  }

  String _initials(AuthController auth) {
    final name = auth.profile?.fullName ?? auth.user?.fullName ?? '?';
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.length >= 2) {
      return '${parts.first[0]}${parts[1][0]}'.toUpperCase();
    }
    return name.isNotEmpty ? name[0].toUpperCase() : '?';
  }

  Future<void> _ensureProfileAndPhoto() async {
    final auth = context.read<AuthController>();
    if (auth.profile == null) {
      try {
        await auth.loadProfile();
      } catch (_) {}
    }
    if (!mounted) return;
    await _loadPhoto();
  }

  Future<void> _loadPhoto({bool forceNetwork = false}) async {
    final auth = context.read<AuthController>();
    final hasPhoto = auth.officerHasProfilePhoto;

    if (!hasPhoto) {
      if (mounted) {
        setState(() {
          _photoBytes = null;
          _loadingPhoto = false;
          _loadedPhotoVersion = auth.profilePhotoVersion;
          _lastHasPhoto = false;
        });
      }
      return;
    }

    final version = auth.profilePhotoVersion;
    if (!forceNetwork &&
        hasPhoto == _lastHasPhoto &&
        version == _loadedPhotoVersion &&
        _photoBytes != null) {
      return;
    }

    if (!forceNetwork && version == _loadedPhotoVersion && auth.hasCachedProfilePhoto) {
      final bytes = await auth.fetchProfilePhotoBytes();
      if (mounted && bytes != null) {
        setState(() {
          _photoBytes = bytes;
          _lastHasPhoto = true;
        });
      }
      return;
    }

    if (mounted) setState(() => _loadingPhoto = true);
    try {
      final bytes = await auth.fetchProfilePhotoBytes(forceNetwork: forceNetwork);
      if (!mounted) return;
      setState(() {
        _photoBytes = bytes;
        _loadingPhoto = false;
        _loadedPhotoVersion = version;
        _lastHasPhoto = hasPhoto;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingPhoto = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final hasPhoto = auth.officerHasProfilePhoto;
    final version = auth.profilePhotoVersion;

    if (hasPhoto != _lastHasPhoto ||
        version != _loadedPhotoVersion ||
        (hasPhoto && _photoBytes == null && !_loadingPhoto)) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _loadPhoto());
    }

    final colors = widget.colors;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        const IipLogo(size: 44, whiteBackground: true),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                widget.greeting,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: colors.text,
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  height: 1.15,
                ),
              ),
              if (widget.subtitle != null && widget.subtitle!.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(
                  widget.subtitle!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: colors.textMuted, fontSize: 12, height: 1.2),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(width: 8),
        Semantics(
          button: true,
          label: 'Open profile and settings',
          child: ProfileAvatar(
            colors: colors,
            initials: _initials(auth),
            photoBytes: _photoBytes,
            size: 40,
            isLoading: _loadingPhoto,
            onTap: widget.onProfileTap,
          ),
        ),
      ],
    );
  }
}
