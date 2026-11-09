package com.queyou.score;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.webkit.*;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.view.View;
import java.io.*;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

public final class MainActivity extends Activity {
  private WebView web;
  private String pendingText;
  private static final String ORIGIN = "https://appassets.androidplatform.net/assets/";
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow().setStatusBarColor(Color.rgb(22,62,53));
    getWindow().setNavigationBarColor(Color.rgb(22,62,53));
    FrameLayout root = new FrameLayout(this);
    root.setBackgroundColor(Color.rgb(22,62,53));
    web = new WebView(this);
    root.addView(web, new FrameLayout.LayoutParams(-1,-1));
    setContentView(root);
    if (android.os.Build.VERSION.SDK_INT >= 30) {
      root.setOnApplyWindowInsetsListener((v, insets) -> {
        android.graphics.Insets bars = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout() | android.view.WindowInsets.Type.ime());
        v.setPadding(bars.left,bars.top,bars.right,bars.bottom);
        return insets;
      });
    } else root.setFitsSystemWindows(true);
    WebSettings settings = web.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    settings.setMediaPlaybackRequiresUserGesture(true);
    web.setWebViewClient(new WebViewClient() {
      @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        String url = request.getUrl().toString();
        if (!url.startsWith(ORIGIN)) return denied();
        String path = request.getUrl().getPath().substring("/assets/".length());
        if (!path.matches("[a-zA-Z0-9._-]+")) return denied();
        String mime = path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : path.endsWith(".png") ? "image/png" : path.endsWith(".svg") ? "image/svg+xml" : "text/html";
        try { return new WebResourceResponse(mime,"UTF-8",getAssets().open(path)); } catch(IOException e) { return denied(); }
      }
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return !request.getUrl().toString().startsWith(ORIGIN); }
    });
    web.setWebChromeClient(new WebChromeClient());
    web.addJavascriptInterface(new LocalFiles(), "Android");
    if (state != null) pendingText = state.getString("pendingText");
    web.loadUrl(ORIGIN + "index.html");
  }
  private WebResourceResponse denied() { return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0])); }
  public final class LocalFiles {
    @JavascriptInterface public void clearLocalCache() {
      runOnUiThread(() -> { web.clearCache(true); web.clearHistory(); });
    }
    @JavascriptInterface public void saveFile(String filename,String mime,String content) {
      if (content.length() > 10*1024*1024 || !(mime.equals("text/csv") || mime.equals("application/json"))) return;
      runOnUiThread(() -> {
        if (pendingText != null) { toast("请先完成上一次保存"); return; }
        pendingText = content;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE,filename.replaceAll("[/\\\\]","_"));
        try { startActivityForResult(intent,100); } catch (Exception e) { pendingText=null; toast("无法打开文件保存器"); }
      });
    }
    @JavascriptInterface public void openBackup() {
      runOnUiThread(() -> {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("*/*");
        try { startActivityForResult(intent,101); } catch (Exception e) { toast("无法打开文件选择器"); }
      });
    }
  }
  private void toast(String message) { Toast.makeText(this,message,Toast.LENGTH_LONG).show(); }
  @Override protected void onActivityResult(int code,int result,Intent data) {
    super.onActivityResult(code,result,data);
    if (result != RESULT_OK || data == null || data.getData() == null) { if(code==100)pendingText=null; return; }
    Uri uri=data.getData();
    try {
      if (code==100 && pendingText!=null) {
        try (OutputStream out=getContentResolver().openOutputStream(uri,"wt")) { out.write(pendingText.getBytes(StandardCharsets.UTF_8)); }
        toast("已保存");
      } else if (code==101) {
        ByteArrayOutputStream buffer=new ByteArrayOutputStream();
        try (InputStream in=getContentResolver().openInputStream(uri)) {
          byte[] bytes=new byte[8192]; int read;
          while((read=in.read(bytes))!=-1) { if(buffer.size()+read>10*1024*1024)throw new IOException("too large");buffer.write(bytes,0,read); }
        }
        web.evaluateJavascript("window.importBackup("+JSONObject.quote(new String(buffer.toByteArray(),StandardCharsets.UTF_8))+")",null);
      }
    } catch(Exception e) { toast("文件操作失败，请检查位置和文件格式"); }
    finally { if(code==100)pendingText=null; }
  }
  @Override public void onBackPressed() {
    web.evaluateJavascript("Boolean(window.appBack && window.appBack())",value->{if(!"true".equals(value))finish();});
  }
  @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); if(pendingText!=null && pendingText.length()<100000)out.putString("pendingText",pendingText); }
  @Override protected void onDestroy() { web.removeJavascriptInterface("Android");web.destroy();super.onDestroy(); }
}
