import 'package:flutter/services.dart';
import '../models/cookie_item.dart';

class CookieManagerService {
  static const MethodChannel _channel = MethodChannel('id.web.warnet.cookie_browser/cookies');

  /// Fetch all cookies for a given URL
  static Future<List<CookieItem>> getCookies(String url) async {
    try {
      final String? raw = await _channel.invokeMethod<String>('getCookiesForUrl', {'url': url});
      if (raw == null || raw.trim().isEmpty) {
        return [];
      }

      final uri = Uri.tryParse(url);
      final defaultDomain = uri?.host ?? '';

      final List<CookieItem> list = [];
      final pairs = raw.split(';');

      for (var pair in pairs) {
        final trimmed = pair.trim();
        if (trimmed.isEmpty) continue;
        final eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          final name = trimmed.substring(0, eqIdx).trim();
          final val = trimmed.substring(eqIdx + 1).trim();
          list.add(CookieItem(
            name: name,
            value: val,
            domain: defaultDomain,
            path: '/',
            secure: url.startsWith('https://'),
            httpOnly: false, // Default indicator in client
            session: true,
          ));
        }
      }

      return list;
    } on PlatformException catch (e) {
      // Fallback or error
      return [];
    }
  }

  /// Add or update a cookie
  static Future<bool> setCookie(String url, CookieItem cookie) async {
    try {
      final res = await _channel.invokeMethod<bool>('setCookie', {
        'url': url,
        'cookie': cookie.toSetCookieString(),
      });
      return res ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Remove a specific cookie
  static Future<bool> removeCookie(String url, CookieItem cookie) async {
    try {
      final res = await _channel.invokeMethod<bool>('removeCookie', {
        'url': url,
        'name': cookie.name,
        'domain': cookie.domain,
        'path': cookie.path,
      });
      return res ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Clear all stored cookies
  static Future<bool> clearAll() async {
    try {
      final res = await _channel.invokeMethod<bool>('clearAllCookies');
      return res ?? false;
    } catch (_) {
      return false;
    }
  }
}
