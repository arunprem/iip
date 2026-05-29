import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/motion/iip_page_route.dart';
import '../../core/theme/iip_colors.dart';
import '../auth/auth_controller.dart';
import 'suspect_repository.dart';

/// Full-screen pinch-to-zoom viewer for dossier photos.
class DossierPhotoViewerScreen extends StatefulWidget {
  const DossierPhotoViewerScreen({
    super.key,
    required this.colors,
    this.imageBytes,
    this.storageKey,
    this.repo,
    this.title,
  });

  final IipColors colors;
  final Uint8List? imageBytes;
  final String? storageKey;
  final SuspectRepository? repo;
  final String? title;

  @override
  State<DossierPhotoViewerScreen> createState() => _DossierPhotoViewerScreenState();
}

class _DossierPhotoViewerScreenState extends State<DossierPhotoViewerScreen> {
  Uint8List? _bytes;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _bytes = widget.imageBytes;
    if (_bytes == null && widget.storageKey != null && widget.repo != null) {
      _load();
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final bytes = await widget.repo!.fetchPhotoBytes(widget.storageKey!);
      if (!mounted) return;
      setState(() {
        _bytes = bytes;
        _loading = false;
        if (bytes == null) _error = 'Photo could not be loaded.';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Photo could not be loaded.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = widget.colors;
    final top = MediaQuery.paddingOf(context).top;

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          if (_loading)
            Center(child: CircularProgressIndicator(color: colors.primary))
          else if (_error != null)
            Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white70),
                ),
              ),
            )
          else if (_bytes != null)
            InteractiveViewer(
              minScale: 0.85,
              maxScale: 5,
              panEnabled: true,
              scaleEnabled: true,
              child: Center(
                child: Image.memory(
                  _bytes!,
                  fit: BoxFit.contain,
                  filterQuality: FilterQuality.high,
                ),
              ),
            )
          else
            const Center(
              child: Text(
                'No image available',
                style: TextStyle(color: Colors.white70),
              ),
            ),
          Positioned(
            top: top + 8,
            left: 8,
            right: 8,
            child: Row(
              children: [
                Material(
                  color: Colors.black54,
                  shape: const CircleBorder(),
                  clipBehavior: Clip.antiAlias,
                  child: IconButton(
                    icon: const Icon(Icons.close_rounded, color: Colors.white),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ),
                const Spacer(),
                if (widget.title != null && widget.title!.isNotEmpty)
                  Flexible(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.black54,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        widget.title!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: MediaQuery.paddingOf(context).bottom + 16,
            child: Text(
              'Pinch to zoom · drag to pan',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.55),
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Opens full-screen zoom viewer when [imageBytes] or [storageKey] + [repo] are set.
void openDossierPhotoViewer(
  BuildContext context, {
  required IipColors colors,
  Uint8List? imageBytes,
  String? storageKey,
  SuspectRepository? repo,
  String? title,
}) {
  final hasBytes = imageBytes != null && imageBytes.isNotEmpty;
  final canLoad = storageKey != null &&
      storageKey.isNotEmpty &&
      repo != null;
  if (!hasBytes && !canLoad) return;

  context.pushSmooth(
    DossierPhotoViewerScreen(
      colors: colors,
      imageBytes: imageBytes,
      storageKey: storageKey,
      repo: repo,
      title: title,
    ),
    fullscreenDialog: true,
  );
}

/// Convenience using [AuthController] from context.
void openDossierPhotoViewerFromContext(
  BuildContext context, {
  Uint8List? imageBytes,
  String? storageKey,
  String? title,
}) {
  final auth = context.read<AuthController>();
  openDossierPhotoViewer(
    context,
    colors: auth.colors,
    imageBytes: imageBytes,
    storageKey: storageKey,
    repo: SuspectRepository(auth.api),
    title: title,
  );
}
