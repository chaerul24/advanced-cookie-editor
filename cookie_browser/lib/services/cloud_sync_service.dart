import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/cookie_item.dart';
import 'crypto_service.dart';

class CloudSyncService {
  static const String defaultServerUrl = 'https://erul.my.id/api/cookies';
  static const String defaultHealthUrl = 'https://erul.my.id/health';

  /// Check server health
  static Future<bool> checkHealth([String url = defaultHealthUrl]) async {
    try {
      final res = await http.get(Uri.parse(url)).timeout(const Duration(seconds: 6));
      if (res.statusCode == 200) {
        final data = json.decode(res.body);
        return data['status'] == 'ok';
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  /// Push cookies to cloud server
  static Future<Map<String, dynamic>> pushCookies(
    List<CookieItem> cookies, {
    String serverUrl = defaultServerUrl,
    String? domain,
    bool encrypt = false,
    String password = '',
  }) async {
    final payloadMap = {
      'format': 'advanced-cookie-editor',
      'version': 1,
      'exportedAt': DateTime.now().toUtc().toIso8601String(),
      'itemCount': cookies.length,
      'metadata': {
        'client': 'Cookie Browser Android APK',
        'domain': domain ?? 'all',
      },
      'cookies': cookies.map((c) => c.toJson()).toList(),
    };

    String bodyStr;
    if (encrypt && password.isNotEmpty) {
      final encryptedEnvelope = CryptoService.encryptPayload(json.encode(payloadMap), password);
      bodyStr = json.encode(encryptedEnvelope);
    } else {
      bodyStr = json.encode(payloadMap);
    }

    final res = await http.post(
      Uri.parse(serverUrl),
      headers: {'Content-Type': 'application/json'},
      body: bodyStr,
    ).timeout(const Duration(seconds: 15));

    if (res.statusCode >= 200 && res.statusCode < 300) {
      return json.decode(res.body) as Map<String, dynamic>;
    } else {
      throw Exception('Server returned ${res.statusCode}: ${res.body}');
    }
  }

  /// Fetch latest backup from server
  static Future<List<CookieItem>> fetchLatest({
    String serverUrl = defaultServerUrl,
    String? password,
  }) async {
    final latestUrl = serverUrl.endsWith('/latest')
        ? serverUrl
        : '${serverUrl.replaceAll(RegExp(r'/+$'), '')}/latest';

    final res = await http.get(Uri.parse(latestUrl)).timeout(const Duration(seconds: 10));

    if (res.statusCode != 200) {
      throw Exception('Failed to fetch backup (HTTP ${res.statusCode})');
    }

    final data = json.decode(res.body);
    final dynamic rawPayload = data['payload'] ?? data;

    Map<String, dynamic> finalMap;
    if (rawPayload is Map<String, dynamic> && rawPayload['format'] == 'advanced-cookie-editor-encrypted') {
      if (password == null || password.isEmpty) {
        throw Exception('Cloud backup is encrypted. Password required.');
      }
      final decryptedStr = CryptoService.decryptPayload(rawPayload, password);
      finalMap = json.decode(decryptedStr) as Map<String, dynamic>;
    } else if (rawPayload is Map<String, dynamic>) {
      finalMap = rawPayload;
    } else {
      throw Exception('Unrecognized backup format');
    }

    final cookieList = finalMap['cookies'] as List<dynamic>? ?? [];
    return cookieList.map((c) => CookieItem.fromJson(c as Map<String, dynamic>)).toList();
  }
}
