package com.asu.sports;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * American Sports Universe 2D - Android shell.
 * A full-screen WebView that serves the game from the APK's assets under https://appassets.asu.local/ (a real https origin, so ES modules,
 * fetch(), localStorage and WebAudio behave like on the web), plus the two things a bare WebView lacks: a file chooser (backup import) and
 * a "save file" bridge (backup export; window.AsuNative.saveFile). No third-party libraries: only the Android framework.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.asu.local";
    private static final int REQ_CHOOSE = 1001, REQ_SAVE = 1002;

    private WebView web;
    private ValueCallback<Uri[]> chooser;
    private String pendingName, pendingText;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " ASUApp/1.0");   // the page uses this to skip the service worker (assets are already local)
        WebView.setWebContentsDebuggingEnabled(true);                   // chrome://inspect from a PC, to measure fps on the real device

        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                return HOST.equals(u.getHost()) ? asset(u) : null;
            }
            @SuppressWarnings("deprecation")
            @Override public boolean shouldOverrideUrlLoading(WebView v, String url) {   // String overload: works on every API level (the request overload is API 24+)
                Uri u = Uri.parse(url);
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException ignored) { }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (chooser != null) chooser.onReceiveValue(null);
                chooser = cb;
                try { startActivityForResult(p.createIntent(), REQ_CHOOSE); }
                catch (ActivityNotFoundException e) { chooser = null; return false; }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "AsuNative");
        if (b != null) web.restoreState(b); else web.loadUrl("https://" + HOST + "/index.html");
    }

    /** Serves /path from the APK assets (index.html for "/"), with the right MIME type and permissive same-origin headers. */
    private WebResourceResponse asset(Uri u) {
        String p = u.getPath();
        if (p == null || p.equals("/") || p.isEmpty()) p = "/index.html";
        if (p.startsWith("/")) p = p.substring(1);
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        h.put("Cache-Control", "max-age=3600");
        try {
            InputStream in = getAssets().open(p);
            return new WebResourceResponse(mime(p), mime(p).startsWith("text/") || mime(p).contains("json") || mime(p).contains("javascript") ? "UTF-8" : null, 200, "OK", h, in);
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", h, new java.io.ByteArrayInputStream(new byte[0]));
        }
    }

    private static String mime(String path) {
        String x = path.toLowerCase(Locale.ROOT);
        if (x.endsWith(".html")) return "text/html";
        if (x.endsWith(".js") || x.endsWith(".mjs")) return "text/javascript";
        if (x.endsWith(".css")) return "text/css";
        if (x.endsWith(".json") || x.endsWith(".webmanifest")) return "application/json";
        if (x.endsWith(".csv")) return "text/csv";
        if (x.endsWith(".webp")) return "image/webp";
        if (x.endsWith(".png")) return "image/png";
        if (x.endsWith(".jpg") || x.endsWith(".jpeg")) return "image/jpeg";
        if (x.endsWith(".svg")) return "image/svg+xml";
        if (x.endsWith(".glb")) return "model/gltf-binary";
        if (x.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }

    /** window.AsuNative.saveFile(name, text): opens the system "save as" dialog and writes the text (UTF-8). */
    private class Bridge {
        @JavascriptInterface public void saveFile(String name, String text) {
            pendingName = name; pendingText = text;
            runOnUiThread(new Runnable() {   // anonymous class, not a lambda: the legacy dx tool used here cannot desugar invokedynamic
                @Override public void run() {
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("application/json");
                    i.putExtra(Intent.EXTRA_TITLE, pendingName);
                    try { startActivityForResult(i, REQ_SAVE); }
                    catch (ActivityNotFoundException e) { Toast.makeText(MainActivity.this, "Nenhum app para salvar arquivos.", Toast.LENGTH_LONG).show(); }
                }
            });
        }
        @JavascriptInterface public boolean available() { return true; }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_CHOOSE) {
            if (chooser != null) { chooser.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data)); chooser = null; }
        } else if (req == REQ_SAVE && res == RESULT_OK && data != null && data.getData() != null && pendingText != null) {
            try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                out.write(pendingText.getBytes(StandardCharsets.UTF_8));
                Toast.makeText(this, "Arquivo salvo: " + pendingName, Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, "Não foi possível salvar o arquivo.", Toast.LENGTH_LONG).show();
            }
            pendingText = null;
        } else super.onActivityResult(req, res, data);
    }

    @Override public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus) web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }
    @Override protected void onSaveInstanceState(Bundle b) { super.onSaveInstanceState(b); web.saveState(b); }
    @Override protected void onPause() { web.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onDestroy() { web.destroy(); super.onDestroy(); }
}
