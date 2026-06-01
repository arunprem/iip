import 'frs_match.dart';

/// Minimum match % for live FRS red box and bottom tray.
const kFrsLiveMatchPercent = 75;

/// One face detected in a live camera frame (server-side detection + match).
class FrsLiveFaceMatch {
  FrsLiveFaceMatch({
    required this.faceIndex,
    required this.x,
    required this.y,
    required this.w,
    required this.h,
    required this.qualityScore,
    required this.matched,
    this.similarityScore,
    this.match,
  });

  factory FrsLiveFaceMatch.fromJson(Map<String, dynamic> json) {
    final matchJson = json['match'];
    return FrsLiveFaceMatch(
      faceIndex: json['face_index'] as int? ?? 0,
      x: (json['x'] as num?)?.toDouble() ?? 0,
      y: (json['y'] as num?)?.toDouble() ?? 0,
      w: (json['w'] as num?)?.toDouble() ?? 0,
      h: (json['h'] as num?)?.toDouble() ?? 0,
      qualityScore: (json['quality_score'] as num?)?.toDouble() ?? 0,
      matched: json['matched'] as bool? ?? false,
      similarityScore: (json['similarity_score'] as num?)?.toDouble(),
      match: matchJson is Map<String, dynamic>
          ? FrsFaceMatch.fromJson(matchJson)
          : null,
    );
  }

  final int faceIndex;
  final double x;
  final double y;
  final double w;
  final double h;
  final double qualityScore;
  final bool matched;
  final double? similarityScore;
  final FrsFaceMatch? match;

  int get matchPercent =>
      similarityScore == null ? 0 : (similarityScore! * 100).clamp(0, 100).round();

  bool get isHighConfidenceMatch =>
      matchPercent >= kFrsLiveMatchPercent && match != null;
}

class FrsLiveScanResult {
  FrsLiveScanResult({
    required this.imageWidth,
    required this.imageHeight,
    required this.faces,
    this.message,
  });

  factory FrsLiveScanResult.fromJson(Map<String, dynamic> json) {
    final raw = json['faces'];
    return FrsLiveScanResult(
      imageWidth: json['image_width'] as int? ?? 0,
      imageHeight: json['image_height'] as int? ?? 0,
      message: json['message'] as String?,
      faces: raw is List
          ? raw
              .whereType<Map<String, dynamic>>()
              .map(FrsLiveFaceMatch.fromJson)
              .toList()
          : [],
    );
  }

  final int imageWidth;
  final int imageHeight;
  final List<FrsLiveFaceMatch> faces;
  final String? message;

  List<FrsLiveFaceMatch> get highConfidenceMatches =>
      faces.where((f) => f.isHighConfidenceMatch).toList(growable: false);
}
