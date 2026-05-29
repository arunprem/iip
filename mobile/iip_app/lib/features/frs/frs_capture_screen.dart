import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../core/motion/iip_page_route.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/iip_colors.dart';
import '../../models/frs_match.dart';
import '../auth/auth_controller.dart';
import '../suspects/suspect_dossier_detail_screen.dart';
import '../suspects/suspect_repository.dart';
import 'frs_repository.dart';

/// Field face recognition — capture and match against submitted dossiers.
class FrsCaptureScreen extends StatefulWidget {
  const FrsCaptureScreen({super.key});

  @override
  State<FrsCaptureScreen> createState() => _FrsCaptureScreenState();
}

class _FrsCaptureScreenState extends State<FrsCaptureScreen> {
  late final FrsRepository _repo;
  late final SuspectRepository _photoRepo;
  final _picker = ImagePicker();

  Uint8List? _capture;
  FrsMatchResult? _result;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final api = context.read<AuthController>().api;
    _repo = FrsRepository(api);
    _photoRepo = SuspectRepository(api);
  }

  Future<void> _takePhoto() async {
    final file = await _picker.pickImage(
      source: ImageSource.camera,
      preferredCameraDevice: CameraDevice.rear,
      imageQuality: 88,
    );
    if (file == null || !mounted) return;
    final bytes = await file.readAsBytes();
    setState(() {
      _capture = bytes;
      _result = null;
      _error = null;
    });
    await _runMatch(bytes);
  }

  Future<void> _runMatch(Uint8List bytes) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await _repo.identifySuspect(bytes);
      if (!mounted) return;
      setState(() {
        _result = result;
        _busy = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _busy = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Face recognition failed. Check ML gateway is running on port 8020.';
        _busy = false;
      });
    }
  }

  Future<void> _openMatch(FrsFaceMatch match, {Uint8List? heroBytes}) async {
    final colors = context.read<AuthController>().colors;
    var dossierId = match.dossierId;
    if (dossierId == null || dossierId.isEmpty) {
      dossierId = await _repo.resolveDossierId(match);
      match.dossierId = dossierId;
    }
    if (!mounted) return;
    if (dossierId == null || dossierId.isEmpty) {
      _showFrsMessage(
        context,
        colors: colors,
        message: 'No dossier record found for this match.',
        isError: true,
      );
      return;
    }
    context.pushSmooth(
      SuspectDossierDetailScreen(
        dossierId: dossierId,
        heroImageBytes: heroBytes,
      ),
    );
  }

  void _showFrsMessage(
    BuildContext context, {
    required IipColors colors,
    required String message,
    bool isError = false,
  }) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          message,
          style: TextStyle(
            color: isError ? Colors.white : colors.text,
            fontWeight: FontWeight.w500,
          ),
        ),
        backgroundColor: isError ? colors.error : colors.surface,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: BorderSide(
            color: isError ? colors.error : colors.border,
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.watch<AuthController>().colors;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: colors.bg,
        foregroundColor: colors.text,
        surfaceTintColor: Colors.transparent,
        title: Text('Field FRS', style: TextStyle(color: colors.text)),
        elevation: 0,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          Text(
            'Capture a suspect photo to search the intelligence face index.',
            style: TextStyle(color: colors.textMuted, height: 1.4),
          ),
          const SizedBox(height: 20),
          if (_capture != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: AspectRatio(
                aspectRatio: 3 / 4,
                child: Image.memory(_capture!, fit: BoxFit.cover),
              ),
            )
          else
            Container(
              height: 220,
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: colors.border),
              ),
              child: Center(
                child: Icon(
                  Icons.face_retouching_natural,
                  size: 64,
                  color: colors.primary.withValues(alpha: 0.85),
                ),
              ),
            ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _busy ? null : _takePhoto,
            icon: const Icon(Icons.camera_alt_rounded),
            label: Text(_capture == null ? 'Take photo & search' : 'Retake & search'),
            style: FilledButton.styleFrom(
              backgroundColor: colors.primary,
              minimumSize: const Size.fromHeight(48),
            ),
          ),
          if (_busy) ...[
            const SizedBox(height: 24),
            Center(child: CircularProgressIndicator(color: colors.primary)),
            const SizedBox(height: 8),
            Text(
              'Analysing face — this may take up to a minute…',
              textAlign: TextAlign.center,
              style: TextStyle(color: colors.textMuted, fontSize: 13),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 16),
            _FrsErrorBanner(colors: colors, message: _error!),
          ],
          if (_result != null) ...[
            const SizedBox(height: 24),
            _ResultsPanel(
              colors: colors,
              result: _result!,
              photoRepo: _photoRepo,
              onOpenMatch: _openMatch,
            ),
          ],
        ],
      ),
    );
  }
}

