class AfisProbeQuality {
  AfisProbeQuality({
    required this.grade,
    required this.message,
    required this.templateBytes,
    required this.minutiaeCount,
    required this.ok,
  });

  factory AfisProbeQuality.fromJson(Map<String, dynamic> json) {
    return AfisProbeQuality(
      grade: json['grade'] as String? ?? 'fair',
      message: json['message'] as String? ?? '',
      templateBytes: (json['template_bytes'] as num?)?.toInt() ??
          (json['templateBytes'] as num?)?.toInt() ??
          0,
      minutiaeCount: (json['minutiae_count'] as num?)?.toInt() ??
          (json['minutiaeCount'] as num?)?.toInt() ??
          0,
      ok: json['ok'] as bool? ?? true,
    );
  }

  final String grade;
  final String message;
  final int templateBytes;
  final int minutiaeCount;
  final bool ok;
}

class AfisMatchResult {
  AfisMatchResult({
    required this.matches,
    this.bestMatch,
    this.probeQuality,
  });

  factory AfisMatchResult.fromJson(Map<String, dynamic> json) {
    final raw = json['matches'];
    final matches = raw is List
        ? raw
            .whereType<Map<String, dynamic>>()
            .map(AfisFingerprintMatch.fromJson)
            .toList()
        : <AfisFingerprintMatch>[];
    final bestRaw = json['best_match'] ?? json['bestMatch'];
    final qualityRaw = json['probe_quality'] ?? json['probeQuality'];
    return AfisMatchResult(
      matches: matches,
      bestMatch: bestRaw is Map<String, dynamic>
          ? AfisFingerprintMatch.fromJson(bestRaw)
          : (matches.isNotEmpty ? matches.first : null),
      probeQuality: qualityRaw is Map<String, dynamic>
          ? AfisProbeQuality.fromJson(qualityRaw)
          : null,
    );
  }

  final List<AfisFingerprintMatch> matches;
  final AfisFingerprintMatch? bestMatch;
  final AfisProbeQuality? probeQuality;
}

class AfisFingerprintMatch {
  AfisFingerprintMatch({
    required this.printId,
    required this.similarityScore,
    required this.fingerPosition,
    this.displaySimilarityScore,
    this.matchConfidence,
    this.templateId,
    this.suspectId,
    this.dossierDraftId,
    this.criminalName,
    this.dossierId,
  });

  factory AfisFingerprintMatch.fromJson(Map<String, dynamic> json) {
    return AfisFingerprintMatch(
      printId: json['print_id'] as String? ?? '',
      templateId: json['template_id'] as String?,
      suspectId: json['suspect_id'] as String?,
      dossierDraftId: json['dossier_draft_id'] as String?,
      criminalName: json['criminal_name'] as String?,
      fingerPosition: json['finger_position'] as String? ?? 'RIGHT_THUMB',
      similarityScore: (json['similarity_score'] as num?)?.toDouble() ?? 0,
      displaySimilarityScore:
          (json['display_similarity_score'] as num?)?.toDouble(),
      matchConfidence: json['match_confidence'] as String?,
      dossierId: json['dossier_id'] as String?,
    );
  }

  final String printId;
  final String? templateId;
  final String? suspectId;
  final String? dossierDraftId;
  final String? criminalName;
  final String fingerPosition;
  final double similarityScore;
  final double? displaySimilarityScore;
  final String? matchConfidence;
  String? dossierId;

  double get effectiveScore => displaySimilarityScore ?? similarityScore;

  int get matchPercent => (effectiveScore * 100).clamp(0, 100).round();

  String get confidenceLabel {
    switch (matchConfidence) {
      case 'strong':
        return 'Strong match';
      case 'moderate':
        return 'Match';
      case 'weak':
        return 'Weak match';
      default:
        return matchPercent >= 70 ? 'Match' : 'Possible match';
    }
  }

  String get displayName =>
      (criminalName != null && criminalName!.trim().isNotEmpty)
          ? criminalName!.trim()
          : 'Unnamed suspect';
}
