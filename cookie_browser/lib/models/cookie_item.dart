import 'dart:convert';

/// Representation of an HTTP/Browser Cookie
class CookieItem {
  final String name;
  String value;
  String domain;
  String path;
  bool secure;
  bool httpOnly;
  bool session;
  int? expirationDate; // Unix epoch in seconds
  String sameSite; // 'no_restriction', 'lax', 'strict', 'unspecified'

  CookieItem({
    required this.name,
    required this.value,
    this.domain = '',
    this.path = '/',
    this.secure = false,
    this.httpOnly = false,
    this.session = true,
    this.expirationDate,
    this.sameSite = 'lax',
  });

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'value': value,
      'domain': domain,
      'path': path,
      'secure': secure,
      'httpOnly': httpOnly,
      'session': session,
      if (expirationDate != null) 'expirationDate': expirationDate,
      'sameSite': sameSite,
    };
  }

  factory CookieItem.fromJson(Map<String, dynamic> json) {
    return CookieItem(
      name: json['name']?.toString() ?? '',
      value: json['value']?.toString() ?? '',
      domain: json['domain']?.toString() ?? '',
      path: json['path']?.toString() ?? '/',
      secure: json['secure'] == true,
      httpOnly: json['httpOnly'] == true,
      session: json['session'] != false,
      expirationDate: json['expirationDate'] != null ? (json['expirationDate'] as num).toInt() : null,
      sameSite: json['sameSite']?.toString() ?? 'lax',
    );
  }

  /// Format cookie for Set-Cookie header in Android WebView
  String toSetCookieString() {
    final parts = <String>['$name=$value'];
    if (domain.isNotEmpty) parts.add('domain=$domain');
    if (path.isNotEmpty) parts.add('path=$path');
    if (expirationDate != null && !session) {
      final nowSec = DateTime.now().millisecondsSinceEpoch ~/ 1000;
      final maxAge = expirationDate! - nowSec;
      if (maxAge > 0) {
        parts.add('Max-Age=$maxAge');
      }
    }
    if (secure) parts.add('Secure');
    if (httpOnly) parts.add('HttpOnly');
    if (sameSite.isNotEmpty && sameSite != 'unspecified') {
      if (sameSite == 'no_restriction') {
        parts.add('SameSite=None');
        // Modern Chromium enforces Secure when SameSite=None
        if (!secure) parts.add('Secure');
      } else if (sameSite == 'lax') {
        parts.add('SameSite=Lax');
      } else if (sameSite == 'strict') {
        parts.add('SameSite=Strict');
      }
    }
    return parts.join('; ');
  }

  /// Copy as Header format (name=value)
  String toHeaderFormat() => '$name=$value';
}
