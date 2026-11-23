package de.berlinroute.app

import android.annotation.SuppressLint
import android.graphics.Color
import android.widget.FrameLayout
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URL
import android.content.ActivityNotFoundException
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognizerIntent
import org.json.JSONObject
import android.view.WindowManager
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader

/**
 * Hosts the web app (assets/www, built from /web) in a full-screen WebView.
 * Assets are served from https://appassets.androidplatform.net so map tiles
 * (https) load without mixed-origin problems. Only the real-world 3D map needs internet.
 * GPS: the page asks for the location, this activity asks Android for the permission.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var root: FrameLayout

    // pending request from the page while the Android permission dialog is open
    private var geoOrigin: String? = null
    private var geoCallback: GeolocationPermissions.Callback? = null

    private val locationPermission =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
            val granted = result[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                result[Manifest.permission.ACCESS_COARSE_LOCATION] == true
            geoCallback?.invoke(geoOrigin, granted, false)
            geoCallback = null
            geoOrigin = null
        }

    // voice input: Android's own speech dialog (the WebView has no web speech API)
    private val voiceResult =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
            val list = r.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
            val text = if (r.resultCode == RESULT_OK && !list.isNullOrEmpty()) list[0] else ""
            web.evaluateJavascript("window.__voiceResult && window.__voiceResult(" + JSONObject.quote(text) + ")", null)
        }

    private fun hasLocationPermission() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    /** Small bridge so the page can keep the screen on while navigating and match the system bars to the app theme. */
    inner class Bridge {
        @JavascriptInterface
        fun setTheme(dark: Boolean) {
            runOnUiThread {
                root.setBackgroundColor(if (dark) 0xFF090B12.toInt() else 0xFFF2F4FA.toInt())
                val c = WindowCompat.getInsetsController(window, root)
                c.isAppearanceLightStatusBars = !dark
                c.isAppearanceLightNavigationBars = !dark
            }
        }

        @JavascriptInterface
        fun startVoice(lang: String) {
            runOnUiThread {
                try {
                    val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                    i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
                    i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                    voiceResult.launch(i)
                } catch (e: ActivityNotFoundException) {
                    web.evaluateJavascript("window.__voiceResult && window.__voiceResult('', 'unavailable')", null)
                }
            }
        }

        @JavascriptInterface
        fun hasVoice(): Boolean = true

        @JavascriptInterface
        fun keepScreenOn(on: Boolean) {
            runOnUiThread {
                if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        // The WebView is a child of a padded container. Padding on the WebView itself does not shrink the web
        // content, so the container keeps the app clear of the status bar, the gesture bar and the keyboard.
        root = FrameLayout(this)
        root.setBackgroundColor(0xFF0E1220.toInt())
        web = WebView(this)
        root.addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        setContentView(root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
            )
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            setGeolocationEnabled(true)
        }
        web.setBackgroundColor(Color.TRANSPARENT)
        web.addJavascriptInterface(Bridge(), "AndroidBridge")

        web.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String,
                callback: GeolocationPermissions.Callback
            ) {
                if (hasLocationPermission()) {
                    callback.invoke(origin, true, false)
                } else {
                    geoOrigin = origin
                    geoCallback = callback
                    locationPermission.launch(
                        arrayOf(
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION
                        )
                    )
                }
            }
        }

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                // live departures: fetch natively so the page never runs into cross origin limits
                if (request.url.host == LIVE_HOST && request.method == "GET") proxy(request)?.let { return it }
                return loader.shouldInterceptRequest(request.url)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val url = request.url
                if (url.host == "appassets.androidplatform.net") return false
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                } catch (e: ActivityNotFoundException) {
                    // no app can open this link
                }
                return true
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) {
                    web.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        if (savedInstanceState == null) {
            web.loadUrl("https://appassets.androidplatform.net/assets/www/index.html")
        } else {
            web.restoreState(savedInstanceState)
        }
    }

    private fun proxy(request: WebResourceRequest): WebResourceResponse? = try {
        val c = URL(request.url.toString()).openConnection() as HttpURLConnection
        c.connectTimeout = 8000
        c.readTimeout = 10000
        c.requestMethod = "GET"
        c.setRequestProperty("Accept", "application/json")
        c.setRequestProperty("User-Agent", "Bearline/0.6 (Android)")
        val code = c.responseCode
        val body = if (code in 200..299) c.inputStream else (c.errorStream ?: ByteArrayInputStream(ByteArray(0)))
        val reason = c.responseMessage?.takeIf { it.isNotBlank() } ?: if (code in 200..299) "OK" else "Error"
        val status = if (code in 200..299 || code in 400..599) code else 502
        WebResourceResponse("application/json", "utf-8", status, reason, mapOf("Access-Control-Allow-Origin" to "*"), body)
    } catch (e: Exception) {
        null
    }

    companion object {
        private const val LIVE_HOST = "v6.vbb.transport.rest"
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onPause() {
        web.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }
}
