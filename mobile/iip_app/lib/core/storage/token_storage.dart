import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class TokenStorage {
  TokenStorage({FlutterSecureStorage? secure})
      : _secure = secure ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
            );

  final FlutterSecureStorage _secure;
  static const _accessKey = 'iip_access_token';
  static const _refreshKey = 'iip_refresh_token';
  static const _officeKey = 'iip_office_id';
  static const _themeKey = 'iip_theme_dark';

  Future<void> saveTokens({required String access, required String refresh}) async {
    await _secure.write(key: _accessKey, value: access);
    await _secure.write(key: _refreshKey, value: refresh);
  }

  Future<String?> readAccess() => _secure.read(key: _accessKey);

  Future<String?> readRefresh() => _secure.read(key: _refreshKey);

  Future<bool> hasStoredSession() async {
    final access = await readAccess();
    if (access != null && access.isNotEmpty) return true;
    final refresh = await readRefresh();
    return refresh != null && refresh.isNotEmpty;
  }

  Future<void> clearTokens() async {
    await _secure.delete(key: _accessKey);
    await _secure.delete(key: _refreshKey);
  }

  Future<void> saveOfficeId(String officeId) async {
    await _secure.write(key: _officeKey, value: officeId);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_officeKey, officeId);
  }

  Future<String?> readOfficeId() async {
    final fromSecure = await _secure.read(key: _officeKey);
    if (fromSecure != null && fromSecure.isNotEmpty) return fromSecure;
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_officeKey);
  }

  Future<void> clearOfficeId() async {
    await _secure.delete(key: _officeKey);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_officeKey);
  }

  Future<bool> readDarkMode() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_themeKey) ?? true;
  }

  Future<void> saveDarkMode(bool isDark) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_themeKey, isDark);
  }
}
