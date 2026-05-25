import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import '../../core/network/api_client.dart';
import '../../core/storage/profile_photo_cache.dart';
import '../../core/storage/token_storage.dart';
import '../../core/theme/iip_colors.dart';
import '../../models/auth_models.dart';
import '../../models/mobile_session.dart';
import '../../models/profile_models.dart';

enum AuthStatus { unknown, unauthenticated, needsOffice, authenticated }

class AuthController extends ChangeNotifier {
  AuthController({ApiClient? api, TokenStorage? storage})
      : _api = api ?? ApiClient(),
        _storage = storage ?? TokenStorage();

  final ApiClient _api;
  final TokenStorage _storage;

  AuthStatus status = AuthStatus.unknown;
  UserProfile? user;
  UserProfileData? profile;
  MobileSession? session;
  int profilePhotoVersion = 0;
  Uint8List? _memoryProfilePhoto;
  String? _memoryPhotoUserId;
  int _memoryPhotoVersion = -1;
  String? mfaToken;
  bool enrollmentRequired = false;
  bool isDark = true;
  IipColors colors = IipColors.dark;
  String? errorMessage;
  bool isBusy = false;

  Future<void> bootstrap() async {
    isDark = await _storage.readDarkMode();
    colors = isDark ? IipColors.dark : IipColors.light;
    try {
      final access = await _storage.readAccess();
      final officeId = await _storage.readOfficeId();
      if (access == null) {
        status = AuthStatus.unauthenticated;
        return;
      }
      _api.setAccessToken(access);
      if (officeId != null) {
        _api.setOfficeId(officeId);
        await _loadSession();
        status = AuthStatus.authenticated;
        _loadProfileInBackground();
      } else {
        await _fetchUser();
        status = user!.offices.isEmpty ? AuthStatus.unauthenticated : AuthStatus.needsOffice;
      }
    } on ApiException catch (e) {
      await _resetSessionAfterBootstrapFailure(e.message);
    } catch (_) {
      await _resetSessionAfterBootstrapFailure(
        'Cannot reach server. Check API URL and Wi‑Fi.',
      );
    } finally {
      notifyListeners();
    }
  }

  Future<void> _resetSessionAfterBootstrapFailure(String message) async {
    await _storage.clearTokens();
    await _storage.clearOfficeId();
    _api.setAccessToken(null);
    _api.setOfficeId(null);
    user = null;
    profile = null;
    session = null;
    _clearProfilePhotoMemory();
    status = AuthStatus.unauthenticated;
    errorMessage = message;
  }

  void _loadProfileInBackground() {
    loadProfile()
        .then((_) => _warmProfilePhotoCache())
        .catchError((_) {});
  }

  Future<void> login({
    required String username,
    required String password,
    required String captchaId,
    required String captchaCode,
  }) async {
    isBusy = true;
    errorMessage = null;
    notifyListeners();
    try {
      final data = await _api.postJson('/auth/login', {
        'username': username,
        'password': password,
        'captcha_id': captchaId,
        'captcha_code': captchaCode,
      });
      final result = AuthResult.fromJson(data);
      if (result.isComplete) {
        await _finishTokens(result.accessToken!, result.refreshToken!);
      } else if (result.mfaRequired && result.mfaToken != null) {
        mfaToken = result.mfaToken;
        enrollmentRequired = result.enrollmentRequired;
        status = AuthStatus.unauthenticated;
      } else {
        errorMessage = 'Sign-in could not be completed.';
      }
    } on ApiException catch (e) {
      errorMessage = e.message;
    } finally {
      isBusy = false;
      notifyListeners();
    }
  }

  void clearMfaChallenge() {
    mfaToken = null;
    enrollmentRequired = false;
    errorMessage = null;
    notifyListeners();
  }

  Future<void> verifyMfa(String code) async {
    if (mfaToken == null) return;
    isBusy = true;
    errorMessage = null;
    notifyListeners();
    try {
      final path = enrollmentRequired
          ? '/auth/mfa/enrollment/complete'
          : '/auth/mfa/verify';
      final data = await _api.postJson(path, {
        'mfa_token': mfaToken,
        'code': code,
      });
      final result = AuthResult.fromJson(data);
      if (result.isComplete) {
        mfaToken = null;
        enrollmentRequired = false;
        await _finishTokens(result.accessToken!, result.refreshToken!);
      } else {
        errorMessage = 'Invalid authentication code.';
      }
    } on ApiException catch (e) {
      errorMessage = e.message;
    } finally {
      isBusy = false;
      notifyListeners();
    }
  }

  OfficeAssignment? get currentOffice {
    final offices = user?.offices ?? [];
    if (offices.isEmpty) return null;
    final stored = _api.officeId;
    if (stored != null) {
      for (final o in offices) {
        if (o.officeId == stored) return o;
      }
    }
    return offices.first;
  }

  Future<void> selectOffice(String officeId) async {
    isBusy = true;
    errorMessage = null;
    notifyListeners();
    try {
      _api.setOfficeId(officeId);
      await _storage.saveOfficeId(officeId);
      await _loadSession();
      await loadProfile();
      _warmProfilePhotoCache();
      status = AuthStatus.authenticated;
    } on ApiException catch (e) {
      errorMessage = e.message;
      rethrow;
    } finally {
      isBusy = false;
      notifyListeners();
    }
  }

  void _warmProfilePhotoCache() {
    if (profile?.hasProfilePhoto != true) return;
    fetchProfilePhotoBytes().ignore();
  }

