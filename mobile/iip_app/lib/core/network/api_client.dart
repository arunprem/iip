import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import '../config/app_config.dart';

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});
  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

/// Returns true when tokens were rotated successfully.
typedef TokenRefresher = Future<bool> Function();

class ApiClient {
  ApiClient({http.Client? client, Duration? timeout})
      : _client = client ?? http.Client(),
        _timeout = timeout ?? const Duration(seconds: 12);

  final http.Client _client;
  final Duration _timeout;
  String? _accessToken;
  String? _officeId;

  TokenRefresher? tokenRefresher;
  Future<void> Function()? onSessionExpired;

  Future<bool>? _refreshInFlight;

  void setAccessToken(String? token) => _accessToken = token;
  void setOfficeId(String? officeId) => _officeId = officeId;
  String? get officeId => _officeId;

  static const _authFreePaths = {
    '/auth/login',
    '/auth/refresh',
    '/captcha/',
  };

  Map<String, String> _headers({bool jsonBody = false}) {
    final headers = <String, String>{
      'Accept': 'application/json',
      if (jsonBody) 'Content-Type': 'application/json',
    };
    if (_accessToken != null) {
      headers['Authorization'] = 'Bearer $_accessToken';
    }
    if (_officeId != null) {
      headers['X-Office-Id'] = _officeId!;
    }
    return headers;
  }

  bool _isAuthFreePath(String path) {
    for (final prefix in _authFreePaths) {
      if (path.startsWith(prefix)) return true;
    }
    return false;
  }

  bool _shouldAttemptRefresh(ApiException error, String path) {
    if (_isAuthFreePath(path)) return false;
    if (tokenRefresher == null) return false;
    return error.statusCode == 401;
  }

  Future<bool> _coordinatedRefresh() {
    final inFlight = _refreshInFlight;
    if (inFlight != null) return inFlight;

    final future = tokenRefresher!();
    _refreshInFlight = future;
    return future.whenComplete(() => _refreshInFlight = null);
  }

  Future<T> _withAuthRetry<T>(
    String path,
    Future<T> Function() request,
  ) async {
    try {
      return await request();
    } on ApiException catch (error) {
      if (!_shouldAttemptRefresh(error, path)) rethrow;

      final refreshed = await _coordinatedRefresh();
      if (!refreshed) {
        await onSessionExpired?.call();
        rethrow;
      }

      return await request();
    }
  }

  Future<http.Response> _get(Uri uri, {Map<String, String>? headers}) =>
      _client.get(uri, headers: headers).timeout(_timeout);

  Future<http.Response> _post(Uri uri, {Map<String, String>? headers, Object? body}) =>
      _client.post(uri, headers: headers, body: body).timeout(_timeout);

  Future<http.Response> _patch(Uri uri, {Map<String, String>? headers, Object? body}) =>
      _client.patch(uri, headers: headers, body: body).timeout(_timeout);

  Future<http.Response> _delete(Uri uri, {Map<String, String>? headers}) =>
      _client.delete(uri, headers: headers).timeout(_timeout);

  Future<Map<String, dynamic>> getJson(String path) async {
    return _withAuthRetry(path, () async {
      final response = await _get(
        Uri.parse('${AppConfig.baseUrl}$path'),
        headers: _headers(),
      );
      return _decode(response);
    });
  }

  Future<Map<String, dynamic>> postJson(String path, Map<String, dynamic> body) async {
    return _withAuthRetry(path, () async {
      final response = await _post(
        Uri.parse('${AppConfig.baseUrl}$path'),
        headers: _headers(jsonBody: true),
        body: jsonEncode(body),
      );
      return _decode(response);
    });
  }

  Future<Map<String, dynamic>> patchJson(String path, Map<String, dynamic> body) async {
    return _withAuthRetry(path, () async {
      final response = await _patch(
        Uri.parse('${AppConfig.baseUrl}$path'),
        headers: _headers(jsonBody: true),
        body: jsonEncode(body),
      );
      return _decode(response);
    });
  }

  Future<void> patchNoContent(String path) async {
    await _withAuthRetry(path, () async {
      final response = await _patch(
        Uri.parse('${AppConfig.baseUrl}$path'),
        headers: _headers(),
      );
      if (response.statusCode >= 200 && response.statusCode < 300) return;
      throw ApiException(_extractError(response), statusCode: response.statusCode);
    });
  }

  Future<void> deleteNoContent(String path) async {
    await _withAuthRetry(path, () async {
      final response = await _delete(
        Uri.parse('${AppConfig.baseUrl}$path'),
        headers: _headers(),
      );
      if (response.statusCode >= 200 && response.statusCode < 300) return;
      throw ApiException(_extractError(response), statusCode: response.statusCode);
    });
  }

