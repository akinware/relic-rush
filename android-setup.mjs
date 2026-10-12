// Prepares the native Android project (Capacitor). Safe to run again: every patch checks before it edits.
//   node android-setup.mjs
// Steps: create android/ if missing → copy the web build → icons & splash → AdMob app id, portrait,
// full-screen, signing and version → sync plugins.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';

const CONFIG = JSON.parse(readFileSync('relic.config.json', 'utf8'));
const run = (cmd) => { console.log('› ' + cmd); execSync(cmd, { stdio: 'inherit' }); };
const edit = (file, fn) => { const before = readFileSync(file, 'utf8'); const after = fn(before); if (after !== before) { writeFileSync(file, after); console.log('patched ' + file); } };

if (!existsSync('dist/index.html')) run('node build.mjs');
if (!existsSync('android')) run('npx cap add android');

// icons + splash from the PNGs in the repo root
const tmp = '.cap-assets';
rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp);
copyFileSync('icon-source.png', `${tmp}/icon-only.png`);
copyFileSync('android-icon-foreground.png', `${tmp}/icon-foreground.png`);
copyFileSync('android-icon-background.png', `${tmp}/icon-background.png`);
copyFileSync('android-splash-logo.png', `${tmp}/logo.png`);
copyFileSync('android-splash-logo.png', `${tmp}/logo-dark.png`);
run(`npx capacitor-assets generate --android --assetPath ${tmp} --splashBackgroundColor "#14211a" --splashBackgroundColorDark "#14211a" --iconBackgroundColor "#14211a" --logoSplashScale 0.35`);
rmSync(tmp, { recursive: true, force: true });

const APP = 'android/app/src/main';
const pkgPath = CONFIG.appId.replace(/\./g, '/');

// AdMob application id + portrait, full-screen game activity
edit(`${APP}/res/values/strings.xml`, (s) => {
  const line = `    <string name="admob_app_id">${CONFIG.admob.appId}</string>`;
  return s.includes('name="admob_app_id"') ? s.replace(/ {4}<string name="admob_app_id">[^<]*<\/string>/, line) : s.replace('</resources>', `${line}\n</resources>`);
});
edit(`${APP}/AndroidManifest.xml`, (s) => {
  if (!s.includes('com.google.android.gms.ads.APPLICATION_ID')) {
    s = s.replace(/(<application[^>]*>)/, `$1\n        <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="@string/admob_app_id" />`);
  }
  if (!s.includes('android.permission.VIBRATE')) s = s.replace('<uses-permission android:name="android.permission.INTERNET" />', '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.VIBRATE" />');
  if (!s.includes('android:screenOrientation')) s = s.replace('android:name=".MainActivity"', 'android:name=".MainActivity"\n            android:screenOrientation="portrait"');
  return s;
});
writeFileSync(`${APP}/java/${pkgPath}/MainActivity.java`, `package ${CONFIG.appId};

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        immersive();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }

    // Hide status + navigation bars; a swipe from the edge shows them briefly.
    private void immersive() {
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        c.hide(WindowInsetsCompat.Type.systemBars());
    }
}
`);

// version + release signing (keystore comes from CI secrets or a local keystore.properties)
edit('android/app/build.gradle', (s) => {
  s = s.replace(/versionCode \S+/, 'versionCode((System.getenv("VERSION_CODE") ?: "1") as Integer)');
  s = s.replace(/versionName "[^"]*"/, `versionName "${CONFIG.versionName}"`);
  if (!s.includes('signingConfigs')) {
    s = s.replace(/\n {4}buildTypes \{/, `
    signingConfigs {
        release {
            def props = new Properties()
            def f = rootProject.file('keystore.properties')
            if (f.exists()) f.withInputStream { props.load(it) }
            def ks = System.getenv('RELIC_KEYSTORE') ?: props['storeFile']
            if (ks) {
                storeFile file(ks)
                storePassword System.getenv('RELIC_KEYSTORE_PASSWORD') ?: props['storePassword']
                keyAlias System.getenv('RELIC_KEY_ALIAS') ?: props['keyAlias']
                keyPassword System.getenv('RELIC_KEY_PASSWORD') ?: props['keyPassword']
            }
        }
    }
    buildTypes {`);
    s = s.replace(/release \{\n(\s+)minifyEnabled false/, (m, ind) => `release {\n${ind}if (signingConfigs.release.storeFile) signingConfig signingConfigs.release\n${ind}minifyEnabled false`);
  }
  return s;
});

run('npx cap sync android');
console.log('\nAndroid project ready. Build with:  cd android && ./gradlew bundleRelease');
