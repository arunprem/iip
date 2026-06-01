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
import 'frs_photo_crop_screen.dart';
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

    if (!mounted) return;
    final colors = context.read<AuthController>().colors;

    final croppedBytes = await context.pushSmooth<Uint8List>(
      FrsPhotoCropScreen(
        imageBytes: bytes,
        colors: colors,
      ),
    );
    if (croppedBytes == null || !mounted) return;

    setState(() {
      _capture = croppedBytes;
      _result = null;
      _error = null;
    });
    await _runMatch(croppedBytes);
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
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Image.memory(_capture!, fit: BoxFit.cover),
                    if (_busy) const _AiScanningOverlay(),
                  ],
                ),
              ),
            )
          else
            _ModernAiPlaceholder(colors: colors),
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

/// Futuristic AI glowing grid and scanning bar overlay for active searches.
class _AiScanningOverlay extends StatefulWidget {
  const _AiScanningOverlay();

  @override
  State<_AiScanningOverlay> createState() => _AiScanningOverlayState();
}

class _AiScanningOverlayState extends State<_AiScanningOverlay>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Stack(
          children: [
            Positioned.fill(
              child: ColoredBox(
                color: Colors.black.withValues(alpha: 0.35),
              ),
            ),
            const _GridCorners(),
            Align(
              alignment: Alignment(0.0, _controller.value * 2 - 1),
              child: Container(
                width: double.infinity,
                height: 4,
                decoration: BoxDecoration(
                  boxShadow: [
                    BoxShadow(
                      color: Colors.cyanAccent.withValues(alpha: 0.85),
                      blurRadius: 16,
                      spreadRadius: 3,
                    ),
                  ],
                  gradient: const LinearGradient(
                    colors: [
                      Colors.transparent,
                      Colors.cyanAccent,
                      Colors.transparent,
                    ],
                    stops: [0.0, 0.5, 1.0],
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _GridCorners extends StatelessWidget {
  const _GridCorners();

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: CustomPaint(
        painter: _GridCornerPainter(),
      ),
    );
  }
}

class _GridCornerPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.cyanAccent
      ..strokeWidth = 3
      ..style = PaintingStyle.stroke;

    const length = 20.0;

    canvas.drawLine(Offset.zero, const Offset(length, 0), paint);
    canvas.drawLine(Offset.zero, const Offset(0, length), paint);

    canvas.drawLine(Offset(size.width, 0), Offset(size.width - length, 0), paint);
    canvas.drawLine(Offset(size.width, 0), Offset(size.width, length), paint);

    canvas.drawLine(Offset(0, size.height), Offset(length, size.height), paint);
    canvas.drawLine(Offset(0, size.height), Offset(0, size.height - length), paint);

    canvas.drawLine(Offset(size.width, size.height), Offset(size.width - length, size.height), paint);
    canvas.drawLine(Offset(size.width, size.height), Offset(size.width, size.height - length), paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// A modern biometric AI scan target placeholder for portrait captures.
class _ModernAiPlaceholder extends StatelessWidget {
  const _ModernAiPlaceholder({required this.colors});

  final IipColors colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 280,
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: colors.border, width: 1.5),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            colors.surface,
            colors.surfaceHover.withValues(alpha: 0.85),
          ],
        ),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: Stack(
          children: [
            Positioned.fill(
              child: CustomPaint(
                painter: _BiometricGridPainter(color: colors.primary.withValues(alpha: 0.08)),
              ),
            ),
            Positioned.fill(
              child: CustomPaint(
                painter: _ViewfinderPainter(color: colors.primary),
              ),
            ),
            Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 76,
                    height: 76,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: colors.primary.withValues(alpha: 0.08),
                      border: Border.all(
                        color: colors.primary.withValues(alpha: 0.35),
                        width: 1.5,
                      ),
                    ),
                    child: Center(
                      child: Icon(
                        Icons.face_unlock_rounded,
                        size: 38,
                        color: colors.primary,
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  Text(
                    'AI BIOMETRIC CAPTURE',
                    style: TextStyle(
                      color: colors.text,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.8,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Position face in the center frame',
                    style: TextStyle(
                      color: colors.textMuted,
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BiometricGridPainter extends CustomPainter {
  const _BiometricGridPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke;

    const step = 24.0;
    for (double y = 0; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
    for (double x = 0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }

    final center = Offset(size.width / 2, size.height / 2);
    canvas.drawCircle(center, 90, paint);
    canvas.drawCircle(center, 130, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _ViewfinderPainter extends CustomPainter {
  const _ViewfinderPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color.withValues(alpha: 0.75)
      ..strokeWidth = 3
      ..style = PaintingStyle.stroke;

    const margin = 20.0;
    const length = 16.0;

    const left = margin;
    const top = margin;
    final right = size.width - margin;
    final bottom = size.height - margin;

    canvas.drawLine(Offset(left, top), Offset(left + length, top), paint);
    canvas.drawLine(Offset(left, top), Offset(left, top + length), paint);

    canvas.drawLine(Offset(right, top), Offset(right - length, top), paint);
    canvas.drawLine(Offset(right, top), Offset(right, top + length), paint);

    canvas.drawLine(Offset(left, bottom), Offset(left + length, bottom), paint);
    canvas.drawLine(Offset(left, bottom), Offset(left, bottom - length), paint);

    canvas.drawLine(Offset(right, bottom), Offset(right - length, bottom), paint);
    canvas.drawLine(Offset(right, bottom), Offset(right, bottom - length), paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
