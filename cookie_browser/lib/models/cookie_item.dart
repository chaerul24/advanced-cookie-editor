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
      'hostOnly': !domain.startsWith('.'),
      'path': path,
      'secure': secure,
      'httpOnly': httpOnly,
      'sameSite': sameSite,
      'session': session,
      if (expirationDate != null) 'expirationDate': expirationDate,
    };
  }

  factory CookieItem.fromJson(Map<String, dynamic> json) {
    int? exp;
    if (json['expirationDate'] != null) {
      final num val = json['expirationDate'] as num;
      if (val > 100000000000) {
        exp = (val ~/ 1000).toInt();
      } else {
        exp = val.toInt();
      }
    }

    final sessionVal = json['session'];
    final bool isSession = sessionVal is bool ? sessionVal : (exp == null);

    String sameSiteRaw = (json['sameSite']?.toString() ?? 'lax').toLowerCase().trim();
    if (sameSiteRaw == 'none' || sameSiteRaw == 'no_restriction') {
      sameSiteRaw = 'no_restriction';
    } else if (sameSiteRaw == 'strict') {
      sameSiteRaw = 'strict';
    } else if (sameSiteRaw == 'lax') {
      sameSiteRaw = 'lax';
    } else {
      sameSiteRaw = 'unspecified';
    }

    String path = json['path']?.toString().trim() ?? '/';
    if (path.isEmpty) path = '/';

    return CookieItem(
      name: json['name']?.toString() ?? '',
      value: json['value']?.toString() ?? '',
      domain: json['domain']?.toString().trim() ?? '',
      path: path,
      secure: json['secure'] == true,
      httpOnly: json['httpOnly'] == true,
      session: isSession,
      expirationDate: exp,
      sameSite: sameSiteRaw,
    );
  }

  /// Format cookie for Set-Cookie header in Android WebView
  String toSetCookieString() {
    final parts = <String>['$name=$value'];

    // RFC 6265bis: __Host- cookies must not specify a Domain attribute
    if (domain.isNotEmpty && !name.startsWith('__Host-')) {
      parts.add('Domain=$domain');
    }

    if (path.isNotEmpty) {
      parts.add('Path=$path');
    }

    if (expirationDate != null) {
      final nowSec = DateTime.now().millisecondsSinceEpoch ~/ 1000;
      final maxAge = expirationDate! - nowSec;
      if (maxAge > 0) {
        parts.add('Max-Age=$maxAge');
        final expDate = DateTime.fromMillisecondsSinceEpoch(expirationDate! * 1000, isUtc: true);
        parts.add('Expires=${_formatHttpDate(expDate)}');
      }
    }

    // Google auth cookies starting with __Secure- or __Host- strictly require Secure flag
    final isSecureCookie = secure || name.startsWith('__Secure-') || name.startsWith('__Host-');
    if (isSecureCookie) {
      parts.add('Secure');
    }

    if (httpOnly) {
      parts.add('HttpOnly');
    }

    if (sameSite.isNotEmpty && sameSite != 'unspecified') {
      if (sameSite == 'no_restriction') {
        parts.add('SameSite=None');
        // Modern Chromium strictly enforces Secure when SameSite=None
        if (!isSecureCookie) parts.add('Secure');
      } else if (sameSite == 'lax') {
        parts.add('SameSite=Lax');
      } else if (sameSite == 'strict') {
        parts.add('SameSite=Strict');
      }
    }

    return parts.join('; ');
  }

  static String _formatHttpDate(DateTime date) {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final dName = days[date.weekday - 1];
    final mName = months[date.month - 1];
    final day = date.day.toString().padLeft(2, '0');
    final year = date.year;
    final hour = date.hour.toString().padLeft(2, '0');
    final min = date.minute.toString().padLeft(2, '0');
    final sec = date.second.toString().padLeft(2, '0');
    return '$dName, $day $mName $year $hour:$min:$sec GMT';
  }

  /// Copy as Header format (name=value)
  String toHeaderFormat() => '$name=$value';
}