  Future<void> postJsonNoContent(String path, Map<String, dynamic> body) async {
    await _withAuthRetry(path, () async {
      final response = await _post(
        Uri.parse('${AppConfig.baseUrl}$path'),
        headers: _headers(jsonBody: true),
        body: jsonEncode(body),
      );
      if (response.statusCode >= 200 && response.statusCode < 300) return;
      throw ApiException(_extractError(response), statusCode: response.statusCode);
    });
  }

  Future<Uint8List?> getBytes(String path) async {
    return _withAuthRetry(path, () async {
      final response = await _get(
        Uri.parse('${AppConfig.baseUrl}$path'),
        headers: _headers(),
      );
      if (response.statusCode == 404) return null;
      if (response.statusCode >= 200 && response.statusCode < 300) {
        return response.bodyBytes;
      }
      throw ApiException(_extractError(response), statusCode: response.statusCode);
    });
  }

  Future<Map<String, dynamic>> uploadMultipart(
    String path,
    String fieldName,
    Uint8List bytes,
    String filename, {
    String contentType = 'image/jpeg',
  }) async {
    return _withAuthRetry(path, () async {
      return _uploadMultipartTo(
        '${AppConfig.baseUrl}$path',
        fieldName,
        bytes,
        filename,
        contentType: contentType,
        timeout: _timeout,
      );
    });
  }

  Future<Map<String, dynamic>> uploadMultipartWithFields(
    String path,
    String fieldName,
    Uint8List bytes,
    String filename,
    Map<String, String> fields, {
    String contentType = 'image/jpeg',
  }) async {
    return _withAuthRetry(path, () async {
      final url = '${AppConfig.baseUrl}$path';
      final request = http.MultipartRequest('POST', Uri.parse(url));
      request.headers.addAll(_headers());
      request.fields.addAll(fields);
      request.files.add(
        http.MultipartFile.fromBytes(
          fieldName,
          bytes,
          filename: filename,
          contentType: http.MediaType.parse(contentType),
        ),
      );
      final streamed = await _client.send(request).timeout(_timeout);
      final response = await http.Response.fromStream(streamed).timeout(_timeout);
      return _decode(response);
    });
  }

  /// ML gateway JSON (AFIS identify, etc.).
  Future<Map<String, dynamic>> postJsonMl(
    String path,
    Map<String, dynamic> body, {
    Duration timeout = const Duration(seconds: 30),
  }) async {
    return _withAuthRetry(path, () async {
      final response = await _post(
        Uri.parse('${AppConfig.mlApiBase}$path'),
        headers: _headers(jsonBody: true),
        body: jsonEncode(body),
      ).timeout(timeout);
      return _decode(response);
    });
  }

  /// ML gateway uploads (FRS) — longer timeout for model inference.
  Future<Map<String, dynamic>> uploadMultipartMl(
    String path,
    String fieldName,
    Uint8List bytes,
    String filename, {
    String contentType = 'image/jpeg',
    Duration timeout = const Duration(seconds: 90),
  }) async {
    return _withAuthRetry(path, () async {
      return _uploadMultipartTo(
        '${AppConfig.mlApiBase}$path',
        fieldName,
        bytes,
        filename,
        contentType: contentType,
        timeout: timeout,
      );
    });
  }

  Future<Map<String, dynamic>> _uploadMultipartTo(
    String url,
    String fieldName,
    Uint8List bytes,
    String filename, {
    required String contentType,
    required Duration timeout,
  }) async {
    final request = http.MultipartRequest('POST', Uri.parse(url));
    request.headers.addAll(_headers());
    request.files.add(
      http.MultipartFile.fromBytes(
        fieldName,
        bytes,
        filename: filename,
        contentType: http.MediaType.parse(contentType),
      ),
    );
    final streamed = await _client.send(request).timeout(timeout);
    final response = await http.Response.fromStream(streamed).timeout(timeout);
    return _decode(response);
  }

  Future<List<dynamic>> getJsonList(String path) async {
    return _withAuthRetry(path, () async {
      final response = await _get(
        Uri.parse('${AppConfig.baseUrl}$path'),
        headers: _headers(),
      );
      final decoded = _decodeRaw(response);
      if (decoded is List) return decoded;
      throw ApiException('Expected a JSON array.');
    });
  }

  Map<String, dynamic> _decode(http.Response response) {
    final decoded = _decodeRaw(response);
    if (decoded is Map<String, dynamic>) return decoded;
    throw ApiException('Unexpected response format.', statusCode: response.statusCode);
  }

  dynamic _decodeRaw(http.Response response) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isEmpty) return {};
      return jsonDecode(response.body);
    }
    final message = _extractError(response);
    throw ApiException(message, statusCode: response.statusCode);
  }

  String _extractError(http.Response response) {
    try {
      final data = jsonDecode(response.body);
      if (data is Map) {
        final err = data['error'];
        if (err is Map && err['detail'] is String) return err['detail'] as String;
        if (data['detail'] is String) return data['detail'] as String;
      }
    } catch (_) {}
    return 'Request failed (${response.statusCode})';
  }
}
