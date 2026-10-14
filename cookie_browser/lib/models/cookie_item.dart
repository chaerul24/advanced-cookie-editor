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
    final expNum = json['expirationDate'];
    final exp = expNum != null ? (expNum as num).toInt() : null;
    final sessionVal = json['session'];
    // If session is explicitly given as boolean, use it. Otherwise, if expirationDate exists, it's not a session cookie.
    final bool isSession = sessionVal is bool ? sessionVal : (exp == null);

    return CookieItem(
      name: json['name']?.toString() ?? '',
      value: json['value']?.toString() ?? '',
      domain: json['domain']?.toString() ?? '',
      path: json['path']?.toString() ?? '/',
      secure: json['secure'] == true,
      httpOnly: json['httpOnly'] == true,
      session: isSession,
      expirationDate: exp,
      sameSite: json['sameSite']?.toString() ?? 'lax',
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
