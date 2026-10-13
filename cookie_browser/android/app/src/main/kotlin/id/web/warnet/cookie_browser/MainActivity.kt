package id.web.warnet.cookie_browser

import android.webkit.CookieManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity: FlutterActivity() {
    private val CHANNEL = "id.web.warnet.cookie_browser/cookies"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "getCookiesForUrl" -> {
                    val url = call.argument<String>("url")
                    if (url != null) {
                        val cookieString = cookieManager.getCookie(url)
                        result.success(cookieString ?: "")
                    } else {
                        result.error("INVALID_URL", "URL is required", null)
                    }
                }
                "setCookie" -> {
                    val url = call.argument<String>("url")
                    val cookie = call.argument<String>("cookie")
                    if (url != null && cookie != null) {
                        cookieManager.setCookie(url, cookie)
                        cookieManager.flush()
                        result.success(true)
                    } else {
                        result.error("INVALID_ARGS", "URL and cookie are required", null)
                    }
                }
                "removeCookie" -> {
                    val url = call.argument<String>("url")
                    val name = call.argument<String>("name")
                    val domain = call.argument<String>("domain")
                    val path = call.argument<String>("path") ?: "/"
                    if (url != null && name != null) {
                        val domStr = if (!domain.isNullOrEmpty()) "; domain=$domain" else ""
                        val expired = "$name=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; path=$path$domStr"
                        cookieManager.setCookie(url, expired)
                        cookieManager.flush()
                        result.success(true)
                    } else {
                        result.error("INVALID_ARGS", "URL and name are required", null)
                    }
                }
                "clearAllCookies" -> {
                    cookieManager.removeAllCookies { success ->
                        cookieManager.flush()
                        result.success(success)
                    }
                }
                else -> result.notImplemented()
            }
        }
    }
}
