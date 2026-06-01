import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import 'package:provider/provider.dart';

import '../../core/motion/iip_page_route.dart';
import '../../core/theme/iip_colors.dart';
import '../../models/frs_live_match.dart';
import '../auth/auth_controller.dart';
import '../suspects/suspect_dossier_detail_screen.dart';
import '../suspects/suspect_repository.dart';
import 'frs_repository.dart';
import 'utils/frs_live_frame_util.dart';
import 'utils/frs_overlay_mapper.dart';

/// Live multi-face FRS — camera preview, overlays, and throttled backend matching.
class FrsLiveScreen extends StatefulWidget {
  const FrsLiveScreen({super.key});

  @override
  State<FrsLiveScreen> createState() => _FrsLiveScreenState();
}

class _FrsLiveScreenState extends State<FrsLiveScreen> {
  // ── Adaptive scan gap ─────────────────────────────────────────────────────
  // Starts at 300ms; backs off to 1 500ms when the backend is slow,
  // ramps back when fast. Prevents scan-storms on weak networks.
  static const Duration _minGap = Duration(milliseconds: 300);
  static const Duration _maxGap = Duration(milliseconds: 1500);
  static const Duration _backoffStep = Duration(milliseconds: 200);
  static const Duration _recoverStep = Duration(milliseconds: 100);
  Duration _currentGap = _minGap;

  CameraController? _camera;
  late final FrsRepository _repo;
  late final SuspectRepository _photoRepo;

  // MLKit detector — fast local pre-filter to skip backend calls for empty frames.
  late final FaceDetector _localDetector;

  bool _initializing = true;
  String? _initError;

  FrsLiveScanResult? _lastScan;
  int _lastImageWidth = 0;
  int _lastImageHeight = 0;
  bool _scanInFlight = false;
  bool _scanLoopActive = false;
  String? _scanStatus;
  final Map<String, Uint8List> _thumbCache = {};
  // Guard set — prevents two concurrent fetches for the same storage key.
  final Set<String> _thumbFetchInFlight = {};
  final List<FrsLiveFaceMatch> _pinnedMatches = [];

  // Latest raw camera bytes from the image stream; replaced on every frame.
  Uint8List? _latestFrameBytes;
  // Guards against the image-stream callback firing after dispose.
  bool _streamActive = false;

  @override
  void initState() {
    super.initState();
    final api = context.read<AuthController>().api;
    _repo = FrsRepository(api);
    _photoRepo = SuspectRepository(api);
    _localDetector = FaceDetector(
      options: FaceDetectorOptions(
        performanceMode: FaceDetectorMode.fast,
        enableClassification: false,
        enableLandmarks: false,
        enableContours: false,
        enableTracking: false,
        minFaceSize: 0.10, // ignore very small faces
      ),
    );
    _initCamera();
  }

  // ── Camera initialisation ─────────────────────────────────────────────────

