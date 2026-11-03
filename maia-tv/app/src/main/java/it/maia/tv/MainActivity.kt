package it.maia.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

// MAIA on the TV: the web app full screen in a WebView, with nothing of a
// browser around it. The remote's keys go to MAIA's own navigation
// (maia-fe/components/spatial-nav.tsx): arrows and OK as they are, Back as
// Escape, play/pause and seek as media keys for the player. Menu opens the
// address of MAIA (default in app/build.gradle.kts).
class MainActivity : Activity() {
    private lateinit var root: FrameLayout
    private lateinit var web: WebView
    private lateinit var splash: ImageView
    private lateinit var offline: LinearLayout
    private lateinit var offlineText: TextView
    private lateinit var retry: Button

    // The video in full screen (requestFullscreen inside the page).
    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null

    private var lastBackAt = 0L
    private var failed = false

    private val prefs by lazy { getSharedPreferences("maia", MODE_PRIVATE) }
    private val address: String
        get() = prefs.getString(KEY_URL, null) ?: BuildConfig.MAIA_URL

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemBars()

        root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        web = buildWebView()
        splash = ImageView(this).apply {
            setImageResource(R.drawable.splash)
            scaleType = ImageView.ScaleType.CENTER_CROP
        }
        offline = buildOfflineView()
        root.addView(web, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        root.addView(offline, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        root.addView(splash, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        setContentView(root)

        if (savedInstanceState != null) web.restoreState(savedInstanceState) else load()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildWebView(): WebView {
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
        CookieManager.getInstance().setAcceptCookie(true)
        return WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            isFocusable = true
            isFocusableInTouchMode = true
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.setSupportZoom(false)
            settings.builtInZoomControls = false
            settings.displayZoomControls = false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
            }
            webViewClient = Client()
            webChromeClient = Chrome()
        }
    }

    private fun load() {
        failed = false
        offline.visibility = View.GONE
        web.visibility = View.VISIBLE
        web.loadUrl(address)
        web.requestFocus()
    }

    private inner class Client : WebViewClient() {
        // Every link stays inside the app.
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = false

        override fun onPageFinished(view: WebView, url: String) {
            if (failed) return
            hideSplash()
            web.requestFocus()
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) showOffline()
        }

        @Deprecated("Android 5 only")
        override fun onReceivedError(view: WebView, errorCode: Int, description: String?, failingUrl: String?) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) showOffline()
        }

        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
            handler.cancel()
            showOffline()
        }
    }

    private inner class Chrome : WebChromeClient() {
        override fun onShowCustomView(view: View, callback: CustomViewCallback) {
            if (fullscreenView != null) {
                callback.onCustomViewHidden()
                return
            }
            fullscreenView = view
            fullscreenCallback = callback
            root.addView(view, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
            view.requestFocus()
            hideSystemBars()
        }

        override fun onHideCustomView() {
            fullscreenView?.let { root.removeView(it) }
            fullscreenView = null
            fullscreenCallback = null
            web.requestFocus()
        }
    }

    // ─── remote ──────────────────────────────────────────────────────────────

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val down = event.action == KeyEvent.ACTION_DOWN
        when (event.keyCode) {
            KeyEvent.KEYCODE_BACK -> {
                if (down && event.repeatCount == 0) onBack()
                return true
            }
            KeyEvent.KEYCODE_MENU -> {
                if (down && event.repeatCount == 0) askAddress()
                return true
            }
        }
        val media = MEDIA_KEYS[event.keyCode]
        if (media != null && !failed) {
            if (down) sendKey(media)
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    // Back is MAIA's Escape: it closes the open layer (keyboard, menu, panel),
    // leaves full screen or goes to the previous page. On the first page a
    // second Back within 2 s closes the app.
    private fun onBack() {
        if (failed || offline.visibility == View.VISIBLE) {
            finish()
            return
        }
        if (fullscreenView != null) {
            web.evaluateJavascript("document.exitFullscreen && document.exitFullscreen().catch(function(){})", null)
            fullscreenCallback?.onCustomViewHidden()
            return
        }
        val js = """
            (function () {
              var layer = !!document.querySelector('[data-focus-trap]') || !!document.fullscreenElement;
              $DISPATCH('Escape');
              return layer ? 'layer' : 'page';
            })()
        """.trimIndent()
        web.evaluateJavascript(js) { result ->
            if (result != "\"page\"" || web.canGoBack()) return@evaluateJavascript
            val now = System.currentTimeMillis()
            if (now - lastBackAt < 2000) finish()
            else {
                lastBackAt = now
                Toast.makeText(this, "Premi di nuovo Indietro per uscire", Toast.LENGTH_SHORT).show()
            }
        }
    }

    // A key MAIA understands, sent to the element in focus (the player when a
    // video is on).
    private fun sendKey(key: String) {
        web.evaluateJavascript("(function () { $DISPATCH('$key'); })()", null)
    }

    // ─── settings ────────────────────────────────────────────────────────────

    private fun askAddress() {
        val field = EditText(this).apply {
            setText(address)
            setSelectAllOnFocus(true)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
        }
        AlertDialog.Builder(this)
            .setTitle("Indirizzo di MAIA")
            .setMessage("Il PC di casa con MAIA accesa, per esempio ${BuildConfig.MAIA_URL}")
            .setView(field)
            .setPositiveButton("Salva") { _, _ ->
                val url = field.text.toString().trim().let { if (it.startsWith("http")) it else "http://$it" }
                prefs.edit().putString(KEY_URL, url).apply()
                load()
            }
            .setNeutralButton("Predefinito") { _, _ ->
                prefs.edit().remove(KEY_URL).apply()
                load()
            }
            .setNegativeButton("Annulla", null)
            .show()
    }

    // ─── screens ─────────────────────────────────────────────────────────────

    private fun buildOfflineView(): LinearLayout {
        val pad = dp(48)
        offlineText = TextView(this).apply {
            setTextColor(Color.parseColor("#A1A1A6"))
            textSize = 18f
            gravity = Gravity.CENTER
            setPadding(0, dp(16), 0, dp(32))
        }
        val logo = ImageView(this).apply {
            setImageResource(R.drawable.banner)
            adjustViewBounds = true
        }
        val title = TextView(this).apply {
            text = "MAIA non è raggiungibile"
            setTextColor(Color.WHITE)
            textSize = 30f
            gravity = Gravity.CENTER
        }
        retry = pill("Riprova") { load() }
        val settings = pill("Cambia indirizzo") { askAddress() }
        val buttons = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            addView(retry)
            addView(settings, LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { leftMargin = dp(16) })
        }
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.BLACK)
            setPadding(pad, pad, pad, pad)
            visibility = View.GONE
            addView(logo, LinearLayout.LayoutParams(dp(320), dp(180)))
            addView(title)
            addView(offlineText)
            addView(buttons)
        }
    }

    // White pill when selected, like MAIA's buttons.
    private fun pill(label: String, onClick: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        textSize = 18f
        setPadding(dp(28), dp(12), dp(28), dp(12))
        val paint = { focused: Boolean ->
            background = GradientDrawable().apply {
                cornerRadius = dp(999).toFloat()
                setColor(if (focused) Color.WHITE else Color.parseColor("#2C2C2E"))
            }
            setTextColor(if (focused) Color.BLACK else Color.WHITE)
        }
        paint(false)
        setOnFocusChangeListener { _, focused -> paint(focused) }
        setOnClickListener { onClick() }
    }

    private fun showOffline() {
        failed = true
        hideSplash()
        web.stopLoading()
        web.visibility = View.INVISIBLE
        offlineText.text = "Controlla che il PC di casa sia acceso, con MAIA avviata,\ne che la TV sia sulla stessa rete.\n$address"
        offline.visibility = View.VISIBLE
        retry.requestFocus()
    }

    private fun hideSplash() {
        if (splash.visibility != View.VISIBLE) return
        splash.animate().alpha(0f).setDuration(300).withEndAction { splash.visibility = View.GONE }.start()
    }

    @Suppress("DEPRECATION")
    private fun hideSystemBars() {
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE)
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    // ─── lifecycle ───────────────────────────────────────────────────────────

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    // Leaving the app (Home) pauses the video, like the browser tab does.
    override fun onPause() {
        web.onPause()
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    companion object {
        private const val KEY_URL = "url"

        // Remote media keys → the names the player listens for (KeyboardEvent.key).
        private val MEDIA_KEYS = mapOf(
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE to "MediaPlayPause",
            KeyEvent.KEYCODE_MEDIA_PLAY to "MediaPlay",
            KeyEvent.KEYCODE_MEDIA_PAUSE to "MediaPause",
            KeyEvent.KEYCODE_MEDIA_FAST_FORWARD to "MediaFastForward",
            KeyEvent.KEYCODE_MEDIA_REWIND to "MediaRewind",
        )

        // A keydown on the focused element (or the player, or the page),
        // bubbling like a real key so MAIA's listeners all see it.
        private const val DISPATCH = """(function (key) {
              var el = document.activeElement;
              if (!el || el === document.body) el = document.querySelector('[data-own-keys]') || document.body;
              el.dispatchEvent(new KeyboardEvent('keydown', { key: key, code: key, bubbles: true, cancelable: true }));
            })"""
    }
}
