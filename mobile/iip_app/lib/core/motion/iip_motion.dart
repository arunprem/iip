import 'package:flutter/material.dart';

/// Frame-rate aware motion tokens (60 Hz / 90 Hz / 120 Hz displays).
abstract final class IipMotion {
  static double refreshRate(BuildContext context) {
    try {
      final rate = View.of(context).display.refreshRate;
      if (rate.isFinite && rate > 0) return rate;
    } catch (_) {}
    return 60;
  }

  static Duration duration(BuildContext context, {required int baseMs}) {
    final rate = refreshRate(context);
    final scale = (60 / rate).clamp(0.72, 1.0);
    return Duration(milliseconds: (baseMs * scale).round());
  }

  static Duration transitionDuration(BuildContext context) => duration(context, baseMs: 280);

  static Duration shortDuration(BuildContext context) => duration(context, baseMs: 180);

  static const Curve standardCurve = Curves.easeOutCubic;
  static const Curve enterCurve = Curves.easeOutCubic;
  static const Curve exitCurve = Curves.easeInCubic;

  static const double scrollCacheExtent = 480;
}
