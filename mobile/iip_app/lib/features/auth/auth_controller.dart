import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import '../../core/auth/auth_client_type.dart';
import '../../core/auth/jwt_utils.dart';
import '../../core/network/api_client.dart';
import '../../core/security/device_lock_service.dart';
import '../../core/storage/device_lock_storage.dart';
import '../../core/storage/profile_photo_cache.dart';
import '../../core/storage/token_storage.dart';
import '../../core/theme/iip_colors.dart';
import '../../models/auth_models.dart';
import '../../models/mobile_session.dart';
import '../../models/profile_models.dart';

enum AuthStatus {
  unknown,
  unauthenticated,
  needsOffice,
  needsDeviceLockSetup,
  needsDeviceUnlock,
  authenticated,
}

class AuthController extends ChangeNotifier {
  AuthController({
    ApiClient? api,
    TokenStorage? storage,
    DeviceLockStorage? deviceLock,
    DeviceLockService? deviceLockService,
    bool? initialDark,
  })  : _api = api ?? ApiClient(),
        _storage = storage ?? TokenStorage(),
        deviceLock = deviceLock ?? DeviceLockStorage(),
        _deviceLockService = deviceLockService ?? DeviceLockService(),
        isDark = initialDark ?? true,
        colors = (initialDark ?? true) ? IipColors.dark : IipColors.light {
    _api.tokenRefresher = _tryRefreshTokens;
    _api.onSessionExpired = _handleApiSessionExpired;
  }

  final ApiClient _api;
  ApiClient get api => _api;
  final TokenStorage _storage;
  final DeviceLockStorage deviceLock;
  final DeviceLockService _deviceLockService;

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
  late bool isDark;
  late IipColors colors;
  String? errorMessage;
  bool isBusy = false;
  int appSessionGeneration = 0;
  Timer? _proactiveRefreshTimer;

  static const _proactiveRefreshInterval = Duration(seconds: 45);
  static const _refreshBeforeExpiry = Duration(minutes: 2);

  Future<void> bootstrap() async {
    isDark = await _storage.readDarkMode();
    colors = isDark ? IipColors.dark : IipColors.light;
    errorMessage = null;
    try {
      await _restoreSessionFromStorage();
    } on ApiException catch (e) {
      await _handleBootstrapFailure(e);
    } catch (e) {
      await _handleBootstrapFailure(e);
    } finally {
      notifyListeners();
    }
  }

  /// Cold start: restore tokens, show app lock if configured, refresh JWT when expired.
  Future<void> _restoreSessionFromStorage() async {
    if (!await _storage.hasStoredSession()) {
      status = AuthStatus.unauthenticated;
      return;
    }

    var access = await _storage.readAccess();
    if (access == null || access.isEmpty) {
      final refreshed = await _tryRefreshTokens();
      if (!refreshed) {
        status = AuthStatus.unauthenticated;
        return;
      }
      access = await _storage.readAccess();
    }
    if (access == null || access.isEmpty) {
      status = AuthStatus.unauthenticated;
      return;
    }

    _api.setAccessToken(access);
    final officeId = await _storage.readOfficeId();
    if (officeId != null && officeId.isNotEmpty) {
      _api.setOfficeId(officeId);
    }

    // App lock is local — show unlock before any network call (works when JWT expired).
    if (await deviceLock.isLockActive()) {
      status = AuthStatus.needsDeviceUnlock;
      _startProactiveRefreshTimer();
      return;
    }

    if (officeId != null && officeId.isNotEmpty) {
      await _apiWithRefresh(() async {
        await _fetchUser();
        await _loadSession();
        try {
          await loadProfile();
        } catch (_) {}
        status = await _resolvePostSignInStatus();
      });
      _startProactiveRefreshTimer();
      return;
    }

    await _apiWithRefresh(() async {
      await _fetchUser();
      status = user!.offices.isEmpty ? AuthStatus.unauthenticated : AuthStatus.needsOffice;
    });
    if (status != AuthStatus.unauthenticated) {
      _startProactiveRefreshTimer();
    }
  }

