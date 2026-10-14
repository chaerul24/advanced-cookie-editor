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
    } on PlatformException catch (_) {
      return [];
    }
  }

  /// Add or update a single cookie
  static Future<bool> setCookie(String url, CookieItem cookie) async {
    try {
      String targetUrl = url;
      if (cookie.domain.isNotEmpty) {
        final cleanDomain = cookie.domain.replaceFirst(RegExp(r'^\.+'), '').trim();
        if (cleanDomain.isNotEmpty) {
          final scheme = cookie.secure ? 'https://' : 'http://';
          targetUrl = '$scheme$cleanDomain${cookie.path.isNotEmpty ? cookie.path : '/'}';
        }
      }

      final res = await _channel.invokeMethod<bool>('setCookie', {
        'url': targetUrl,
        'cookie': cookie.toSetCookieString(),
      });
      return res ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Batch set multiple cookies at once with native async completion tracking
  static Future<int> setCookiesBatch(String activeUrl, List<CookieItem> cookies) async {
    try {
      final List<Map<String, String>> payload = [];
      for (var c in cookies) {
        String targetUrl = activeUrl;
        if (c.domain.isNotEmpty) {
          final cleanDomain = c.domain.replaceFirst(RegExp(r'^\.+'), '').trim();
          if (cleanDomain.isNotEmpty) {
            final scheme = c.secure ? 'https://' : 'http://';
            targetUrl = '$scheme$cleanDomain${c.path.isNotEmpty ? c.path : '/'}';
          }
        }
        payload.add({
          'url': targetUrl,
          'cookie': c.toSetCookieString(),
        });
      }

      final count = await _channel.invokeMethod<int>('setCookiesBatch', {
        'activeUrl': activeUrl,
        'cookies': payload,
      });
      return count ?? 0;
    } catch (_) {
      return 0;
    }
  }

  /// Remove a specific cookie
  static Future<bool> removeCookie(String url, CookieItem cookie) async {
    try {
      String targetUrl = url;
      if (cookie.domain.isNotEmpty) {
        final cleanDomain = cookie.domain.replaceFirst(RegExp(r'^\.+'), '').trim();
        if (cleanDomain.isNotEmpty) {
          final scheme = cookie.secure ? 'https://' : 'http://';
          targetUrl = '$scheme$cleanDomain${cookie.path.isNotEmpty ? cookie.path : '/'}';
        }
      }

      final res = await _channel.invokeMethod<bool>('removeCookie', {
        'url': targetUrl,
        'name': cookie.name,
        'domain': cookie.domain,
        'path': cookie.path,
      });
      return res ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Flush cookies from memory buffer to persistent disk storage
  static Future<void> flush() async {
    try {
      await _channel.invokeMethod<bool>('flushCookies');
    } catch (_) {}
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