  Future<void> _initCamera() async {
    try {
      final cameras = await availableCameras();
      final back = cameras.where((c) => c.lensDirection == CameraLensDirection.back);
      final camera = back.isNotEmpty ? back.first : cameras.first;

      final controller = CameraController(
        camera,
        // medium = ~720p; sufficient for server face detection and much smaller payload.
        ResolutionPreset.medium,
        enableAudio: false,
        imageFormatGroup:
            Platform.isIOS ? ImageFormatGroup.bgra8888 : ImageFormatGroup.jpeg,
      );
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }

      _camera = controller;
      _streamActive = true;

      // Start the image stream — frames arrive directly in memory, no disk I/O.
      await controller.startImageStream(_onCameraFrame);

      _scanLoopActive = true;
      setState(() {
        _initializing = false;
        _scanStatus = 'Point camera at faces…';
      });

      // Kick off the scan loop with a small initial delay so the preview settles.
      Future.delayed(const Duration(milliseconds: 400), _runScan);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _initializing = false;
        _initError = 'Camera unavailable: $e';
      });
    }
  }

  /// Image-stream callback — runs on a platform thread, NOT the UI isolate.
  /// We only keep the latest frame; the scan loop picks it up when ready.
  void _onCameraFrame(CameraImage frame) {
    if (!_streamActive) return;
    // Convert CameraImage → JPEG bytes (Android delivers JPEG natively;
    // on iOS we receive BGRA which we treat as raw bytes and let MLKit handle).
    final planes = frame.planes;
    if (planes.isEmpty) return;
    // For both JPEG (Android) and BGRA (iOS), plane[0].bytes is usable.
    _latestFrameBytes = planes[0].bytes;
  }

  // ── Scan loop ─────────────────────────────────────────────────────────────

  Future<void> _runScan() async {
    final controller = _camera;
    if (!_scanLoopActive ||
        !mounted ||
        controller == null ||
        !controller.value.isInitialized ||
        _scanInFlight) {
      return;
    }

    final frameBytes = _latestFrameBytes;
    if (frameBytes == null) {
      // No frame yet — retry after minimum gap.
      if (_scanLoopActive && mounted) {
        Future.delayed(_minGap, _runScan);
      }
      return;
    }

    _scanInFlight = true;
    if (mounted) setState(() => _scanStatus = 'Scanning…');

    final sw = Stopwatch()..start();
    try {
      // ── Step 1: local MLKit pre-filter ─────────────────────────────────
      // Stop image stream temporarily so takePicture works cleanly on iOS
      // (not needed on Android, but harmless).
      final hasFacesLocally = await _quickLocalFaceCheck(frameBytes, controller);
      if (!hasFacesLocally) {
        if (mounted) {
          setState(() {
            _lastScan = null;
            _lastImageWidth = 0;
            _lastImageHeight = 0;
            _scanStatus = _pinnedMatches.isEmpty
                ? 'Point camera at faces…'
                : 'No faces in view · ${_pinnedMatches.length} saved match(es)';
          });
        }
        return; // skip backend — no faces visible
      }

      // ── Step 2: take picture (clean JPEG capture) ──────────────────────
      // Pause the stream, take the picture, then resume.
      await controller.stopImageStream();
      _streamActive = false;

      final file = await controller.takePicture();
      final rawBytes = await file.readAsBytes();

      // ── Step 3: compress in isolate (non-blocking) ─────────────────────
      final compressed = await compressLiveFrameAsync(rawBytes);

      // ── Step 4: send to backend ────────────────────────────────────────
      final result = await _repo.identifyLiveFrame(compressed);

      if (!mounted) return;

      final hasFaces = result.faces.isNotEmpty;
      setState(() {
        _lastScan = hasFaces ? result : null;
        _lastImageWidth = hasFaces ? result.imageWidth : 0;
        _lastImageHeight = hasFaces ? result.imageHeight : 0;
        if (hasFaces) _mergePinnedMatches(result.highConfidenceMatches);
        _scanStatus = _buildScanStatus(result, hasFaces);
      });

      if (hasFaces) {
        unawaited(_repo.enrichLiveMatches(result).then((_) {
          if (!mounted) return;
          setState(() => _mergePinnedMatches(result.highConfidenceMatches));
        }));
        unawaited(_loadThumbsForMatches(result.highConfidenceMatches));
        unawaited(_loadThumbsForMatches(_pinnedMatches));
      }

      // ── Adaptive gap: reward fast backend, penalise slow ───────────────
      final elapsed = sw.elapsed;
      if (elapsed.inMilliseconds < 800) {
        // Backend was fast — gradually recover towards minimum gap.
        _currentGap = _currentGap > _minGap
            ? Duration(milliseconds: (_currentGap - _recoverStep).inMilliseconds.clamp(
                _minGap.inMilliseconds, _maxGap.inMilliseconds))
            : _minGap;
      } else {
        // Backend was slow — back off.
        _currentGap = Duration(milliseconds: (_currentGap + _backoffStep).inMilliseconds.clamp(
            _minGap.inMilliseconds, _maxGap.inMilliseconds));
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _lastScan = null;
        _lastImageWidth = 0;
        _lastImageHeight = 0;
        _scanStatus = 'Scan failed — will retry';
      });
      // Back off on error.
      _currentGap = Duration(milliseconds: (_currentGap + _backoffStep).inMilliseconds.clamp(
          _minGap.inMilliseconds, _maxGap.inMilliseconds));
    } finally {
      _scanInFlight = false;
      sw.stop();

      // Resume the image stream for the next cycle.
      if (_scanLoopActive && mounted && _camera != null) {
        try {
          await _camera!.startImageStream(_onCameraFrame);
          _streamActive = true;
        } catch (_) {}
      }

      if (_scanLoopActive && mounted) {
        Future.delayed(_currentGap, _runScan);
      }
    }
  }

  /// Fast MLKit face presence check — typically 5–15ms, runs before sending
  /// any bytes to the network. Returns true if ≥1 face is detected.
  Future<bool> _quickLocalFaceCheck(
      Uint8List bytes, CameraController controller) async {
    try {
      final size = controller.value.previewSize;
      if (size == null) return true; // unknown — optimistically proceed

      final inputImage = InputImage.fromBytes(
        bytes: bytes,
        metadata: InputImageMetadata(
          size: Size(size.width, size.height),
          rotation: InputImageRotation.rotation0deg,
          format: Platform.isIOS
              ? InputImageFormat.bgra8888
              : InputImageFormat.nv21,
          bytesPerRow: controller.value.previewSize?.width.toInt() ?? 0,
        ),
      );
      final faces = await _localDetector.processImage(inputImage);
      return faces.isNotEmpty;
    } catch (_) {
      // On any error fall through to backend — don't silently drop frames.
      return true;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  String _matchKey(FrsLiveFaceMatch face) {
    final match = face.match;
    if (match == null) return '';
    if (match.faceId.isNotEmpty) return match.faceId;
    final dossierId = match.dossierId?.trim();
    if (dossierId != null && dossierId.isNotEmpty) return 'd:$dossierId';
    final suspectId = match.suspectId?.trim();
    if (suspectId != null && suspectId.isNotEmpty) return 's:$suspectId';
    final storageKey = match.storageKey?.trim();
    if (storageKey != null && storageKey.isNotEmpty) return 'k:$storageKey';
    return '';
  }

  void _mergePinnedMatches(List<FrsLiveFaceMatch> matches) {
    for (final face in matches) {
      if (!face.isHighConfidenceMatch) continue;
      final key = _matchKey(face);
      if (key.isEmpty) continue;

      final index = _pinnedMatches.indexWhere((p) => _matchKey(p) == key);
      if (index >= 0) {
        if (face.matchPercent >= _pinnedMatches[index].matchPercent) {
          _pinnedMatches[index] = face;
        }
      } else {
        _pinnedMatches.add(face);
      }
    }
  }

  String _buildScanStatus(FrsLiveScanResult result, bool hasFaces) {
    if (hasFaces) {
      final live = result.highConfidenceMatches.length;
      final pinned = _pinnedMatches.length;
      if (live > 0) {
        return '${result.faces.length} face(s) · $live live match(es) · $pinned saved';
      }
      return '${result.faces.length} face(s) · $pinned saved match(es)';
    }
    if (_pinnedMatches.isNotEmpty) {
      return 'No faces in view · ${_pinnedMatches.length} saved match(es)';
    }
    return result.message ?? 'No faces in view';
  }

  void _removePinnedMatch(String key) {
    setState(() {
      _pinnedMatches.removeWhere((face) => _matchKey(face) == key);
      if (_lastScan == null) {
        _scanStatus = _pinnedMatches.isEmpty
            ? 'Point camera at faces…'
            : 'No faces in view · ${_pinnedMatches.length} saved match(es)';
      }
    });
  }

  Future<void> _loadThumbsForMatches(List<FrsLiveFaceMatch> matches) async {
    for (final face in matches) {
      final match = face.match;
      final key = match?.storageKey;
      if (key == null || key.isEmpty) continue;
      // Skip if already cached OR already fetching (deduplication guard).
      if (_thumbCache.containsKey(key) || _thumbFetchInFlight.contains(key)) continue;
      _thumbFetchInFlight.add(key);
      try {
        final bytes = await _photoRepo.fetchPhotoBytes(key);
        if (bytes != null && mounted) {
          setState(() => _thumbCache[key] = bytes);
        }
      } finally {
        _thumbFetchInFlight.remove(key);
      }
    }
  }

  void _openMatch(FrsLiveFaceMatch face) {
    final match = face.match;
    final dossierId = match?.dossierId;
    if (dossierId == null || dossierId.isEmpty) return;
    final key = match?.storageKey;
    context.pushSmooth(
      SuspectDossierDetailScreen(
        dossierId: dossierId,
        heroImageBytes: key != null ? _thumbCache[key] : null,
      ),
    );
  }

  @override
  void dispose() {
    _scanLoopActive = false;
    _streamActive = false;
    _localDetector.close();
    _camera?.dispose();
    super.dispose();
  }

  // ── UI ────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final colors = context.watch<AuthController>().colors;
    final camera = _camera;

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text('Live FRS'),
        actions: [
          if (!_scanInFlight && camera != null)
            IconButton(
              icon: const Icon(Icons.refresh_rounded),
              tooltip: 'Scan now',
              onPressed: _runScan,
            ),
        ],
      ),
      body: _initializing
          ? const Center(child: CircularProgressIndicator())
          : _initError != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      _initError!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.white70),
                    ),
                  ),
                )
              : Column(
                  children: [
                    Expanded(
                      child: LayoutBuilder(
                        builder: (context, constraints) {
                          final previewSize = Size(
                            constraints.maxWidth,
                            constraints.maxHeight,
                          );
                          return Stack(
                            fit: StackFit.expand,
                            children: [
                              _CameraPreviewLayer(controller: camera!),
                              if (_lastScan != null &&
                                  _lastScan!.faces.isNotEmpty &&
                                  _lastImageWidth > 0)
                                Positioned.fill(
                                  child: _FaceOverlayLayer(
                                    faces: _lastScan!.faces,
                                    previewSize: previewSize,
                                    imageWidth: _lastImageWidth,
                                    imageHeight: _lastImageHeight,
                                  ),
                                ),
                              // Scanning indicator — small, non-intrusive
                              if (_scanInFlight)
                                Positioned(
                                  top: 72,
                                  right: 12,
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 10, vertical: 6),
                                    decoration: BoxDecoration(
                                      color: Colors.black54,
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: const Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        SizedBox(
                                          width: 14,
                                          height: 14,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                            color: Colors.white,
                                          ),
                                        ),
                                        SizedBox(width: 8),
                                        Text(
                                          'Scanning…',
                                          style: TextStyle(
                                              color: Colors.white, fontSize: 11),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              // Adaptive gap indicator (dev helper — shows current latency mode)
                              if (_scanInFlight && _currentGap > _minGap)
                                Positioned(
                                  top: 72,
                                  left: 12,
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: Colors.orange.withValues(alpha: 0.7),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: Text(
                                      'Slow network (${_currentGap.inMilliseconds}ms gap)',
                                      style: const TextStyle(
                                          color: Colors.white, fontSize: 10),
                                    ),
                                  ),
                                ),
                              Positioned(
                                top: 12,
                                left: 12,
                                right: 12,
                                child: _LegendBar(scanStatus: _scanStatus),
                              ),
                            ],
                          );
                        },
                      ),
                    ),
                    _MatchTray(
                      colors: colors,
                      matches: _pinnedMatches,
                      thumbCache: _thumbCache,
                      onTap: _openMatch,
                      onRemove: _removePinnedMatch,
                      matchKey: _matchKey,
                    ),
                  ],
                ),
    );
  }
}

