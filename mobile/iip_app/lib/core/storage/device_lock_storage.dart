import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

enum DeviceLockMethod { pin, biometric, both }

/// Persists app-lock PIN / biometric preferences (separate from API tokens).
class DeviceLockStorage {
  DeviceLockStorage({FlutterSecureStorage? secure})
      : _secure = secure ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
            );

  final FlutterSecureStorage _secure;

  static const _enabledKey = 'iip_device_lock_enabled';
  static const _methodKey = 'iip_device_lock_method';
  static const _userIdKey = 'iip_device_lock_user_id';
  static const _pinHashKey = 'iip_device_lock_pin_hash';
  static const _pinSaltKey = 'iip_device_lock_pin_salt';
  static const _biometricKey = 'iip_device_lock_biometric';
  static const _skippedKey = 'iip_device_lock_skipped';

  /// True only when lock is enabled and PIN or biometric is actually configured.
  Future<bool> isLockActive() async {
    if (await _secure.read(key: _enabledKey) != 'true') return false;
    return await hasPin() || await biometricEnabled();
  }

  Future<DeviceLockMethod?> readMethod() async {
    final v = await _secure.read(key: _methodKey);
    if (v == null) return null;
    return DeviceLockMethod.values.firstWhere(
      (m) => m.name == v,
      orElse: () => DeviceLockMethod.pin,
    );
  }

  Future<String?> readUserId() => _secure.read(key: _userIdKey);

  Future<bool> biometricEnabled() async {
    final v = await _secure.read(key: _biometricKey);
    return v == 'true';
  }

  Future<bool> hasPin() async {
    final hash = await _secure.read(key: _pinHashKey);
    final salt = await _secure.read(key: _pinSaltKey);
    return hash != null && hash.isNotEmpty && salt != null && salt.isNotEmpty;
  }

  /// User chose "Skip for now" — do not show setup again until sign-out clears this.
  Future<bool> isSetupSkipped(String userId) async {
    final v = await _secure.read(key: '$_skippedKey:$userId');
    return v == 'true';
  }

  Future<void> markSetupSkipped(String userId) async {
    await _secure.write(key: '$_skippedKey:$userId', value: 'true');
  }

  Future<void> clearSetupSkipped(String userId) async {
    await _secure.delete(key: '$_skippedKey:$userId');
  }

  /// Removes old "setup done" keys that blocked the setup screen after a failed save.
  Future<void> clearLegacySetupFlags(String userId) async {
    await _secure.delete(key: 'iip_device_lock_setup_done:$userId');
    final enabled = await _secure.read(key: _enabledKey);
    if (enabled == 'true' && !await hasPin() && !await biometricEnabled()) {
      await _secure.delete(key: _enabledKey);
      await _secure.delete(key: _methodKey);
      await _secure.delete(key: _userIdKey);
    }
  }

  Future<void> savePinLock({
    required String userId,
    required String pin,
    bool withBiometric = false,
  }) async {
    final salt = _randomSalt();
    final hash = _hashPin(pin, salt);
    await _secure.write(key: _pinHashKey, value: hash);
    await _secure.write(key: _pinSaltKey, value: salt);
    await _secure.write(key: _userIdKey, value: userId);
    await _secure.write(
      key: _methodKey,
      value: withBiometric ? DeviceLockMethod.both.name : DeviceLockMethod.pin.name,
    );
    await _secure.write(key: _biometricKey, value: withBiometric ? 'true' : 'false');
    await _secure.write(key: _enabledKey, value: 'true');
    await clearSetupSkipped(userId);
  }

  Future<void> saveBiometricOnlyLock({required String userId}) async {
    await _secure.delete(key: _pinHashKey);
    await _secure.delete(key: _pinSaltKey);
    await _secure.write(key: _userIdKey, value: userId);
    await _secure.write(key: _methodKey, value: DeviceLockMethod.biometric.name);
    await _secure.write(key: _biometricKey, value: 'true');
    await _secure.write(key: _enabledKey, value: 'true');
    await clearSetupSkipped(userId);
  }

  Future<bool> verifyPin(String pin) async {
    final hash = await _secure.read(key: _pinHashKey);
    final salt = await _secure.read(key: _pinSaltKey);
    if (hash == null || salt == null) return false;
    return hash == _hashPin(pin, salt);
  }

  Future<void> clearAll({String? userId}) async {
    await _secure.delete(key: _enabledKey);
    await _secure.delete(key: _methodKey);
    await _secure.delete(key: _userIdKey);
    await _secure.delete(key: _pinHashKey);
    await _secure.delete(key: _pinSaltKey);
    await _secure.delete(key: _biometricKey);
    if (userId != null && userId.isNotEmpty) {
      await clearSetupSkipped(userId);
      // Legacy key from earlier builds
      await _secure.delete(key: 'iip_device_lock_setup_done:$userId');
    }
  }

  String _hashPin(String pin, String salt) {
    final bytes = utf8.encode('$salt:$pin');
    return sha256.convert(bytes).toString();
  }

  String _randomSalt() {
    final r = Random.secure();
    return List.generate(16, (_) => r.nextInt(256)).join(',');
  }
}
