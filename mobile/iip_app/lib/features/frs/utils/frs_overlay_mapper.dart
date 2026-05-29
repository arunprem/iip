import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Maps face bounding boxes from captured image coordinates to on-screen preview.
class FrsOverlayMapper {
  FrsOverlayMapper({
    required this.imageWidth,
    required this.imageHeight,
    required this.previewSize,
  });

  final int imageWidth;
  final int imageHeight;
  final Size previewSize;

  /// Normalized box from backend (0–1 in upright captured image space).
  Rect mapNormalized(double x, double y, double w, double h) {
    if (imageWidth <= 0 || imageHeight <= 0) return Rect.zero;

    final pixel = Rect.fromLTWH(
      x * imageWidth,
      y * imageHeight,
      w * imageWidth,
      h * imageHeight,
    );

    final scale = math.max(
      previewSize.width / imageWidth,
      previewSize.height / imageHeight,
    );
    final scaledW = imageWidth * scale;
    final scaledH = imageHeight * scale;
    final dx = (previewSize.width - scaledW) / 2;
    final dy = (previewSize.height - scaledH) / 2;

    return Rect.fromLTRB(
      pixel.left * scale + dx,
      pixel.top * scale + dy,
      pixel.right * scale + dx,
      pixel.bottom * scale + dy,
    );
  }
}
