package com.lumidren.maatora

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.net.Uri
import android.os.Bundle
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
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
        web.webViewClient = Client()
        web.addJavascriptInterface(Bridge(), "MaatoraNative")
        setContentView(web)

        val record = verificationRecord(intent?.data)
        web.loadUrl(if (record == null) HOME else "$HOME#verify=$record")
    }

    /** A verification link opened while the app is already running. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        verificationRecord(intent.data)?.let(::showVerification)
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    /**
     * Reads the record out of a maatora://verify/<record> link. Only the characters a real
     * record can contain are accepted, because the record is handed to the page as text.
     */
    private fun verificationRecord(uri: Uri?): String? {
        if (uri == null || uri.scheme != VERIFY_SCHEME || uri.host != VERIFY_HOST) {
            return null
        }
        return uri.path?.trimStart('/')?.takeIf { RECORD.matches(it) }
    }

    /** Switches the running page to its verification view without reloading it. */
    private fun showVerification(record: String) {
        web.evaluateJavascript("window.location.hash = '#verify=$record';", null)
    }

    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val uri = request.url
            val record = verificationRecord(uri)
            when {
                record != null -> showVerification(record)
                uri.toString().startsWith(HOME) -> return false
                uri.scheme == "https" || uri.scheme == "http" -> openInBrowser(uri)
            }
            // Anything else is ignored: the app only ever shows its own bundled page.
            return true
        }
    }

    /** What the page can ask the phone to do. A WebView has no print dialog of its own. */
    private inner class Bridge {
        @JavascriptInterface
        fun print() {
            runOnUiThread(::printCertificate)
        }
    }

    /** Hands the page to Android's print service, which also offers "Save as PDF". */
    private fun printCertificate() {
        val name = getString(R.string.print_job_name)
        val paper = PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build()
        val printer = getSystemService(Context.PRINT_SERVICE) as PrintManager
        printer.print(name, web.createPrintDocumentAdapter(name), paper)
    }

    private fun openInBrowser(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (missing: ActivityNotFoundException) {
            // No browser installed: stay on the page.
        }
    }

    companion object {
        const val HOME = "file:///android_asset/index.html"
        const val VERIFY_SCHEME = "maatora"
        const val VERIFY_HOST = "verify"
        val RECORD = Regex("[A-Za-z0-9~.+-]{1,200}")
    }
}
