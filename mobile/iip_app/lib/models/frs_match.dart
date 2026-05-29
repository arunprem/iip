class FrsMatchResult {
  FrsMatchResult({
    required this.faceDetected,
    required this.faceCount,
    required this.detectedPose,
    required this.matches,
    this.message,
  });

  factory FrsMatchResult.fromJson(Map<String, dynamic> json) {
    final raw = json['matches'];
    return FrsMatchResult(
      faceDetected: json['face_detected'] as bool? ?? false,
      faceCount: json['face_count'] as int? ?? 0,
      detectedPose: json['detected_pose'] as String? ?? '',
      message: json['message'] as String?,
      matches: raw is List
          ? raw
              .whereType<Map<String, dynamic>>()
              .map(FrsFaceMatch.fromJson)
              .toList()
          : [],
    );
  }

  final bool faceDetected;
  final int faceCount;
  final String detectedPose;
  final String? message;
  final List<FrsFaceMatch> matches;
}

class FrsFaceMatch {
  FrsFaceMatch({
    required this.faceId,
    required this.similarityScore,
    this.photoId,
    this.suspectId,
    this.dossierDraftId,
    this.criminalName,
    this.storageKey,
    this.dossierId,
  });

  factory FrsFaceMatch.fromJson(Map<String, dynamic> json) {
    return FrsFaceMatch(
      faceId: json['face_id'] as String? ?? '',
      photoId: json['photo_id'] as String?,
      suspectId: json['suspect_id'] as String?,
      dossierDraftId: json['dossier_draft_id'] as String?,
      criminalName: json['criminal_name'] as String?,
      storageKey: json['storage_key'] as String?,
      similarityScore: (json['similarity_score'] as num?)?.toDouble() ?? 0,
      dossierId: json['dossier_id'] as String?,
    );
  }

  final String faceId;
  final String? photoId;
  final String? suspectId;
  final String? dossierDraftId;
  final String? criminalName;
  final String? storageKey;
  final double similarityScore;
  String? dossierId;

  int get matchPercent => (similarityScore * 100).clamp(0, 100).round();
}
