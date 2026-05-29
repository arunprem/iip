import '../../core/network/api_client.dart';
import '../../models/map_marker.dart';

class MapRepository {
  MapRepository(this._api);

  final ApiClient _api;

  Future<List<MapMarkerItem>> fetchMarkers({
    double? latitude,
    double? longitude,
    double radiusM = 800,
  }) async {
    final params = <String, String>{};
    if (latitude != null && longitude != null) {
      params['latitude'] = latitude.toString();
      params['longitude'] = longitude.toString();
      params['radius_m'] = radiusM.round().toString();
    }
    final q = Uri(queryParameters: params.isEmpty ? null : params);
    final json = await _api.getJson('/mobile/map/markers?${q.query}');
    final items = json['items'];
    if (items is! List) return [];
    return items
        .whereType<Map<String, dynamic>>()
        .map(MapMarkerItem.fromJson)
        .toList();
  }
}
