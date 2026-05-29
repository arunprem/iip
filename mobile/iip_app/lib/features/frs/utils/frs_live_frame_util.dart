import 'dart:typed_data';

import 'package:image/image.dart' as img;

const _liveMaxWidth = 640;
const _liveJpegQuality = 72;

/// Resize/compress a camera capture before live FRS upload (smaller = faster).
Uint8List compressLiveFrame(Uint8List jpegBytes) {
  final decoded = img.decodeJpg(jpegBytes);
  if (decoded == null) return jpegBytes;

  final output = decoded.width > _liveMaxWidth
      ? img.copyResize(decoded, width: _liveMaxWidth)
      : decoded;

  return Uint8List.fromList(img.encodeJpg(output, quality: _liveJpegQuality));
}