  void _startProactiveRefreshTimer() {
    _proactiveRefreshTimer?.cancel();
    _proactiveRefreshTimer = Timer.periodic(
      _proactiveRefreshInterval,
      (_) => unawaited(_proactiveTokenRefresh()),
    );
    unawaited(_proactiveTokenRefresh());
  }

  void _stopProactiveRefreshTimer() {
    _proactiveRefreshTimer?.cancel();
    _proactiveRefreshTimer = null;
  }

  /// Refresh before JWT expiry and when the app returns to foreground.
  Future<void> refreshSessionIfNeeded() async {
    if (status == AuthStatus.unauthenticated) return;
    if (!await _storage.hasStoredSession()) return;
    await _proactiveTokenRefresh(forceWhenMissing: true);
  }

  Future<void> _proactiveTokenRefresh({bool forceWhenMissing = false}) async {
    if (status == AuthStatus.unauthenticated) return;

    var access = await _storage.readAccess();
    if (access == null || access.isEmpty) {
      if (forceWhenMissing) await _tryRefreshTokens();
      return;
    }

    if (jwtExpiresWithin(access, _refreshBeforeExpiry) || forceWhenMissing) {
      await _tryRefreshTokens();
    }
  }

  Future<void> _handleApiSessionExpired() async {
    if (status == AuthStatus.unauthenticated) return;
    _stopProactiveRefreshTimer();
    await _clearSessionToLogin('Session expired. Please sign in again.');
    notifyListeners();
  }

  Future<bool> _tryRefreshTokens() async {
    final refresh = await _storage.readRefresh();
    if (refresh == null || refresh.isEmpty) return false;
    try {
      final data = await _api.postJson('/auth/refresh', {
        'refresh_token': refresh,
        'client_type': kAuthClientMobile,
      });
      final access = data['access_token'] as String?;
      final newRefresh = data['refresh_token'] as String?;
      if (access == null ||
          access.isEmpty ||
          newRefresh == null ||
          newRefresh.isEmpty) {
        return false;
      }
      await _storage.saveTokens(access: access, refresh: newRefresh);
      _api.setAccessToken(access);
      return true;
    } catch (_) {
      return false;
    }
  }

  @override
  void dispose() {
    _stopProactiveRefreshTimer();
    super.dispose();
  }

  Future<void> _apiWithRefresh(Future<void> Function() action) async {
    try {
      await action();
    } on ApiException catch (e) {
      if (!_isAuthApiError(e) || !await _tryRefreshTokens()) rethrow;
      await action();
    }
  }

  bool _isAuthApiError(ApiException e) =>
      e.statusCode == 401 || e.statusCode == 403;

  bool _isTransientError(Object e) {
    if (e is ApiException) {
      final code = e.statusCode;
      if (code == null) return true;
      if (code >= 500) return true;
      return false;
    }
    return e is TimeoutException ||
        e is SocketException ||
        e is HandshakeException ||
        e is IOException;
  }

  String _safeErrorMessage(
    Object error, {
    String fallback = 'Something went wrong. Please try again.',
  }) {
    if (error is ApiException) {
      final msg = error.message.trim();
      if (msg.isNotEmpty) return msg;
      return fallback;
    }
    if (_isTransientError(error)) {
      return 'Cannot connect to server. Check your network and try again.';
    }
    return fallback;
  }

  Future<void> _handleBootstrapFailure(Object e) async {
    if (e is ApiException && _isAuthApiError(e)) {
      if (await _tryRefreshTokens()) {
        try {
          await _restoreSessionFromStorage();
          return;
        } catch (retryError) {
          await _handleBootstrapFailure(retryError);
          return;
        }
      }
      await _clearSessionToLogin(
        e.message.isNotEmpty ? e.message : 'Session expired. Please sign in again.',
      );
      return;
    }

    if (_isTransientError(e) || (e is ApiException && !_isAuthApiError(e))) {
      final kept = await _bootstrapOfflineFallback();
      if (!kept) {
        errorMessage = e is ApiException
            ? e.message
            : 'Cannot reach server. Check API URL and Wi‑Fi.';
      }
      return;
    }

    final kept = await _bootstrapOfflineFallback();
    if (!kept) {
      await _clearSessionToLogin('Could not restore your session. Please sign in again.');
    }
  }

