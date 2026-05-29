class SuspectDossierDetail {
  SuspectDossierDetail({
    required this.dossierId,
    required this.masterSuspectId,
    required this.suspectId,
    required this.linkStatus,
    required this.status,
    required this.submittedAt,
    required this.identity,
    this.officeName,
    this.dossierDraftId,
    this.address,
    this.presentAddress,
    this.hasDifferentPresentAddress = false,
    this.contacts = const [],
    this.socialAccounts = const [],
    this.relatives = const [],
    this.photos = const [],
    this.canEdit = false,
    this.canViewMaster = false,
  });

  factory SuspectDossierDetail.fromJson(Map<String, dynamic> json) {
    return SuspectDossierDetail(
      dossierId: json['dossier_id'] as String,
      masterSuspectId: json['master_suspect_id'] as String,
      suspectId: json['suspect_id'] as String,
      linkStatus: json['link_status'] as String? ?? '',
      status: json['status'] as String? ?? '',
      officeName: json['office_name'] as String?,
      submittedAt: json['submitted_at'] as String? ?? '',
      dossierDraftId: json['dossier_draft_id'] as String?,
      identity: SuspectIdentity.fromJson(
        json['identity'] as Map<String, dynamic>? ?? {},
      ),
      address: json['address'] is Map<String, dynamic>
          ? SuspectAddressBlock.fromJson(json['address'] as Map<String, dynamic>)
          : null,
      presentAddress: json['present_address'] is Map<String, dynamic>
          ? SuspectAddressBlock.fromJson(
              json['present_address'] as Map<String, dynamic>,
            )
          : null,
      hasDifferentPresentAddress:
          json['has_different_present_address'] as bool? ?? false,
      contacts: _listOf(json['contacts'], SuspectContact.fromJson),
      socialAccounts:
          _listOf(json['social_accounts'], SuspectSocialAccount.fromJson),
      relatives: _listOf(json['relatives'], SuspectRelative.fromJson),
      photos: _listOf(json['photos'], SuspectPhotoRef.fromJson),
      canEdit: json['can_edit'] as bool? ?? false,
      canViewMaster: json['can_view_master'] as bool? ?? false,
    );
  }

  final String dossierId;
  final String masterSuspectId;
  final String suspectId;
  final String linkStatus;
  final String status;
  final String? officeName;
  final String submittedAt;
  final String? dossierDraftId;
  final SuspectIdentity identity;
  final SuspectAddressBlock? address;
  final SuspectAddressBlock? presentAddress;
  final bool hasDifferentPresentAddress;
  final List<SuspectContact> contacts;
  final List<SuspectSocialAccount> socialAccounts;
  final List<SuspectRelative> relatives;
  final List<SuspectPhotoRef> photos;
  final bool canEdit;
  final bool canViewMaster;

  SuspectPhotoRef? get frontPhoto {
    for (final p in photos) {
      if (p.poseType.toUpperCase() == 'FRONT') return p;
    }
    return photos.isNotEmpty ? photos.first : null;
  }

  static List<T> _listOf<T>(
    dynamic raw,
    T Function(Map<String, dynamic>) fromJson,
  ) {
    if (raw is! List) return [];
    return raw.whereType<Map<String, dynamic>>().map(fromJson).toList();
  }
}

class SuspectIdentity {
  SuspectIdentity({
    required this.criminalName,
    this.aliasName,
    this.gender,
    this.fathersName,
    this.dateOfBirth,
    this.age,
    this.yearOfBirth,
    this.placeOfBirth,
    this.religion,
    this.category,
    this.officeName,
    this.submittedAt,
  });

  factory SuspectIdentity.fromJson(Map<String, dynamic> json) {
    return SuspectIdentity(
      criminalName: json['criminal_name'] as String? ?? '',
      aliasName: json['alias_name'] as String?,
      gender: json['gender'] as String?,
      fathersName: json['fathers_name'] as String?,
      dateOfBirth: json['date_of_birth'] as String?,
      age: json['age'] as int?,
      yearOfBirth: json['year_of_birth'] as int?,
      placeOfBirth: json['place_of_birth'] as String?,
      religion: json['religion'] as String?,
      category: json['category'] as String?,
      officeName: json['office_name'] as String?,
      submittedAt: json['submitted_at'] as String?,
    );
  }

