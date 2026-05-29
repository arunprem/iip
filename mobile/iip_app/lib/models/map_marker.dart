class MapMarkerItem {
  MapMarkerItem({
    required this.markerId,
    required this.markerType,
    required this.title,
    required this.subtitle,
    required this.latitude,
    required this.longitude,
    this.suspectId,
    this.dossierId,
    this.referenceId,
    this.storageKey,
  });

  factory MapMarkerItem.fromJson(Map<String, dynamic> json) {
    return MapMarkerItem(
      markerId: json['marker_id'] as String,
      markerType: json['marker_type'] as String? ?? 'suspect',
      title: json['title'] as String? ?? '',
      subtitle: json['subtitle'] as String? ?? '',
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      suspectId: json['suspect_id'] as String?,
      dossierId: json['dossier_id'] as String?,
      referenceId: json['reference_id'] as String?,
      storageKey: json['storage_key'] as String?,
    );
  }

  final String markerId;
  final String markerType;
  final String title;
  final String subtitle;
  final double latitude;
  final double longitude;
  final String? suspectId;
  final String? dossierId;
  final String? referenceId;
  final String? storageKey;
}
