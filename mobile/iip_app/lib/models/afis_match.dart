class AfisMatchResult {
  AfisMatchResult({
    required this.matches,
    this.bestMatch,
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
    return AfisMatchResult(
      matches: matches,
      bestMatch: bestRaw is Map<String, dynamic>
          ? AfisFingerprintMatch.fromJson(bestRaw)
          : (matches.isNotEmpty ? matches.first : null),
    );
  }

  final List<AfisFingerprintMatch> matches;
  final AfisFingerprintMatch? bestMatch;
}

class AfisFingerprintMatch {
  AfisFingerprintMatch({
    required this.printId,
    required this.similarityScore,
    required this.fingerPosition,
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
  String? dossierId;

  int get matchPercent => (similarityScore * 100).clamp(0, 100).round();

  String get displayName =>
      (criminalName != null && criminalName!.trim().isNotEmpty)
          ? criminalName!.trim()
          : 'Unnamed suspect';
}
