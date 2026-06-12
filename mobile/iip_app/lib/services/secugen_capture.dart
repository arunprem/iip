import 'dart:typed_data';

import 'package:flutter/services.dart';

/// On-device SecuGen HU20 capture (Android USB OTG + FDx SDK).
class SecuGenCapture {
  SecuGenCapture._();

  static const _channel = MethodChannel('gov.in.iip.iip_app/secugen');

  static Future<SecuGenDeviceStatus> getStatus() async {
    final raw = await _channel.invokeMethod<Map<Object?, Object?>>('getStatus');
    return SecuGenDeviceStatus.fromMap(raw ?? {});
  }

  /// Capture ISO19794-2 minutiae template bytes from the attached scanner.
  static Future<SecuGenCaptureResult> captureTemplate({
    String fingerPosition = 'RIGHT_THUMB',
  }) async {
    final raw = await _channel.invokeMapMethod<String, dynamic>(
      'captureTemplate',
      {'fingerPosition': fingerPosition},
    );
    if (raw == null) {
      throw PlatformException(
        code: 'CAPTURE_FAILED',
        message: 'Empty response from SecuGen capture',
      );
    }
    return SecuGenCaptureResult.fromMap(raw);
  }
}

class SecuGenDeviceStatus {
  const SecuGenDeviceStatus({
    required this.sdkInstalled,
    required this.usbHostSupported,
    required this.deviceAttached,
    required this.ready,
    this.deviceModel,
    this.message,
  });

  factory SecuGenDeviceStatus.fromMap(Map<Object?, Object?> map) {
    return SecuGenDeviceStatus(
      sdkInstalled: map['sdkInstalled'] == true,
      usbHostSupported: map['usbHostSupported'] == true,
      deviceAttached: map['deviceAttached'] == true,
      ready: map['ready'] == true,
      deviceModel: map['deviceModel']?.toString(),
      message: map['message']?.toString(),
    );
  }

  final bool sdkInstalled;
  final bool usbHostSupported;
  final bool deviceAttached;
  final bool ready;
  final String? deviceModel;
  final String? message;
}

class SecuGenCaptureResult {
  SecuGenCaptureResult({
    required this.templateBytes,
    required this.templateFormat,
    required this.fingerPosition,
    this.qualityScore,
    this.deviceModel,
    this.imageBytes,
    this.imageWidth,
    this.imageHeight,
  });

  factory SecuGenCaptureResult.fromMap(Map<String, dynamic> map) {
    final raw = map['templateBytes'];
    final Uint8List bytes;
    if (raw is Uint8List) {
      bytes = raw;
    } else if (raw is List) {
      bytes = Uint8List.fromList(raw.cast<int>());
    } else {
      throw PlatformException(
        code: 'INVALID_TEMPLATE',
        message: 'Scanner returned no template bytes',
      );
    }

    Uint8List? imageBytes;
    final rawImage = map['imageBytes'];
    if (rawImage is Uint8List) {
      imageBytes = rawImage;
    } else if (rawImage is List) {
      imageBytes = Uint8List.fromList(rawImage.cast<int>());
    }

    return SecuGenCaptureResult(
      templateBytes: bytes,
      templateFormat: map['templateFormat']?.toString() ?? 'ISO19794-2',
      fingerPosition: map['fingerPosition']?.toString() ?? 'RIGHT_THUMB',
      qualityScore: (map['qualityScore'] as num?)?.toDouble(),
      deviceModel: map['deviceModel']?.toString(),
      imageBytes: imageBytes,
      imageWidth: (map['imageWidth'] as num?)?.toInt(),
      imageHeight: (map['imageHeight'] as num?)?.toInt(),
    );
  }

  final Uint8List templateBytes;
  final String templateFormat;
  final String fingerPosition;
  final double? qualityScore;
  final String? deviceModel;
  final Uint8List? imageBytes;
  final int? imageWidth;
  final int? imageHeight;
}
