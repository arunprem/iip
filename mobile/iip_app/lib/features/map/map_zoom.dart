import 'dart:math' as math;

/// Web-Mercator zoom so roughly [radiusMeters] is visible from map centre to edge.
double mapZoomForRadiusMeters({
  required double latitude,
  required double radiusMeters,
  double mapWidthPixels = 360,
}) {
  final latRad = latitude * math.pi / 180;
  final metersAcross = radiusMeters * 2;
  final metersPerPixel = metersAcross / mapWidthPixels;
  final scale = 156543.03392 * math.cos(latRad) / metersPerPixel;
  final zoom = math.log(scale) / math.ln2;
  return zoom.clamp(12.0, 17.0);
}
