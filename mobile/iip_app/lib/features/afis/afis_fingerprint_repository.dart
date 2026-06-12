import 'dart:convert';
import 'dart:typed_data';

import '../../core/network/api_client.dart';

class FingerprintSubmissionResult {
  FingerprintSubmissionResult({
    required this.id,
    required this.status,
    required this.criminalName,
    required this.fingerPosition,
  });

  final String id;
  final String status;
  final String criminalName;
  final String fingerPosition;

  factory FingerprintSubmissionResult.fromJson(Map<String, dynamic> json) {
    return FingerprintSubmissionResult(
      id: (json['id'] ?? '').toString(),
      status: (json['status'] ?? 'PENDING').toString(),
      criminalName: (json['criminalName'] ?? json['criminal_name'] ?? '').toString(),
      fingerPosition: (json['fingerPosition'] ?? json['finger_position'] ?? '').toString(),
    );
  }
}

class AfisFingerprintRepository {
  AfisFingerprintRepository(this._api);

  final ApiClient _api;

  Future<FingerprintSubmissionResult> submitFingerprint({
    required String dossierId,
    required String fingerPosition,
    required Uint8List templateBytes,
    String templateFormat = 'ISO19794-2',
    double? qualityScore,
    String? deviceModel,
    Uint8List? imageBytes,
    int? imageWidth,
    int? imageHeight,
  }) async {
    final json = await _api.postJson(
      '/mobile/fingerprints/submit',
      {
        'dossierId': dossierId,
        'fingerPosition': fingerPosition,
        'templateDataB64': base64Encode(templateBytes),
        'templateFormat': templateFormat,
        if (qualityScore != null) 'qualityScore': qualityScore,
        if (deviceModel != null && deviceModel.isNotEmpty) 'deviceModel': deviceModel,
        if (imageBytes != null && imageBytes.isNotEmpty) ...{
          'imageDataB64': base64Encode(imageBytes),
          if (imageWidth != null) 'imageWidth': imageWidth,
          if (imageHeight != null) 'imageHeight': imageHeight,
        },
      },
    );
    return FingerprintSubmissionResult.fromJson(json);
  }
}