  Future<UserProfileData> loadProfile() async {
    final data = await _api.getJson('/auth/me/profile');
    profile = UserProfileData.fromJson(data);
    notifyListeners();
    return profile!;
  }

  Future<UserProfileData> updateProfile({
    String? email,
    String? fullName,
    String? badgeNumber,
    String? department,
  }) async {
    errorMessage = null;
    try {
      final body = <String, dynamic>{};
      if (email != null) body['email'] = email;
      if (fullName != null) body['full_name'] = fullName;
      if (badgeNumber != null) body['badge_number'] = badgeNumber;
      if (department != null) body['department'] = department;
      final data = await _api.patchJson('/auth/me/profile', body);
      profile = UserProfileData.fromJson(data);
      await _fetchUser();
      notifyListeners();
      return profile!;
    } on ApiException catch (e) {
      errorMessage = e.message;
      rethrow;
    }
  }

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    errorMessage = null;
    try {
      await _api.postJsonNoContent('/auth/me/password', {
        'current_password': currentPassword,
        'new_password': newPassword,
      });
    } on ApiException catch (e) {
      errorMessage = e.message;
      rethrow;
    }
  }

  Future<UserProfileData> uploadProfilePhoto({
    required List<int> bytes,
    required String filename,
    required String contentType,
  }) async {
    errorMessage = null;
    try {
      final data = await _api.uploadMultipart(
        '/auth/me/photo',
        'file',
        Uint8List.fromList(bytes),
        filename,
        contentType: contentType,
      );
      profile = UserProfileData.fromJson(data);
      profilePhotoVersion++;
      await _persistProfilePhotoCache(Uint8List.fromList(bytes));
      await _fetchUser();
      notifyListeners();
      return profile!;
    } on ApiException catch (e) {
      errorMessage = e.message;
      rethrow;
    }
  }

  bool get hasCachedProfilePhoto {
    final userId = profile?.userId ?? user?.userId;
    if (userId == null || profile?.hasProfilePhoto != true) return false;
    return _memoryPhotoUserId == userId &&
        _memoryPhotoVersion == profilePhotoVersion &&
        _memoryProfilePhoto != null;
  }

  /// Loads profile photo: memory → disk → network (only if cache miss).
  Future<Uint8List?> fetchProfilePhotoBytes({bool forceNetwork = false}) async {
    final userId = profile?.userId ?? user?.userId;
    if (userId == null || profile?.hasProfilePhoto != true) {
      _clearProfilePhotoMemory();
      return null;
    }
    final version = profilePhotoVersion;

    if (!forceNetwork) {
      if (_memoryPhotoUserId == userId &&
          _memoryPhotoVersion == version &&
          _memoryProfilePhoto != null) {
        return _memoryProfilePhoto;
      }
      final disk = await ProfilePhotoCache.read(userId, version);
      if (disk != null && disk.isNotEmpty) {
        _memoryProfilePhoto = disk;
        _memoryPhotoUserId = userId;
        _memoryPhotoVersion = version;
        return disk;
      }
    }

    final bytes = await _api.getBytes('/auth/me/photo');
    if (bytes != null && bytes.isNotEmpty) {
      await _persistProfilePhotoCache(bytes);
    }
    return bytes;
  }

  Future<void> _persistProfilePhotoCache(Uint8List bytes) async {
    final userId = profile?.userId ?? user?.userId;
    if (userId == null) return;
    _memoryProfilePhoto = bytes;
    _memoryPhotoUserId = userId;
    _memoryPhotoVersion = profilePhotoVersion;
    await ProfilePhotoCache.write(userId, profilePhotoVersion, bytes);
  }

  void _clearProfilePhotoMemory() {
    _memoryProfilePhoto = null;
    _memoryPhotoUserId = null;
    _memoryPhotoVersion = -1;
  }

  Future<void> toggleTheme() async {
    isDark = !isDark;
    colors = isDark ? IipColors.dark : IipColors.light;
    await _storage.saveDarkMode(isDark);
    if (status == AuthStatus.authenticated) {
      await _loadSession();
    }
    notifyListeners();
  }

  Future<void> logout() async {
    final userId = profile?.userId ?? user?.userId;
    await _storage.clearTokens();
    await _storage.clearOfficeId();
    _api.setAccessToken(null);
    _api.setOfficeId(null);
    _clearProfilePhotoMemory();
    if (userId != null) await ProfilePhotoCache.clearUser(userId);
    user = null;
    profile = null;
    session = null;
    profilePhotoVersion = 0;
    mfaToken = null;
    status = AuthStatus.unauthenticated;
    colors = isDark ? IipColors.dark : IipColors.light;
    notifyListeners();
  }

  Future<Map<String, String>> fetchCaptcha() async {
    final data = await _api.getJson('/captcha/');
    return {
      'id': data['captcha_id'] as String,
      'image': data['image_base64'] as String,
    };
  }

  Future<void> _finishTokens(String access, String refresh) async {
    await _storage.saveTokens(access: access, refresh: refresh);
    _api.setAccessToken(access);
    await _fetchUser();
    if (user!.offices.length == 1) {
      await selectOffice(user!.offices.first.officeId);
    } else {
      status = AuthStatus.needsOffice;
    }
  }

  Future<void> _fetchUser() async {
    final data = await _api.getJson('/auth/me');
    user = UserProfile.fromJson(data);
  }

  Future<void> _loadSession() async {
    final data = await _api.getJson('/mobile/session');
    session = MobileSession.fromJson(data, isDark: isDark);
    colors = session!.colors;
  }
}
