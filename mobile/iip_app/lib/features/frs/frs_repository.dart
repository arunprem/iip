import 'dart:typed_data';

import '../../core/network/api_client.dart';
import '../../models/frs_live_match.dart';
import '../../models/frs_match.dart';

class FrsRepository {
  FrsRepository(this._api);

  final ApiClient _api;

  static const Duration liveScanTimeout = Duration(seconds: 90);

  Future<FrsLiveScanResult> identifyLiveFrame(Uint8List imageBytes) async {
    final json = await _api.uploadMultipartMl(
      '/faces/identify-multi',
      'file',
      imageBytes,
      'live-frame.jpg',
      timeout: liveScanTimeout,
    );
    return FrsLiveScanResult.fromJson(json);
  }

  /// Resolve dossier ids for matches (parallel) — run after overlays are shown.
  Future<void> enrichLiveMatches(FrsLiveScanResult result) async {
    final matches = result.faces
        .map((f) => f.match)
        .whereType<FrsFaceMatch>()
        .where((m) => m.dossierId == null || m.dossierId!.isEmpty)
        .toList();
    if (matches.isEmpty) return;
    await Future.wait(
      matches.map((match) async {
        match.dossierId = await resolveDossierId(match);
      }),
    );
  }

  Future<FrsMatchResult> identifySuspect(Uint8List imageBytes) async {
    final json = await _api.uploadMultipartMl(
      '/faces/identify',
      'file',
      imageBytes,
      'field-capture.jpg',
    );
    final result = FrsMatchResult.fromJson(json);
    await Future.wait(
      result.matches.map((match) async {
        match.dossierId = await resolveDossierId(match);
      }),
    );
    return result;
  }

  /// Maps face-index suspect/draft ids to a submitted dossier id in IAM.
  Future<String?> resolveDossierId(FrsFaceMatch match) async {
    if (match.dossierId != null && match.dossierId!.isNotEmpty) {
      return match.dossierId;
    }

    final suspectId = match.suspectId?.trim();
    final draftId = match.dossierDraftId?.trim();
    if ((suspectId == null || suspectId.isEmpty) &&
        (draftId == null || draftId.isEmpty)) {
      return null;
    }

    final params = <String, String>{};
    if (suspectId != null && suspectId.isNotEmpty) {
      params['suspect_id'] = suspectId;
    }
    if (draftId != null && draftId.isNotEmpty) {
      params['dossier_draft_id'] = draftId;
    }

    try {
      final json = await _api.getJson(
        '/mobile/frs/resolve-dossier?${Uri(queryParameters: params).query}',
      );
      return _readString(json, 'dossier_id', 'dossierId');
    } catch (_) {
      return null;
    }
  }

  static String? _readString(
    Map<String, dynamic> json,
    String snake,
    String camel,
  ) {
    final value = json[snake] ?? json[camel];
    if (value == null) return null;
    final text = value.toString().trim();
    return text.isEmpty ? null : text;
  }
}
