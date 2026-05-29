class HomeNotificationItem {
  HomeNotificationItem({
    required this.id,
    required this.title,
    required this.message,
    required this.notificationType,
    required this.unread,
    required this.createdAt,
    this.eventType,
  });

  factory HomeNotificationItem.fromJson(Map<String, dynamic> json) {
    return HomeNotificationItem(
      id: json['id'] as String,
      title: json['title'] as String? ?? '',
      message: json['message'] as String? ?? '',
      notificationType: json['notification_type'] as String? ?? 'info',
      eventType: json['event_type'] as String?,
      unread: json['unread'] as bool? ?? true,
      createdAt: json['created_at'] as String? ?? '',
    );
  }

  final String id;
  final String title;
  final String message;
  final String notificationType;
  final String? eventType;
  final bool unread;
  final String createdAt;

  HomeNotificationItem copyWith({bool? unread}) => HomeNotificationItem(
        id: id,
        title: title,
        message: message,
        notificationType: notificationType,
        eventType: eventType,
        unread: unread ?? this.unread,
        createdAt: createdAt,
      );
}

class MobileAssignmentsPayload {
  MobileAssignmentsPayload({required this.items, required this.unreadCount});

  factory MobileAssignmentsPayload.fromJson(Map<String, dynamic> json) {
    final raw = json['items'];
    return MobileAssignmentsPayload(
      items: raw is List
          ? raw
              .whereType<Map<String, dynamic>>()
              .map(HomeNotificationItem.fromJson)
              .toList()
          : [],
      unreadCount: json['unread_count'] as int? ?? 0,
    );
  }

  final List<HomeNotificationItem> items;
  final int unreadCount;
}

class NearbySuspectItem {
  NearbySuspectItem({
    required this.suspectId,
    required this.dossierId,
    required this.criminalName,
    required this.distanceM,
    this.aliasName,
    this.photoId,
    this.storageKey,
    this.photoPath,
  });

  factory NearbySuspectItem.fromJson(Map<String, dynamic> json) {
    return NearbySuspectItem(
      suspectId: json['suspect_id'] as String,
      dossierId: json['dossier_id'] as String,
      criminalName: json['criminal_name'] as String? ?? '',
      aliasName: json['alias_name'] as String?,
      distanceM: (json['distance_m'] as num?)?.toDouble() ?? 0,
      photoId: json['photo_id'] as String?,
      storageKey: json['storage_key'] as String?,
      photoPath: json['photo_url'] as String?,
    );
  }

  final String suspectId;
  final String dossierId;
  final String criminalName;
  final String? aliasName;
  final double distanceM;
  final String? photoId;
  final String? storageKey;
  final String? photoPath;
}

class WeeklyDossierCount {
  WeeklyDossierCount({required this.label, required this.count});

  factory WeeklyDossierCount.fromJson(Map<String, dynamic> json) {
    return WeeklyDossierCount(
      label: json['label'] as String? ?? '',
      count: json['count'] as int? ?? 0,
    );
  }

  final String label;
  final int count;
}

class MobileDashboardPayload {
  MobileDashboardPayload({
    required this.dossiersSubmitted,
    required this.dossiersThisWeek,
    required this.unreadNotifications,
    required this.readNotifications,
    required this.weeklyDossiers,
  });

  factory MobileDashboardPayload.fromJson(Map<String, dynamic> json) {
    final weekly = json['weekly_dossiers'];
    return MobileDashboardPayload(
      dossiersSubmitted: json['dossiers_submitted'] as int? ?? 0,
      dossiersThisWeek: json['dossiers_this_week'] as int? ?? 0,
      unreadNotifications: json['unread_notifications'] as int? ?? 0,
      readNotifications: json['read_notifications'] as int? ?? 0,
      weeklyDossiers: weekly is List
          ? weekly
              .whereType<Map<String, dynamic>>()
              .map(WeeklyDossierCount.fromJson)
              .toList()
          : [],
    );
  }

  final int dossiersSubmitted;
  final int dossiersThisWeek;
  final int unreadNotifications;
  final int readNotifications;
  final List<WeeklyDossierCount> weeklyDossiers;
}