// ── Supporting widgets (unchanged logic, preserved exactly) ──────────────────

class _CameraPreviewLayer extends StatelessWidget {
  const _CameraPreviewLayer({required this.controller});

  final CameraController controller;

  @override
  Widget build(BuildContext context) {
    return ClipRect(
      child: FittedBox(
        fit: BoxFit.cover,
        child: SizedBox(
          width: controller.value.previewSize?.height ?? 1,
          height: controller.value.previewSize?.width ?? 1,
          child: CameraPreview(controller),
        ),
      ),
    );
  }
}

class _LegendBar extends StatelessWidget {
  const _LegendBar({this.scanStatus});

  final String? scanStatus;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.black54,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (scanStatus != null)
            Text(scanStatus!, style: const TextStyle(color: Colors.white, fontSize: 12)),
          const SizedBox(height: 4),
          const SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _LegendDot(color: Colors.redAccent, label: '≥72% match'),
                SizedBox(width: 12),
                _LegendDot(color: Colors.orangeAccent, label: '68–71% match'),
                SizedBox(width: 12),
                _LegendDot(color: Colors.greenAccent, label: 'Face, no match'),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LegendDot extends StatelessWidget {
  const _LegendDot({required this.color, required this.label});

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 10,
          height: 10,
          decoration:
              BoxDecoration(color: color, borderRadius: BorderRadius.circular(2)),
        ),
        const SizedBox(width: 6),
        Text(label, style: const TextStyle(color: Colors.white70, fontSize: 11)),
      ],
    );
  }
}