class _FrsErrorBanner extends StatelessWidget {
  const _FrsErrorBanner({required this.colors, required this.message});

  final IipColors colors;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: colors.error.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colors.error.withValues(alpha: 0.45)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline_rounded, color: colors.error, size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: colors.error,
                fontSize: 14,
                height: 1.35,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ResultsPanel extends StatelessWidget {
  const _ResultsPanel({
    required this.colors,
    required this.result,
    required this.photoRepo,
    required this.onOpenMatch,
  });

  final IipColors colors;
  final FrsMatchResult result;
  final SuspectRepository photoRepo;
  final Future<void> Function(FrsFaceMatch match, {Uint8List? heroBytes}) onOpenMatch;

  @override
  Widget build(BuildContext context) {
    if (!result.faceDetected) {
      return Text(
        result.message ?? 'No face detected.',
        style: TextStyle(color: colors.warning),
      );
    }
    if (result.matches.isEmpty) {
      return Text(
        result.message ?? 'No matches found.',
        style: TextStyle(color: colors.textMuted),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Matches',
          style: TextStyle(
            color: colors.text,
            fontWeight: FontWeight.w700,
            fontSize: 16,
          ),
        ),
        const SizedBox(height: 10),
        for (final match in result.matches)
          _MatchCard(
            colors: colors,
            match: match,
            photoRepo: photoRepo,
            onTap: (heroBytes) => onOpenMatch(match, heroBytes: heroBytes),
          ),
      ],
    );
  }
}

class _MatchCard extends StatefulWidget {
  const _MatchCard({
    required this.colors,
    required this.match,
    required this.photoRepo,
    required this.onTap,
  });

  final IipColors colors;
  final FrsFaceMatch match;
  final SuspectRepository photoRepo;
  final Future<void> Function(Uint8List? heroBytes) onTap;

  @override
  State<_MatchCard> createState() => _MatchCardState();
}

class _MatchCardState extends State<_MatchCard> {
  Uint8List? _photoBytes;
  bool _loadingPhoto = false;
  bool _opening = false;

  @override
  void initState() {
    super.initState();
    _loadPhoto();
  }

  Future<void> _loadPhoto() async {
    final key = widget.match.storageKey;
    if (key == null || key.isEmpty) return;
    setState(() => _loadingPhoto = true);
    final bytes = await widget.photoRepo.fetchPhotoBytes(key);
    if (mounted) {
      setState(() {
        _photoBytes = bytes;
        _loadingPhoto = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = widget.colors;
    final match = widget.match;
    final name = match.criminalName ?? 'Unknown subject';

    return Card(
      color: colors.surface,
      margin: const EdgeInsets.only(bottom: 10),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: colors.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: _opening
            ? null
            : () async {
                setState(() => _opening = true);
                try {
                  await widget.onTap(_photoBytes);
                } finally {
                  if (mounted) setState(() => _opening = false);
                }
              },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: SizedBox(
                  width: 56,
                  height: 56,
                  child: _photoBytes != null
                      ? Image.memory(_photoBytes!, fit: BoxFit.cover)
                      : ColoredBox(
                          color: colors.surfaceHover,
                          child: _loadingPhoto
                              ? Center(
                                  child: SizedBox(
                                    width: 22,
                                    height: 22,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: colors.primary,
                                    ),
                                  ),
                                )
                              : Icon(Icons.person_outline, color: colors.textMuted, size: 28),
                        ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: colors.text,
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: colors.primary.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        '${match.matchPercent}% similarity',
                        style: TextStyle(
                          color: colors.primary,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              if (_opening)
                SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: colors.primary,
                  ),
                )
              else
                Icon(Icons.chevron_right_rounded, color: colors.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}
