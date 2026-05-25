class UserProfileData {
  UserProfileData({
    required this.userId,
    required this.username,
    required this.email,
    required this.fullName,
    required this.badgeNumber,
    required this.department,
    required this.clearanceLevel,
    this.profilePhotoUrl,
  });

  final String userId;
  final String username;
  final String email;
  final String fullName;
  final String badgeNumber;
  final String department;
  final String clearanceLevel;
  final String? profilePhotoUrl;

  bool get hasProfilePhoto => profilePhotoUrl != null && profilePhotoUrl!.isNotEmpty;

  factory UserProfileData.fromJson(Map<String, dynamic> json) {
    return UserProfileData(
      userId: json['user_id'] as String,
      username: json['username'] as String,
      email: json['email'] as String? ?? '',
      fullName: json['full_name'] as String? ?? '',
      badgeNumber: json['badge_number'] as String? ?? '',
      department: json['department'] as String? ?? '',
      clearanceLevel: json['clearance_level'] as String? ?? '',
      profilePhotoUrl: json['profile_photo_url'] as String?,
    );
  }

  UserProfileData copyWith({
    String? email,
    String? fullName,
    String? badgeNumber,
    String? department,
    String? profilePhotoUrl,
    bool clearPhotoUrl = false,
  }) {
    return UserProfileData(
      userId: userId,
      username: username,
      email: email ?? this.email,
      fullName: fullName ?? this.fullName,
      badgeNumber: badgeNumber ?? this.badgeNumber,
      department: department ?? this.department,
      clearanceLevel: clearanceLevel,
      profilePhotoUrl: clearPhotoUrl ? null : (profilePhotoUrl ?? this.profilePhotoUrl),
    );
  }
}