class _FaceOverlayLayer extends StatelessWidget {
  const _FaceOverlayLayer({
    required this.faces,
    required this.previewSize,
    required this.imageWidth,
    required this.imageHeight,
  });

  final List<FrsLiveFaceMatch> faces;
  final Size previewSize;
  final int imageWidth;
  final int imageHeight;

  @override
  Widget build(BuildContext context) {
    final mapper = FrsOverlayMapper(
      imageWidth: imageWidth,
      imageHeight: imageHeight,
      previewSize: previewSize,
    );
    final viewport = Offset.zero & previewSize;

    return Stack(
      clipBehavior: Clip.none,
      children: [
        for (final face in faces)
          if (_visibleRect(mapper.mapNormalized(face.x, face.y, face.w, face.h), viewport)
              case final rect?)
            Positioned.fromRect(
              rect: rect,
              child: IgnorePointer(
                child: _FaceBox(face: face, rect: rect),
              ),
            ),
      ],
    );
  }

  Rect? _visibleRect(Rect rect, Rect viewport) {
    if (rect.width < 16 || rect.height < 16) return null;
    final expanded = viewport.inflate(48);
    if (!rect.overlaps(expanded)) return null;
    return rect;
  }
}

class _FaceBox extends StatelessWidget {
  const _FaceBox({required this.face, required this.rect});

