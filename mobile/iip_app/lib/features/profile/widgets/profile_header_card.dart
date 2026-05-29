import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../../../core/motion/iip_page_route.dart';
import '../../auth/auth_controller.dart';
import '../profile_photo_crop_screen.dart';
import 'profile_avatar.dart';

/// Profile hero with photo picker — used on the Settings tab.
class ProfileHeaderCard extends StatefulWidget {
  const ProfileHeaderCard({super.key});

  @override
  State<ProfileHeaderCard> createState() => _ProfileHeaderCardState();
}

class _ProfileHeaderCardState extends State<ProfileHeaderCard> {
  Uint8List? _photoBytes;
  bool _loadingPhoto = false;
  bool _uploadingPhoto = false;
  int _lastPhotoVersion = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  Future<void> _bootstrap() async {
    final auth = context.read<AuthController>();
    try {
      await auth.loadProfile();
      await _reloadPhoto(auth);
    } catch (_) {}
  }

  Future<void> _reloadPhoto(AuthController auth, {bool forceNetwork = false}) async {
    if (auth.profile?.hasProfilePhoto != true) {
      if (mounted) {
        setState(() {
          _photoBytes = null;
          _loadingPhoto = false;
        });
      }
      return;
    }

    final showSpinner = forceNetwork || !auth.hasCachedProfilePhoto;
    if (showSpinner && mounted) setState(() => _loadingPhoto = true);

    try {
      final bytes = await auth.fetchProfilePhotoBytes(forceNetwork: forceNetwork);
      if (mounted) setState(() => _photoBytes = bytes);
    } finally {
      if (mounted) setState(() => _loadingPhoto = false);
    }
  }

  String _initials(AuthController auth) {
    final name = auth.profile?.fullName ?? auth.user?.fullName ?? '?';
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.length >= 2) {
      return '${parts.first[0]}${parts[1][0]}'.toUpperCase();
    }
    return name.isNotEmpty ? name[0].toUpperCase() : '?';
  }

  Future<void> _pickPhoto(AuthController auth) async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from gallery'),
              onTap: () => Navigator.pop(ctx, ImageSource.gallery),
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take a photo'),
              onTap: () => Navigator.pop(ctx, ImageSource.camera),
            ),
          ],
        ),
      ),
    );
    if (source == null || !mounted) return;

    final picker = ImagePicker();
    final file = await picker.pickImage(source: source, imageQuality: 95);
    if (file == null || !mounted) return;

    final rawBytes = await file.readAsBytes();
    if (!mounted) return;

    final cropped = await context.pushSmooth<Uint8List>(
      ProfilePhotoCropScreen(imageBytes: rawBytes, colors: auth.colors),
      fullscreenDialog: true,
    );
    if (cropped == null || !mounted) return;

    setState(() => _uploadingPhoto = true);
    try {
      await auth.uploadProfilePhoto(
        bytes: cropped,
        filename: 'profile.jpg',
        contentType: 'image/jpeg',
      );
      if (mounted) {
        setState(() => _photoBytes = cropped);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Profile photo updated.'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(auth.errorMessage ?? 'Something went wrong. Please try again.'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _uploadingPhoto = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    if (auth.profilePhotoVersion != _lastPhotoVersion) {
      _lastPhotoVersion = auth.profilePhotoVersion;
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _reloadPhoto(auth, forceNetwork: !auth.hasCachedProfilePhoto),
      );
    }
    final colors = auth.colors;
    final profile = auth.profile;
    final office = auth.currentOffice;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            colors.primary.withValues(alpha: 0.12),
            colors.surface,
          ],
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        children: [
          ProfileAvatar(
            colors: colors,
            initials: _initials(auth),
            photoBytes: _photoBytes,
            size: 100,
            showCameraBadge: true,
            isLoading: _loadingPhoto || _uploadingPhoto,
            onTap: () => _pickPhoto(auth),
          ),
          const SizedBox(height: 16),
          Text(
            profile?.fullName ?? auth.user?.fullName ?? '',
            style: TextStyle(
              color: colors.text,
              fontSize: 20,
              fontWeight: FontWeight.w700,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 4),
          Text(
            '@${profile?.username ?? auth.user?.username ?? ''}',
            style: TextStyle(color: colors.textMuted, fontSize: 13),
          ),
          if (office != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: colors.bg,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: colors.border),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.apartment_rounded, size: 16, color: colors.primary),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      office.officeName,
                      style: TextStyle(
                        color: colors.text,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
            Text(
              office.roleName,
              style: TextStyle(color: colors.textMuted, fontSize: 11),
            ),
          ],
        ],
      ),
    );
  }
}
