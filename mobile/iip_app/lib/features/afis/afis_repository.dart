import 'dart:convert';
import 'dart:typed_data';

import '../../core/network/api_client.dart';
import '../../models/afis_match.dart';

class AfisRepository {
  AfisRepository(this._api);

  final ApiClient _api;

  Future<AfisMatchResult> identifyFingerprint(
    Uint8List templateBytes, {
    String? fingerPosition,
  }) async {
    final json = await _api.postJsonMl(
      '/fingerprints/identify',
      {
        'templateDataB64': base64Encode(templateBytes),
        if (fingerPosition != null && fingerPosition.isNotEmpty)
          'fingerPosition': fingerPosition,
      },
      timeout: const Duration(seconds: 30),
    );
    final result = AfisMatchResult.fromJson(json);
    await Future.wait(
      result.matches.map((match) async {
        match.dossierId = await resolveDossierId(match);
      }),
    );
    if (result.bestMatch != null &&
        (result.bestMatch!.dossierId == null || result.bestMatch!.dossierId!.isEmpty)) {
      result.bestMatch!.dossierId = await resolveDossierId(result.bestMatch!);
    }
    return result;
  }

  Future<String?> resolveDossierId(AfisFingerprintMatch match) async {
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
