package id.web.warnet.cookie_browser

import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.util.concurrent.atomic.AtomicInteger

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
                        val targets = getTargetUrls(url, cookie)
                        val pending = AtomicInteger(targets.size)
                        val mainHandler = Handler(Looper.getMainLooper())

                        for (target in targets) {
                            cookieManager.setCookie(target, cookie) {
                                if (pending.decrementAndGet() == 0) {
                                    cookieManager.flush()
                                    mainHandler.post {
                                        result.success(true)
                                    }
                                }
                            }
                        }
                    } else {
                        result.error("INVALID_ARGS", "URL and cookie are required", null)
                    }
                }
                "setCookiesBatch" -> {
                    val cookiesList = call.argument<List<Map<String, String>>>("cookies")
                    val activeUrl = call.argument<String>("activeUrl") ?: ""
                    if (cookiesList != null) {
                        if (cookiesList.isEmpty()) {
                            cookieManager.flush()
                            result.success(0)
                            return@setMethodCallHandler
                        }

                        val tasks = mutableListOf<Pair<String, String>>()
                        for (item in cookiesList) {
                            val rawUrl = item["url"] ?: activeUrl
                            val cookieStr = item["cookie"] ?: ""
                            if (cookieStr.isNotEmpty()) {
                                val targets = getTargetUrls(rawUrl, cookieStr)
                                for (target in targets) {
                                    tasks.add(Pair(target, cookieStr))
                                }
                            }
                        }

                        if (tasks.isEmpty()) {
                            cookieManager.flush()
                            result.success(0)
                            return@setMethodCallHandler
                        }

                        val pending = AtomicInteger(tasks.size)
                        val mainHandler = Handler(Looper.getMainLooper())
                        var successCount = 0

                        for (task in tasks) {
                            cookieManager.setCookie(task.first, task.second) { success ->
                                if (success) {
                                    synchronized(this) { successCount++ }
                                }
                                if (pending.decrementAndGet() == 0) {
                                    cookieManager.flush()
                                    mainHandler.post {
                                        result.success(cookiesList.size)
                                    }
                                }
                            }
                        }
                    } else {
                        result.error("INVALID_ARGS", "cookies list is required", null)
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
                        val targets = mutableSetOf<String>()
                        targets.add(url)
                        if (!domain.isNullOrEmpty()) {
                            val clean = domain.trimStart('.').trim()
                            if (clean.isNotEmpty()) {
                                targets.add("https://$clean$path")
                                targets.add("http://$clean$path")
                                if (clean.contains("youtube.com")) {
                                    targets.add("https://m.youtube.com$path")
                                    targets.add("https://www.youtube.com$path")
                                }
                                if (clean.contains("google.com")) {
                                    targets.add("https://accounts.google.com$path")
                                }
                            }
                        }

                        val pending = AtomicInteger(targets.size)
                        val mainHandler = Handler(Looper.getMainLooper())

                        for (target in targets) {
                            cookieManager.setCookie(target, expired) {
                                if (pending.decrementAndGet() == 0) {
                                    cookieManager.flush()
                                    mainHandler.post {
                                        result.success(true)
                                    }
                                }
                            }
                        }
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
                "flushCookies" -> {
                    cookieManager.flush()
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun getTargetUrls(url: String, cookie: String): Set<String> {
        val targets = mutableSetOf<String>()
        if (url.isNotEmpty() && !url.startsWith("about:")) {
            targets.add(url)
        }

        val domainRegex = Regex("domain=([^;\\s]+)", RegexOption.IGNORE_CASE)
        val match = domainRegex.find(cookie)
        if (match != null) {
            val rawDomain = match.groupValues[1].trimStart('.').trim()
            if (rawDomain.isNotEmpty()) {
                targets.add("https://$rawDomain/")
                targets.add("http://$rawDomain/")

                if (rawDomain == "youtube.com" || rawDomain.endsWith(".youtube.com")) {
                    targets.add("https://m.youtube.com/")
                    targets.add("https://www.youtube.com/")
                    targets.add("https://youtube.com/")
                }
                if (rawDomain == "google.com" || rawDomain.endsWith(".google.com")) {
                    targets.add("https://accounts.google.com/")
                    targets.add("https://myaccount.google.com/")
                    targets.add("https://www.google.com/")
                    targets.add("https://google.com/")
                    targets.add("https://m.youtube.com/")
                    targets.add("https://www.youtube.com/")
                }
            }
        }

        if (targets.isEmpty() && url.isNotEmpty()) {
            targets.add(url)
        }
        return targets
    }
}
