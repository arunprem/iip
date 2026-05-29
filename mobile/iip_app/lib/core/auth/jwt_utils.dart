import 'dart:convert';

/// Reads JWT `exp` (seconds since epoch) without verifying the signature.
int? jwtExpiryEpoch(String token) {
  try {
    final parts = token.split('.');
    if (parts.length != 3) return null;
    final normalized = base64Url.normalize(parts[1]);
    final payload = jsonDecode(utf8.decode(base64Url.decode(normalized)));
    if (payload is! Map<String, dynamic>) return null;
    final exp = payload['exp'];
    if (exp is int) return exp;
    if (exp is num) return exp.toInt();
  } catch (_) {}
  return null;
}

bool jwtExpiresWithin(String token, Duration window) {
  final exp = jwtExpiryEpoch(token);
  if (exp == null) return false;
  final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
  return exp - now <= window.inSeconds;
}
