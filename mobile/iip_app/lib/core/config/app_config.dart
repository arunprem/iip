/// API base URL at build/run time:
/// - iOS Simulator / desktop: `http://127.0.0.1:8010`
/// - Android emulator: `http://10.0.2.2:8010`
/// - Physical Android/iOS on Wi‑Fi: Mac **Wi‑Fi** IP (not Ethernet if you have both)
///   Example: `http://192.168.1.59:8010` — verify with `ipconfig getifaddr en1` on Mac
class AppConfig {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://127.0.0.1:8010',
  );

  static const String apiPrefix = '/api/v1';
  static String get baseUrl => '$apiBaseUrl$apiPrefix';

  /// ML gateway (FRS). Override with `--dart-define=ML_BASE_URL=http://host:8020`
  static const String mlBaseUrl = String.fromEnvironment('ML_BASE_URL', defaultValue: '');

  static String get mlApiBase {
    if (mlBaseUrl.isNotEmpty) {
      final u = mlBaseUrl.endsWith('/') ? mlBaseUrl.substring(0, mlBaseUrl.length - 1) : mlBaseUrl;
      if (u.endsWith('/api/v1/ml')) return u;
      if (u.endsWith('/api/v1')) return '$u/ml';
      return '$u/api/v1/ml';
    }
    final root = apiBaseUrl.replaceAll(RegExp(r'/api/v1$'), '');
    if (root.contains(':8010')) {
      return '${root.replaceFirst(':8010', ':8020')}/api/v1/ml';
    }
    return '$root:8020/api/v1/ml';
  }
}
