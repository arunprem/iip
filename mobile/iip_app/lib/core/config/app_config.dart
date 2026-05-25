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
}
