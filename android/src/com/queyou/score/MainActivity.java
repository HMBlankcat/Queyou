package com.queyou.score;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.graphics.Canvas;
import android.media.ExifInterface;
import android.util.Base64;
import android.net.Uri;
import android.webkit.*;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.view.View;
import android.view.WindowManager;
import android.view.HapticFeedbackConstants;
import java.io.*;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

public final class MainActivity extends Activity {
  private WebView web;
  private FrameLayout root;
  private String pendingText;
  private int fileRequest;
  private boolean haptics;
  private static final String ORIGIN = "https://appassets.androidplatform.net/assets/";
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow().setStatusBarColor(Color.rgb(22,62,53));
    getWindow().setNavigationBarColor(Color.rgb(22,62,53));
    root = new FrameLayout(this);
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
        String mime = path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : path.endsWith(".png") ? "image/png" : path.endsWith(".svg") ? "image/svg+xml" : path.endsWith(".woff2") ? "font/woff2" : "text/html";
        try { return new WebResourceResponse(mime,"UTF-8",getAssets().open(path)); } catch(IOException e) { return denied(); }
      }
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return !request.getUrl().toString().startsWith(ORIGIN); }
    });
    web.setWebChromeClient(new WebChromeClient());
    web.addJavascriptInterface(new LocalFiles(), "Android");
    if (state != null) pendingText = state.getString("pendingText");
    if (state != null) fileRequest = state.getInt("fileRequest",0);
    web.loadUrl(ORIGIN + "index.html");
  }
  private WebResourceResponse denied() { return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0])); }
  public final class LocalFiles {
    @JavascriptInterface public void applyPreferences(String json) {
      if (json == null || json.length() > 500) return;
      try {
        JSONObject prefs = new JSONObject(json);
        double value = prefs.optDouble("brightness", -1);
        final float brightness = value >= .2 && value <= 1 ? (float)value : -1;
        final boolean awake = prefs.optBoolean("keepAwake", false);
        final boolean dark = prefs.optBoolean("dark", false);
        final boolean feedback = prefs.optBoolean("haptics", false);
        String color = prefs.optString("color", "#f4f7f2");
        if (!color.matches("#[0-9a-fA-F]{6}")) return;
        final int chromeColor = Color.parseColor(color);
        runOnUiThread(() -> {
          WindowManager.LayoutParams attrs = getWindow().getAttributes();
          attrs.screenBrightness = brightness; getWindow().setAttributes(attrs);
          if (awake) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
          else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
          haptics = feedback;
          getWindow().setStatusBarColor(chromeColor); getWindow().setNavigationBarColor(chromeColor);
          root.setBackgroundColor(chromeColor); web.setBackgroundColor(chromeColor);
          if (android.os.Build.VERSION.SDK_INT >= 30) {
            android.view.WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
              int mask = android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
              controller.setSystemBarsAppearance(dark ? 0 : mask, mask);
            }
          } else getWindow().getDecorView().setSystemUiVisibility(dark ? 0 : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        });
      } catch (Exception ignored) { }
    }
    @JavascriptInterface public void touchFeedback() {
      runOnUiThread(() -> { if (haptics) web.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK); });
    }
    @JavascriptInterface public void pickBackground() { runOnUiThread(() -> openLocalFile(103,"image/*")); }
    @JavascriptInterface public void openAppearance() { runOnUiThread(() -> openLocalFile(102,"*/*")); }
    @JavascriptInterface public void openExternal(String url) {
      Uri uri = Uri.parse(url);
      if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) || uri.getHost() == null) return;
      runOnUiThread(() -> {
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (Exception e) { toast("未找到可打开链接的浏览器"); }
      });
    }
    @JavascriptInterface public void clearLocalCache() {
      runOnUiThread(() -> { web.clearCache(true); web.clearHistory(); });
    }
    @JavascriptInterface public void saveFile(String filename,String mime,String content) {
      if (content.length() > 10*1024*1024 || !(mime.equals("text/csv") || mime.equals("application/json"))) return;
      runOnUiThread(() -> {
        if (fileRequest != 0 || pendingText != null) { toast("请先完成上一次文件操作"); return; }
        pendingText = content;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE,filename.replaceAll("[/\\\\]","_"));
        try { fileRequest=100; startActivityForResult(intent,100); } catch (Exception e) { fileRequest=0;pendingText=null; toast("无法打开文件保存器"); }
      });
    }
    @JavascriptInterface public void openBackup() {
      runOnUiThread(() -> openLocalFile(101,"*/*"));
    }
  }
  private void openLocalFile(int code,String mime) {
    if (fileRequest != 0 || pendingText != null) { toast("请先完成上一次文件操作"); return; }
    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType(mime);
    try { fileRequest=code;startActivityForResult(intent,code); }
    catch (Exception e) { fileRequest=0;toast("无法打开文件选择器"); }
  }
  private byte[] readLimited(Uri uri,int limit) throws IOException {
    ByteArrayOutputStream buffer=new ByteArrayOutputStream();
    try (InputStream in=getContentResolver().openInputStream(uri)) {
      if(in==null)throw new IOException("unavailable");
      byte[] bytes=new byte[8192];int count;
      while((count=in.read(bytes))!=-1){if(buffer.size()+count>limit)throw new IOException("too large");buffer.write(bytes,0,count);}
    }
    return buffer.toByteArray();
  }
  private void importBackgroundImage(Uri uri) {
    new Thread(() -> {
      Bitmap bitmap=null;
      try {
        byte[] bytes=readLimited(uri,20*1024*1024);
        BitmapFactory.Options opts=new BitmapFactory.Options();opts.inJustDecodeBounds=true;
        BitmapFactory.decodeByteArray(bytes,0,bytes.length,opts);
        if(opts.outWidth<=0 || opts.outHeight<=0 || (long)opts.outWidth*opts.outHeight>80000000L)throw new IOException("invalid image");
        opts.inJustDecodeBounds=false;opts.inSampleSize=1;
        while(Math.max(opts.outWidth,opts.outHeight)/opts.inSampleSize>1920)opts.inSampleSize*=2;
        opts.inPreferredConfig=Bitmap.Config.ARGB_8888;
        bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.length,opts);
        if(bitmap==null)throw new IOException("decode failed");
        try {
          ExifInterface exif=new ExifInterface(new ByteArrayInputStream(bytes));
          int orientation=exif.getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL);
          Matrix matrix=new Matrix();
          switch(orientation){
            case ExifInterface.ORIENTATION_FLIP_HORIZONTAL: matrix.setScale(-1,1);break;
            case ExifInterface.ORIENTATION_ROTATE_180: matrix.setRotate(180);break;
            case ExifInterface.ORIENTATION_FLIP_VERTICAL: matrix.setScale(1,-1);break;
            case ExifInterface.ORIENTATION_TRANSPOSE: matrix.setRotate(90);matrix.postScale(-1,1);break;
            case ExifInterface.ORIENTATION_ROTATE_90: matrix.setRotate(90);break;
            case ExifInterface.ORIENTATION_TRANSVERSE: matrix.setRotate(-90);matrix.postScale(-1,1);break;
            case ExifInterface.ORIENTATION_ROTATE_270: matrix.setRotate(-90);break;
          }
          if(!matrix.isIdentity()){Bitmap rotated=Bitmap.createBitmap(bitmap,0,0,bitmap.getWidth(),bitmap.getHeight(),matrix,true);if(rotated!=bitmap){bitmap.recycle();bitmap=rotated;}}
        } catch (IOException ignored) { }
        if(bitmap.hasAlpha()) {
          Bitmap opaque=Bitmap.createBitmap(bitmap.getWidth(),bitmap.getHeight(),Bitmap.Config.ARGB_8888);
          Canvas canvas=new Canvas(opaque);canvas.drawColor(Color.rgb(241,241,236));canvas.drawBitmap(bitmap,0,0,null);
          bitmap.recycle();bitmap=opaque;
        }
        ByteArrayOutputStream image=new ByteArrayOutputStream();
        for(int quality:new int[]{88,74,58,42}){image.reset();bitmap.compress(Bitmap.CompressFormat.JPEG,quality,image);if(image.size()<900000)break;}
        if(image.size()>1300000)throw new IOException("image too large");
        String data="data:image/jpeg;base64,"+Base64.encodeToString(image.toByteArray(),Base64.NO_WRAP);
        runOnUiThread(() -> { fileRequest=0;if(!isFinishing()&&!isDestroyed())web.evaluateJavascript("window.importBackground("+JSONObject.quote(data)+")",null); });
      } catch (Exception | OutOfMemoryError e) {
        runOnUiThread(() -> {fileRequest=0;toast("无法读取图片，请选择小于 20 MB 的 JPG、PNG 或 WebP 图片");});
      } finally { if(bitmap!=null&&!bitmap.isRecycled())bitmap.recycle(); }
    },"queyou-image-import").start();
  }
  private void toast(String message) { Toast.makeText(this,message,Toast.LENGTH_LONG).show(); }
  @Override protected void onActivityResult(int code,int result,Intent data) {
    super.onActivityResult(code,result,data);
    if (result != RESULT_OK || data == null || data.getData() == null) { fileRequest=0;if(code==100)pendingText=null; return; }
    Uri uri=data.getData();
    if (code==103) { importBackgroundImage(uri); return; }
    try {
      if (code==100 && pendingText!=null) {
        try (OutputStream out=getContentResolver().openOutputStream(uri,"wt")) { out.write(pendingText.getBytes(StandardCharsets.UTF_8)); }
        toast("已保存");
      } else if (code==101 || code==102) {
        byte[] text=readLimited(uri,code==102?3000000:10*1024*1024);
        String callback=code==102?"window.importAppearance(":"window.importBackup(";
        web.evaluateJavascript(callback+JSONObject.quote(new String(text,StandardCharsets.UTF_8))+")",null);
      }
    } catch(Exception e) { toast("文件操作失败，请检查位置和文件格式"); }
    finally { fileRequest=0;if(code==100)pendingText=null; }
  }
  @Override public void onBackPressed() {
    web.evaluateJavascript("Boolean(window.appBack && window.appBack())",value->{if(!"true".equals(value))finish();});
  }
  @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out);out.putInt("fileRequest",fileRequest);if(pendingText!=null && pendingText.length()<100000)out.putString("pendingText",pendingText); }
  @Override protected void onDestroy() { web.removeJavascriptInterface("Android");web.destroy();super.onDestroy(); }
}
