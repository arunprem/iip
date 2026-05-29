import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

import '../../core/network/api_client.dart';
import '../../models/home_models.dart';
import 'home_repository.dart';

enum HomeLoadState { idle, loading, ready, error }

class HomeController extends ChangeNotifier {
  HomeController(ApiClient api) : _repo = HomeRepository(api);

  final HomeRepository _repo;

  HomeLoadState state = HomeLoadState.idle;
  String? errorMessage;

  List<HomeNotificationItem> assignments = [];
  int unreadAssignments = 0;

  List<NearbySuspectItem> nearbySuspects = [];
  String? nearbyMessage;
  bool locationDenied = false;

  MobileDashboardPayload? dashboard;

  final Map<String, Uint8List> _photoCache = {};

  Future<void> refresh() async {
    state = HomeLoadState.loading;
    errorMessage = null;
    notifyListeners();

    try {
      final assignmentsPayload = await _repo.fetchAssignments();
      assignments = assignmentsPayload.items;
      unreadAssignments = assignmentsPayload.unreadCount;
    } on ApiException catch (e) {
      state = HomeLoadState.error;
      errorMessage = e.message;
      notifyListeners();
      return;
    } catch (_) {
      state = HomeLoadState.error;
      errorMessage = 'Could not load assignments.';
      notifyListeners();
      return;
    }

    try {
      dashboard = await _repo.fetchDashboard();
    } on ApiException catch (e) {
      if (e.statusCode == 403) {
        dashboard = null;
      } else {
        errorMessage = e.message;
      }
    } catch (_) {
      dashboard = null;
    }

    await _loadNearby();
    state = HomeLoadState.ready;
    notifyListeners();
  }

  Future<void> _loadNearby() async {
    nearbySuspects = [];
    nearbyMessage = null;
    locationDenied = false;

    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      nearbyMessage = 'Turn on location services to see nearby suspects.';
      return;
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      locationDenied = true;
      nearbyMessage = 'Location permission is required for nearby suspect search.';
      return;
    }

    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
          timeLimit: Duration(seconds: 12),
        ),
      );
      nearbySuspects = await _repo.fetchNearbySuspects(
        latitude: position.latitude,
        longitude: position.longitude,
      );
      if (nearbySuspects.isEmpty) {
        nearbyMessage = 'No suspects with a mapped address within 500 m.';
      }
    } on ApiException catch (e) {
      if (e.statusCode == 403) {
        nearbyMessage = 'You do not have permission to view suspect dossiers.';
      } else {
        nearbyMessage = e.message;
      }
    } catch (_) {
      nearbyMessage = 'Could not determine your location.';
    }
  }

  Future<Uint8List?> photoBytesFor(String? storageKey) async {
    if (storageKey == null || storageKey.isEmpty) return null;
    final cached = _photoCache[storageKey];
    if (cached != null) return cached;
    try {
      final bytes = await _repo.fetchSuspectPhotoBytes(storageKey);
      if (bytes != null) _photoCache[storageKey] = bytes;
      return bytes;
    } catch (_) {
      return null;
    }
  }

  Future<void> markAssignmentRead(HomeNotificationItem item) async {
    if (!item.unread) return;
    try {
      await _repo.markNotificationRead(item.id);
      final index = assignments.indexWhere((a) => a.id == item.id);
      if (index >= 0) {
        assignments[index] = item.copyWith(unread: false);
        if (unreadAssignments > 0) unreadAssignments -= 1;
        notifyListeners();
      }
    } catch (_) {}
  }
}
