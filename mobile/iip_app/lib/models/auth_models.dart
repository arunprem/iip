class AuthResult {
  AuthResult({
    required this.mfaRequired,
    this.accessToken,
    this.refreshToken,
    this.mfaToken,
    this.enrollmentRequired = false,
  });

  final bool mfaRequired;
  final String? accessToken;
  final String? refreshToken;
  final String? mfaToken;
  final bool enrollmentRequired;

  factory AuthResult.fromJson(Map<String, dynamic> json) {
    return AuthResult(
      mfaRequired: json['mfa_required'] == true,
      accessToken: json['access_token'] as String?,
      refreshToken: json['refresh_token'] as String?,
      mfaToken: json['mfa_token'] as String?,
      enrollmentRequired: json['enrollment_required'] == true,
    );
  }

  bool get isComplete => !mfaRequired && accessToken != null && refreshToken != null;
}

class OfficeAssignment {
  OfficeAssignment({
    required this.officeId,
    required this.officeName,
    required this.roleName,
  });

  final String officeId;
  final String officeName;
  final String roleName;

  factory OfficeAssignment.fromJson(Map<String, dynamic> json) {
    return OfficeAssignment(
      officeId: json['office_id'] as String,
      officeName: json['office_name'] as String,
      roleName: json['role_name'] as String,
    );
  }
}

class UserProfile {
  UserProfile({
    required this.userId,
    required this.username,
    required this.fullName,
    required this.offices,
    this.defaultOfficeId,
    this.profilePhotoUrl,
  });

  final String userId;
  final String username;
  final String fullName;
  final List<OfficeAssignment> offices;
  final String? defaultOfficeId;
  final String? profilePhotoUrl;

  bool get hasProfilePhoto =>
      profilePhotoUrl != null && profilePhotoUrl!.isNotEmpty;

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    final officesJson = json['offices'] as List<dynamic>? ?? [];
    return UserProfile(
      userId: json['user_id'] as String,
      username: json['username'] as String,
      fullName: json['full_name'] as String? ?? json['username'] as String,
      defaultOfficeId: json['default_office_id'] as String?,
      profilePhotoUrl: json['profile_photo_url'] as String?,
      offices: officesJson
          .map((e) => OfficeAssignment.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}
