import 'dart:typed_data';

import '../../core/config/app_config.dart';
import '../../core/network/api_client.dart';
import '../../models/home_models.dart';

class HomeRepository {
  HomeRepository(this._api);

  final ApiClient _api;

  Future<MobileAssignmentsPayload> fetchAssignments({int limit = 15}) async {
    final json = await _api.getJson('/mobile/home/assignments?limit=$limit');
    return MobileAssignmentsPayload.fromJson(json);
  }

  Future<MobileDashboardPayload> fetchDashboard() async {
    final json = await _api.getJson('/mobile/home/dashboard');
    return MobileDashboardPayload.fromJson(json);
  }

  Future<List<NearbySuspectItem>> fetchNearbySuspects({
    required double latitude,
    required double longitude,
    double radiusM = 500,
    int limit = 20,
  }) async {
    final q = Uri(queryParameters: {
      'latitude': latitude.toString(),
      'longitude': longitude.toString(),
      'radius_m': radiusM.round().toString(),
      'limit': limit.toString(),
    });
    final json = await _api.getJson('/mobile/home/nearby-suspects?${q.query}');
    final items = json['items'];
    if (items is! List) return [];
    return items
        .whereType<Map<String, dynamic>>()
        .map(NearbySuspectItem.fromJson)
        .toList();
  }

  Future<void> markNotificationRead(String notificationId) =>
      _api.patchNoContent('/notifications/$notificationId/read');

  Future<Uint8List?> fetchSuspectPhotoBytes(String storageKey) {
    final path =
        '/mobile/home/suspect-photos/image?storage_key=${Uri.encodeComponent(storageKey)}';
    return _api.getBytes(path);
  }

  /// Full URL for debugging; mobile loads via [fetchSuspectPhotoBytes] with auth headers.
  static String suspectPhotoUrl(String storageKey) =>
      '${AppConfig.baseUrl}/mobile/home/suspect-photos/image?storage_key=${Uri.encodeComponent(storageKey)}';
}
