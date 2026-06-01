import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../../core/motion/iip_page_route.dart';
import '../../core/network/api_client.dart';
import '../../models/map_marker.dart';
import '../auth/auth_controller.dart';
import '../shell/notched_bottom_bar.dart';
import '../suspects/suspect_dossier_detail_screen.dart';
import 'map_marker_sheet.dart';
import 'map_photo_marker.dart';
import 'map_repository.dart';
import 'map_zoom.dart';
import 'user_location_map_marker.dart';

/// Operational map — suspects with photo pins (~800 m viewport).
class IntelligenceMapScreen extends StatefulWidget {
  const IntelligenceMapScreen({super.key});

  @override
  State<IntelligenceMapScreen> createState() => _IntelligenceMapScreenState();
}

class _IntelligenceMapScreenState extends State<IntelligenceMapScreen> {
  static const double _viewportRadiusM = 800;

  late final MapRepository _repo;
  final _mapController = MapController();

  List<MapMarkerItem> _markers = [];
  LatLng? _center;
  LatLng? _userLocation;
  Uint8List? _userPhotoBytes;
  bool _loadingUserPhoto = false;
  bool _locationAvailable = false;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _repo = MapRepository(context.read<AuthController>().api);
    _loadUserPhoto();
    _load();
  }

  String _userInitials(AuthController auth) {
    final name = auth.profile?.fullName ?? auth.user?.fullName ?? '?';
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.length >= 2) {
      return '${parts.first[0]}${parts[1][0]}'.toUpperCase();
    }
    return name.isNotEmpty ? name[0].toUpperCase() : '?';
  }

  Future<void> _loadUserPhoto() async {
    final auth = context.read<AuthController>();
    if (!auth.officerHasProfilePhoto) {
      if (mounted) setState(() => _userPhotoBytes = null);
      return;
    }
    setState(() => _loadingUserPhoto = true);
    try {
      final bytes = await auth.fetchProfilePhotoBytes();
      if (mounted) {
        setState(() {
          _userPhotoBytes = bytes;
          _loadingUserPhoto = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingUserPhoto = false);
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      double? lat;
      double? lon;
      final serviceOn = await Geolocator.isLocationServiceEnabled();
      if (serviceOn) {
        var perm = await Geolocator.checkPermission();
        if (perm == LocationPermission.denied) {
          perm = await Geolocator.requestPermission();
        }
        if (perm == LocationPermission.whileInUse ||
            perm == LocationPermission.always) {
          final pos = await Geolocator.getCurrentPosition();
          lat = pos.latitude;
          lon = pos.longitude;
        }
      }
      final markers = await _repo.fetchMarkers(
        latitude: lat,
        longitude: lon,
        radiusM: _viewportRadiusM,
      );
      if (!mounted) return;
      final hasGps = lat != null && lon != null;
      final userPoint = hasGps ? LatLng(lat, lon) : null;
      final center = userPoint ??
          (markers.isNotEmpty
              ? LatLng(markers.first.latitude, markers.first.longitude)
              : const LatLng(10.8505, 76.2711));

      setState(() {
        _markers = markers;
        _center = center;
        _userLocation = userPoint;
        _locationAvailable = hasGps;
        _loading = false;
      });

      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final width = MediaQuery.sizeOf(context).width;
        final zoom = mapZoomForRadiusMeters(
          latitude: center.latitude,
          radiusMeters: _viewportRadiusM,
          mapWidthPixels: width,
        );
        _mapController.move(center, zoom);
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
        _center = const LatLng(10.8505, 76.2711);
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not load map data.';
        _loading = false;
        _center = const LatLng(10.8505, 76.2711);
      });
    }
  }

  MapMarkerItem? _markerById(String markerId) {
    for (final m in _markers) {
      if (m.markerId == markerId) return m;
    }
    return null;
  }

  void _onMarkerTap(String markerId) {
    final marker = _markerById(markerId);
    if (marker == null) return;

    final auth = context.read<AuthController>();
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => MapMarkerSheet(
        key: ValueKey(marker.markerId),
        marker: marker,
        colors: auth.colors,
        api: auth.api,
        onViewDetails: () {
          Navigator.pop(ctx);
          _openDetails(marker);
        },
      ),
    );
  }

  void _openDetails(MapMarkerItem marker) {
    if (marker.markerType == 'suspect' &&
        marker.dossierId != null &&
        marker.dossierId!.isNotEmpty) {
      context.pushSmooth(
        SuspectDossierDetailScreen(dossierId: marker.dossierId!),
      );
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          marker.markerType == 'suspect'
              ? 'Dossier not available for this location.'
              : '${marker.markerType} details coming soon.',
        ),
      ),
    );
  }

  String _tileUrl(bool isDark) {
    if (isDark) {
      return 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';
    }
    return 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final colors = auth.colors;
    final isDark = auth.isDark;
    final mapWidth = MediaQuery.sizeOf(context).width;
    final initialZoom = _center != null
        ? mapZoomForRadiusMeters(
            latitude: _center!.latitude,
            radiusMeters: _viewportRadiusM,
            mapWidthPixels: mapWidth,
          )
        : 15.0;

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: colors.bg,
        foregroundColor: colors.text,
        title: const Text('Intelligence map'),
        actions: [
          IconButton(
            icon: const Icon(Icons.my_location),
            onPressed: _load,
            tooltip: 'Refresh near me',
          ),
        ],
      ),
      body: _loading
          ? Center(child: CircularProgressIndicator(color: colors.primary))
          : Stack(
              children: [
                if (_center != null)
                  FlutterMap(
                    mapController: _mapController,
                    options: MapOptions(
                      initialCenter: _center!,
                      initialZoom: initialZoom,
                      minZoom: 10,
                      maxZoom: 18,
                    ),
                    children: [
                      TileLayer(
                        urlTemplate: _tileUrl(isDark),
                        userAgentPackageName: 'gov.in.iip.iip_app',
                      ),
                      if (_userLocation != null)
                        MarkerLayer(
                          markers: [
                            Marker(
                              key: const ValueKey('user-location'),
                              point: _userLocation!,
                              width: 56,
                              height: 56,
                              alignment: Alignment.center,
                              child: UserLocationMapMarker(
                                colors: colors,
                                initials: _userInitials(auth),
                                photoBytes: _userPhotoBytes,
                                isLoadingPhoto: _loadingUserPhoto,
                              ),
                            ),
                          ],
                        ),
                      MarkerLayer(
                        markers: [
                          for (final m in _markers)
                            Marker(
                              key: ValueKey(m.markerId),
                              point: LatLng(m.latitude, m.longitude),
                              width: 52,
                              height: 52,
                              alignment: Alignment.center,
                              child: MapPhotoMarker(
                                key: ValueKey('photo-${m.markerId}'),
                                markerId: m.markerId,
                                api: auth.api,
                                colors: colors,
                                storageKey: m.storageKey,
                                markerType: m.markerType,
                                onTap: () => _onMarkerTap(m.markerId),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                if (_error != null)
                  Positioned(
                    top: 8,
                    left: 16,
                    right: 16,
                    child: Material(
                      color: colors.error.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                      child: Padding(
                        padding: const EdgeInsets.all(10),
                        child: Text(
                          _error!,
                          style: TextStyle(color: colors.error, fontSize: 12),
                        ),
                      ),
                    ),
                  ),
                Positioned(
                  left: 16,
                  right: 16,
                  bottom: iipBottomNavTotalHeight(context) + 12,
                  child: Material(
                    elevation: 4,
                    borderRadius: BorderRadius.circular(12),
                    color: colors.surface,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      child: Text(
                        _locationAvailable
                            ? '${_markers.length} suspects within ${_viewportRadiusM.round()} m · '
                                'Green = you · Blue = suspects'
                            : '${_markers.length} pins · Enable location to see yourself on the map',
                        style: TextStyle(color: colors.textMuted, fontSize: 12),
                      ),
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}
