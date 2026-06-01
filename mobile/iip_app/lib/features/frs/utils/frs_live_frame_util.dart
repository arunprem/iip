import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;

// Smaller = faster network upload; 480px is sufficient for server-side face detection.
const _liveMaxWidth = 480;
// Slightly higher quality than before — smaller source size means we can afford it.
const _liveJpegQuality = 78;

/// Compress a JPEG frame on a background isolate so the UI thread stays free.
Future<Uint8List> compressLiveFrameAsync(Uint8List jpegBytes) {
  return compute(_compressInIsolate, jpegBytes);
}

/// Top-level function required by [compute] — runs on a separate isolate.
Uint8List _compressInIsolate(Uint8List jpegBytes) {
  final decoded = img.decodeJpg(jpegBytes);
  if (decoded == null) return jpegBytes;

  final output = decoded.width > _liveMaxWidth
      ? img.copyResize(decoded, width: _liveMaxWidth)
      : decoded;

  return Uint8List.fromList(img.encodeJpg(output, quality: _liveJpegQuality));
}

/// Synchronous fallback — kept for the single-photo FRS capture screen.
Uint8List compressLiveFrame(Uint8List jpegBytes) {
  final decoded = img.decodeJpg(jpegBytes);
  if (decoded == null) return jpegBytes;
  final output = decoded.width > _liveMaxWidth
      ? img.copyResize(decoded, width: _liveMaxWidth)
      : decoded;
  return Uint8List.fromList(img.encodeJpg(output, quality: _liveJpegQuality));
}