  final FrsLiveFaceMatch face;
  final Rect rect;

  @override
  Widget build(BuildContext context) {
    final isHighMatch = face.match != null && face.matchPercent >= 72;
    final isMediumMatch =
        face.match != null && face.matchPercent >= 68 && face.matchPercent < 72;
    final hasMatch = isHighMatch || isMediumMatch;

    final color = isHighMatch
        ? Colors.redAccent
        : isMediumMatch
            ? Colors.orangeAccent
            : Colors.greenAccent;

    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          decoration: BoxDecoration(
            border: Border.all(color: color, width: hasMatch ? 4.0 : 3.0),
          ),
        ),
        if (hasMatch)
          Positioned(
            left: 0,
            top: -22,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              color: Colors.black54,
              child: Text(
                '${face.matchPercent}%',
                style: TextStyle(
                  color: color,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _MatchTray extends StatelessWidget {
  const _MatchTray({
    required this.colors,
    required this.matches,
    required this.thumbCache,
    required this.onTap,
    required this.onRemove,
    required this.matchKey,
  });

  final IipColors colors;
  final List<FrsLiveFaceMatch> matches;
  final Map<String, Uint8List> thumbCache;
  final void Function(FrsLiveFaceMatch) onTap;
  final void Function(String key) onRemove;
  final String Function(FrsLiveFaceMatch face) matchKey;

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.paddingOf(context).bottom;
    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(12, 10, 12, 10 + bottom),
      color: colors.surface,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            matches.isEmpty
                ? 'Identified matches (≥$kFrsLiveMatchPercent%)'
                : 'Identified matches — tap to open, × to remove',
            style: TextStyle(
                color: colors.text, fontWeight: FontWeight.w600, fontSize: 13),
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 88,
            child: matches.isEmpty
                ? Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'Matches stay here after identification until you remove them.',
                      style: TextStyle(color: colors.textMuted, fontSize: 12),
                    ),
                  )
                : ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: matches.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 10),
                    itemBuilder: (context, i) {
                      final face = matches[i];
                      final match = face.match!;
                      final key = match.storageKey;
                      final bytes = key != null ? thumbCache[key] : null;
                      final id = matchKey(face);
                      return Material(
                        color: colors.surfaceHover,
                        borderRadius: BorderRadius.circular(12),
                        clipBehavior: Clip.antiAlias,
                        child: Stack(
                          clipBehavior: Clip.none,
                          children: [
                            InkWell(
                              onTap: () => onTap(face),
                              child: SizedBox(
                                width: 200,
                                child: Padding(
                                  padding: const EdgeInsets.all(8),
                                  child: Row(
                                    children: [
                                      ClipRRect(
                                        borderRadius: BorderRadius.circular(8),
                                        child: SizedBox(
                                          width: 52,
                                          height: 52,
                                          child: bytes != null
                                              ? Image.memory(bytes,
                                                  fit: BoxFit.cover)
                                              : ColoredBox(
                                                  color: colors.primary
                                                      .withValues(alpha: 0.1),
                                                  child: Icon(Icons.person,
                                                      color: colors.primary),
                                                ),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          mainAxisAlignment:
                                              MainAxisAlignment.center,
                                          children: [
                                            Text(
                                              match.criminalName ?? 'Unknown',
                                              maxLines: 2,
                                              overflow: TextOverflow.ellipsis,
                                              style: TextStyle(
                                                color: colors.text,
                                                fontWeight: FontWeight.w600,
                                                fontSize: 12,
                                              ),
                                            ),
                                            Text(
                                              '${face.matchPercent}% match',
                                              style: TextStyle(
                                                color: colors.error,
                                                fontSize: 11,
                                                fontWeight: FontWeight.w600,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                            Positioned(
                              top: 2,
                              right: 2,
                              child: Material(
                                color: colors.surface,
                                shape: const CircleBorder(),
                                elevation: 2,
                                child: InkWell(
                                  customBorder: const CircleBorder(),
                                  onTap: id.isEmpty ? null : () => onRemove(id),
                                  child: Padding(
                                    padding: const EdgeInsets.all(4),
                                    child: Icon(
                                      Icons.close_rounded,
                                      size: 16,
                                      color: colors.textMuted,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