  /// Keep local session when the server is unreachable; still show app lock if set.
  Future<bool> _bootstrapOfflineFallback() async {
    if (!await _storage.hasStoredSession()) return false;

    final access = await _storage.readAccess();
    if (access != null && access.isNotEmpty) {
      _api.setAccessToken(access);
    }

    final officeId = await _storage.readOfficeId();
    if (officeId != null && officeId.isNotEmpty) {
      _api.setOfficeId(officeId);
    }

    if (await deviceLock.isLockActive()) {
      status = AuthStatus.needsDeviceUnlock;
      errorMessage = null;
      return true;
    }

    if (officeId != null && officeId.isNotEmpty) {
      status = AuthStatus.authenticated;
      errorMessage = 'Cannot reach server. You are still signed in.';
      _startProactiveRefreshTimer();
      return true;
    }

    return false;
  }

  Future<void> _clearSessionToLogin(String message) async {
    _stopProactiveRefreshTimer();
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
        'client_type': kAuthClientMobile,
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
    } catch (e) {
      errorMessage = _safeErrorMessage(
        e,
        fallback: 'Sign-in failed. Please try again.',
      );
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
    } catch (e) {
      errorMessage = _safeErrorMessage(
        e,
        fallback: 'Verification failed. Please try again.',
      );
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
      await _afterOfficeSelected();
    } catch (e) {
      errorMessage = _safeErrorMessage(
        e,
        fallback: 'Could not switch unit. Please try again.',
      );
      rethrow;
    } finally {
      isBusy = false;
      notifyListeners();
    }
  }

  Future<void> _afterOfficeSelected() async {
    await _loadSession();
    try {
      await loadProfile();
    } catch (_) {}
    _warmProfilePhotoCache();
    status = await _resolvePostSignInStatus();
  }

  /// After password login + office: require app lock setup until configured or skipped.
  Future<AuthStatus> _resolvePostSignInStatus() async {
    if (await deviceLock.isLockActive()) {
      return AuthStatus.authenticated;
    }
    final userId = user?.userId ?? profile?.userId ?? '';
    if (userId.isEmpty) return AuthStatus.authenticated;
    await deviceLock.clearLegacySetupFlags(userId);
    if (await deviceLock.isSetupSkipped(userId)) {
      return AuthStatus.authenticated;
    }
    return AuthStatus.needsDeviceLockSetup;
  }

  Future<void> completeDeviceUnlock() async {
    isBusy = true;
    notifyListeners();
    try {
      await _enterAuthenticated(loadProfile: true);
    } finally {
      isBusy = false;
      notifyListeners();
    }
  }

  Future<void> _enterAuthenticated({required bool loadProfile}) async {
    try {
      await _apiWithRefresh(_loadSession);
    } on ApiException catch (e) {
      if (_isAuthApiError(e)) {
        await _clearSessionToLogin(
          e.message.isNotEmpty ? e.message : 'Session expired. Please sign in again.',
        );
        return;
      }
      status = AuthStatus.needsDeviceUnlock;
      errorMessage = 'Network unavailable. Check connection and try again.';
      return;
    } catch (_) {
      status = AuthStatus.needsDeviceUnlock;
      errorMessage = 'Network unavailable. Check connection and try again.';
      return;
    }
    if (profile == null && user == null) {
      try {
        await _apiWithRefresh(_fetchUser);
      } on ApiException catch (e) {
        if (_isAuthApiError(e)) {
          await _clearSessionToLogin(
            e.message.isNotEmpty ? e.message : 'Session expired. Please sign in again.',
          );
          return;
        }
      } catch (_) {}
    }
    if (loadProfile) {
      _loadProfileInBackground();
    }
    status = AuthStatus.authenticated;
    errorMessage = null;
    _startProactiveRefreshTimer();
  }

  Future<void> skipDeviceLockSetup() async {
    final userId = user?.userId ?? profile?.userId;
    if (userId != null && userId.isNotEmpty) {
      await deviceLock.markSetupSkipped(userId);
    }
    status = AuthStatus.authenticated;
    notifyListeners();
  }

  Future<void> setupDeviceLockPin(String pin, {required bool withBiometric}) async {
    final userId = user?.userId ?? profile?.userId;
    if (userId == null || userId.isEmpty) {
      throw StateError('User not loaded.');
    }
    if (pin.length != 6) {
      throw ArgumentError('PIN must be 6 digits.');
    }
    await deviceLock.savePinLock(userId: userId, pin: pin, withBiometric: withBiometric);
    status = AuthStatus.authenticated;
    notifyListeners();
  }

  Future<void> setupDeviceLockBiometricOnly() async {
    final userId = user?.userId ?? profile?.userId;
    if (userId == null || userId.isEmpty) {
      throw StateError('User not loaded.');
    }
    if (!await _deviceLockService.canUseBiometrics()) {
      throw StateError('Biometrics not available on this device.');
    }
    await deviceLock.saveBiometricOnlyLock(userId: userId);
    status = AuthStatus.authenticated;
    notifyListeners();
  }

  Future<bool> verifyDeviceLockPin(String pin) => deviceLock.verifyPin(pin);

  void _warmProfilePhotoCache() {
    if (!officerHasProfilePhoto) return;
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
    } catch (e) {
      errorMessage = _safeErrorMessage(
        e,
        fallback: 'Could not update profile. Please try again.',
      );
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
    } catch (e) {
      errorMessage = _safeErrorMessage(
        e,
        fallback: 'Could not change password. Please try again.',
      );
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
    } catch (e) {
      errorMessage = _safeErrorMessage(
        e,
        fallback: 'Could not upload profile photo. Please try again.',
      );
      rethrow;
    }
  }

  /// True when IAM reports a stored profile photo (`/auth/me` or `/auth/me/profile`).
  bool get officerHasProfilePhoto =>
      profile?.hasProfilePhoto == true || user?.hasProfilePhoto == true;

  bool get hasCachedProfilePhoto {
    final userId = profile?.userId ?? user?.userId;
    if (userId == null || !officerHasProfilePhoto) return false;
    return _memoryPhotoUserId == userId &&
        _memoryPhotoVersion == profilePhotoVersion &&
        _memoryProfilePhoto != null;
  }

  /// Loads profile photo: memory → disk → network (only if cache miss).
  Future<Uint8List?> fetchProfilePhotoBytes({bool forceNetwork = false}) async {
    final userId = profile?.userId ?? user?.userId;
    if (userId == null || !officerHasProfilePhoto) {
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
    _stopProactiveRefreshTimer();
    final userId = profile?.userId ?? user?.userId;
    await _storage.clearTokens();
    await _storage.clearOfficeId();
    await deviceLock.clearAll(userId: userId);
    _api.setAccessToken(null);
    _api.setOfficeId(null);
    _clearProfilePhotoMemory();
    if (userId != null) await ProfilePhotoCache.clearUser(userId);
    user = null;
    profile = null;
    session = null;
    profilePhotoVersion = 0;
    mfaToken = null;
    enrollmentRequired = false;
    errorMessage = null;
    appSessionGeneration++;
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
    _startProactiveRefreshTimer();
    await _fetchUser();
    if (user!.offices.length == 1) {
      await selectOffice(user!.offices.first.officeId);
      notifyListeners();
    } else {
      status = AuthStatus.needsOffice;
      notifyListeners();
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
