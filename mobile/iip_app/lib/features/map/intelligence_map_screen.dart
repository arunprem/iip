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
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _repo = MapRepository(context.read<AuthController>().api);
    _load();
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
      final center = lat != null && lon != null
          ? LatLng(lat, lon)
          : markers.isNotEmpty
              ? LatLng(markers.first.latitude, markers.first.longitude)
              : const LatLng(10.8505, 76.2711);

      setState(() {
        _markers = markers;
        _center = center;
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

  void _onMarkerTap(MapMarkerItem marker) {
    final auth = context.read<AuthController>();
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => MapMarkerSheet(
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
                      if (_center != null)
                        MarkerLayer(
                          markers: [
                            Marker(
                              point: _center!,
                              width: 20,
                              height: 20,
                              child: Container(
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: colors.primary.withValues(alpha: 0.25),
                                  border: Border.all(color: colors.primary, width: 2),
                                ),
                              ),
                            ),
                          ],
                        ),
                      MarkerLayer(
                        markers: [
                          for (final m in _markers)
                            Marker(
                              point: LatLng(m.latitude, m.longitude),
                              width: 52,
                              height: 52,
                              child: MapPhotoMarker(
                                api: auth.api,
                                colors: colors,
                                storageKey: m.storageKey,
                                markerType: m.markerType,
                                onTap: () => _onMarkerTap(m),
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
                        '${_markers.length} within ${_viewportRadiusM.round()} m · Photo pins = suspects',
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
