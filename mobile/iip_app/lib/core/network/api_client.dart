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

class ApiClient {
  ApiClient({http.Client? client, Duration? timeout})
      : _client = client ?? http.Client(),
        _timeout = timeout ?? const Duration(seconds: 12);

  final http.Client _client;
  final Duration _timeout;
  String? _accessToken;
  String? _officeId;

  void setAccessToken(String? token) => _accessToken = token;
  void setOfficeId(String? officeId) => _officeId = officeId;
  String? get officeId => _officeId;

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

  Future<http.Response> _get(Uri uri, {Map<String, String>? headers}) =>
      _client.get(uri, headers: headers).timeout(_timeout);

  Future<http.Response> _post(Uri uri, {Map<String, String>? headers, Object? body}) =>
      _client.post(uri, headers: headers, body: body).timeout(_timeout);

  Future<http.Response> _patch(Uri uri, {Map<String, String>? headers, Object? body}) =>
      _client.patch(uri, headers: headers, body: body).timeout(_timeout);

  Future<Map<String, dynamic>> getJson(String path) async {
    final response = await _get(
      Uri.parse('${AppConfig.baseUrl}$path'),
      headers: _headers(),
    );
    return _decode(response);
  }

  Future<Map<String, dynamic>> postJson(String path, Map<String, dynamic> body) async {
    final response = await _post(
      Uri.parse('${AppConfig.baseUrl}$path'),
      headers: _headers(jsonBody: true),
      body: jsonEncode(body),
    );
    return _decode(response);
  }

  Future<Map<String, dynamic>> patchJson(String path, Map<String, dynamic> body) async {
    final response = await _patch(
      Uri.parse('${AppConfig.baseUrl}$path'),
      headers: _headers(jsonBody: true),
      body: jsonEncode(body),
    );
    return _decode(response);
  }

  Future<void> postJsonNoContent(String path, Map<String, dynamic> body) async {
    final response = await _post(
      Uri.parse('${AppConfig.baseUrl}$path'),
      headers: _headers(jsonBody: true),
      body: jsonEncode(body),
    );
    if (response.statusCode >= 200 && response.statusCode < 300) return;
    throw ApiException(_extractError(response), statusCode: response.statusCode);
  }

  Future<Uint8List?> getBytes(String path) async {
    final response = await _get(
      Uri.parse('${AppConfig.baseUrl}$path'),
      headers: _headers(),
    );
    if (response.statusCode == 404) return null;
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return response.bodyBytes;
    }
    throw ApiException(_extractError(response), statusCode: response.statusCode);
  }

  Future<Map<String, dynamic>> uploadMultipart(
    String path,
    String fieldName,
    Uint8List bytes,
    String filename, {
    String contentType = 'image/jpeg',
  }) async {
    final request = http.MultipartRequest('POST', Uri.parse('${AppConfig.baseUrl}$path'));
    request.headers.addAll(_headers());
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
  }

  Future<List<dynamic>> getJsonList(String path) async {
    final response = await _get(
      Uri.parse('${AppConfig.baseUrl}$path'),
      headers: _headers(),
    );
    final decoded = _decodeRaw(response);
    if (decoded is List) return decoded;
    throw ApiException('Expected a JSON array.');
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
