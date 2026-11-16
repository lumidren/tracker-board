package com.lumidren.maatora

import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.ApplicationInfo
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * The phone app is a thin native shell around the same web interface that runs in a
 * browser. The interface ships inside the APK, so the app needs no network and asks for
 * no permissions.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView

    // JavaScript runs only the bundled page: the client below refuses every other address.
    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Lets the page be inspected from a computer in debug builds only.
        val debuggable = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
        WebView.setWebContentsDebuggingEnabled(debuggable)

        web = WebView(this)
        web.setBackgroundColor(getColor(R.color.canvas))
        web.settings.apply {
            javaScriptEnabled = true
            // The page keeps the sign-in session and language choice in web storage.
            domStorageEnabled = true
            // Bundled assets stay readable; every other file on the phone does not.
            allowFileAccess = false
            allowContentAccess = false
            setSupportMultipleWindows(false)
        }
        web.webViewClient = WebViewClient()
        setContentView(web)

        web.loadUrl(HOME)
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    companion object {
        const val HOME = "file:///android_asset/index.html"
    }
}