  final String criminalName;
  final String? aliasName;
  final String? gender;
  final String? fathersName;
  final String? dateOfBirth;
  final int? age;
  final int? yearOfBirth;
  final String? placeOfBirth;
  final String? religion;
  final String? category;
  final String? officeName;
  final String? submittedAt;
}

class SuspectAddressBlock {
  SuspectAddressBlock({
    this.houseNo,
    this.houseName,
    this.streetName,
    this.locality,
    this.tehsil,
    this.villageTownCity,
    this.pincode,
    this.latitude,
    this.longitude,
    this.district,
    this.state,
    this.country,
    this.policeStation,
  });

  factory SuspectAddressBlock.fromJson(Map<String, dynamic> json) {
    return SuspectAddressBlock(
      houseNo: json['house_no'] as String?,
      houseName: json['house_name'] as String?,
      streetName: json['street_name'] as String?,
      locality: json['locality'] as String?,
      tehsil: json['tehsil'] as String?,
      villageTownCity: json['village_town_city'] as String?,
      pincode: json['pincode'] as String?,
      latitude: (json['latitude'] as num?)?.toDouble(),
      longitude: (json['longitude'] as num?)?.toDouble(),
      district: json['district'] as String?,
      state: json['state'] as String?,
      country: json['country'] as String?,
      policeStation: json['police_station'] as String?,
    );
  }

  final String? houseNo;
  final String? houseName;
  final String? streetName;
  final String? locality;
  final String? tehsil;
  final String? villageTownCity;
  final String? pincode;
  final double? latitude;
  final double? longitude;
  final String? district;
  final String? state;
  final String? country;
  final String? policeStation;

  String get formattedLine {
    return [
      houseNo,
      houseName,
      streetName,
      locality,
      tehsil,
      villageTownCity,
    ].where((e) => e != null && e.trim().isNotEmpty).join(', ');
  }

  bool get hasContent => formattedLine.isNotEmpty ||
      (pincode?.isNotEmpty ?? false) ||
      (district?.isNotEmpty ?? false);
}

class SuspectContact {
  SuspectContact({required this.contactType, required this.value});

  factory SuspectContact.fromJson(Map<String, dynamic> json) {
    return SuspectContact(
      contactType: json['contact_type'] as String? ?? '',
      value: json['value'] as String? ?? '',
    );
  }

  final String contactType;
  final String value;
}

class SuspectSocialAccount {
  SuspectSocialAccount({required this.platform, required this.details});

  factory SuspectSocialAccount.fromJson(Map<String, dynamic> json) {
    return SuspectSocialAccount(
      platform: json['platform'] as String? ?? '',
      details: json['details'] as String? ?? '',
    );
  }

  final String platform;
  final String details;
}

class SuspectRelative {
  SuspectRelative({
    required this.name,
    this.relation,
    this.gender,
    this.occupation,
  });

  factory SuspectRelative.fromJson(Map<String, dynamic> json) {
    return SuspectRelative(
      name: json['name'] as String? ?? '',
      relation: json['relation'] as String?,
      gender: json['gender'] as String?,
      occupation: json['occupation'] as String?,
    );
  }

  final String name;
  final String? relation;
  final String? gender;
  final String? occupation;
}

class SuspectPhotoRef {
  SuspectPhotoRef({
    required this.photoId,
    required this.poseType,
    required this.storageKey,
    this.faceDetected = false,
  });

  factory SuspectPhotoRef.fromJson(Map<String, dynamic> json) {
    return SuspectPhotoRef(
      photoId: json['photo_id'] as String? ?? '',
      poseType: json['pose_type'] as String? ?? '',
      storageKey: json['storage_key'] as String? ?? '',
      faceDetected: json['face_detected'] as bool? ?? false,
    );
  }

  final String photoId;
  final String poseType;
  final String storageKey;
  final bool faceDetected;
}
