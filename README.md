# Relic Rush 🏃‍♂️🐯

> **© 2026 Akinware. All rights reserved.** This code is public to read, not to reuse. See [LICENSE](LICENSE). Play the game at [relicrush.akinware.live](https://relicrush.akinware.live) or on [itch.io](https://akinware.itch.io/relic-rush).

Akinware'in sonsuz koşu oyunu. Three.js ile yazıldı, Android'e Capacitor ile paketleniyor. Reklamlar Google AdMob, satın almalar Google Play Billing ile çalışıyor.

---

## İçindekiler
0. [Android telefonum yok, ne yapacağım?](#0-android-telefonum-yok-ne-yapacağım)
1. [Dosyalar](#1-dosyalar)
2. [GitHub](#2-github)
3. [İlk test APK'sı](#3-ilk-test-apksı-telefonda-dene)
4. [İmza anahtarı ve yayın dosyası (AAB)](#4-imza-anahtarı--yayın-dosyası-aab)
5. [AdMob kurulumu (gerçek reklamlar)](#5-admob-kurulumu-gerçek-reklamlar)
6. [Google Play Console](#6-google-play-console)
7. [Web sürümü: Vercel ve itch.io](#7-web-sürümü-vercel-ve-itchio)
8. [Ayarlar ve ekonomi](#8-ayarlar-ve-ekonomi)
9. [Elindeki araçlar nerede işe yarar?](#9-elindeki-araçlar-nerede-işe-yarar)

---

## 0. Android telefonum yok, ne yapacağım?

Çoğu adımı telefonsuz yapabilirsin. Sadece **bir kere** birinin Android telefonunu 5 dakikalığına ödünç alman gerekecek.

| İş | Telefonsuz nasıl? |
|---|---|
| Oyunun çalıştığını görmek | GitHub, oyunu her build'de kendi sanal Android telefonunda (emülatör) açıp **ekran görüntüsü ve log** kaydediyor: Actions → run → Artifacts → `emulator-check-…` (bölüm 3). |
| Elle oynamak | Mac'e ücretsiz **Android Studio** kur → Device Manager → bir Pixel emülatörü başlat → APK dosyasını emülatör penceresine sürükle. Ya da tarayıcıda web sürümünü oyna (bölüm 7). |
| Gerçek cihazlarda test | Play Console'a test sürümü yükleyince Google **Pre-launch report** ile oyunu gerçek telefonlarda otomatik açar; çökme, ekran görüntüsü ve performans raporu verir. Ücretsiz. |
| Geliştirici hesabı doğrulaması | Yeni kişisel hesaplarda Google, **gerçek bir Android telefonla** bir kere doğrulama ister (Android 10+, root'suz). Emülatör kabul edilmiyor. Bir arkadaşının telefonuna **Play Console** uygulamasını kur, kendi hesabınla giriş yap, Verify'a bas, sonra çıkış yap. Telefonu sonra tekrar kullanman gerekmiyor. |
| 12 test kullanıcısı | Yeni kişisel hesaplarda yayından önce **12 kişinin 14 gün** kapalı teste katılması şart. Android telefonu olan arkadaş ve aile: Gmail adreslerini al, test linkini gönder, oyunu kurup 14 gün silmesinler. |

Kaynak: [Play Console – cihaz doğrulaması](https://support.google.com/googleplay/android-developer/answer/14316361), [12 test kullanıcısı kuralı](https://support.google.com/googleplay/android-developer/answer/14151465).

---

## 1. Dosyalar

| Dosya | Ne işe yarar |
|---|---|
| `game.js` | Oyunun kendisi: dünya, karakterler, kaplan, kontroller, revive, booster'lar, kırık zemin, ip köprüler, **zipline** ve **maden vagonu** bölümleri, **güç barı** (altın topladıkça dolar, çift dokununca seçili gücü ateşler), kırmızı/mavi altın, gölgeler |
| `economy.js` | Altın/elmas, 14 kaşif + perk'leri, trail'ler, booster, upgrade, sandıklar, teklifler, günlük ödül, reklam sıklığı |
| `progress.js` | Görevler (3'lü set), seviye = skor çarpanı, günlük RELIC harf avı |
| `look.js` | Gökyüzü, dağlar, sis ve 4 bölge (gün doğumu → zümrüt → kızıl kanyon → ay ışığı) |
| `scenery.js` | Yeni grafik kiti: PBR taş yol/duvar/kaya/ahşap malzemeleri (normal + roughness + AO haritaları), prosedürel orman ağaçları, palmiyeler, oymalı sütunlar, kaya kuleleri, şelaleler, sarmaşık/eğrelti, güneş huzmeleri, ip köprü, zipline ve maden vagonu parçaları |
| `props.js` | Engeller ve toplanabilirler, hepsi kodla üretiliyor: taş kapı, idol başı, totem, kaya, devrilmiş ağaç, ateş çukuru (shader ateşi), meşaleler, küp, moloz, altın/kırmızı/mavi para, elmas, kalkan, mıknatıs, idol, harf madalyonu |
| `tools/gen-textures.py` | `tex-*.jpg/png` dokularını sıfırdan üretir (`python3 tools/gen-textures.py`); hepsi bizim, lisans derdi yok |
| `shop.js` | Mağaza, görevler, sandık, teklif, günlük ödül ve ayarlar ekranları |
| `ads.js` | AdMob (Android) / demo reklam (web) |
| `iap.js` | Google Play uygulama içi satın alma |
| `relic.config.json` | **AdMob ID'leri, reklam sıklığı, ürünler**: değiştireceğin tek dosya |
| `index.html` | Arayüz (menü, HUD, kartlar) |
| `build.mjs` | Oyunu `dist/` klasörüne derler |
| `android-setup.mjs` | Android projesini hazırlar (ikon, AdMob ID, tam ekran, imza) |
| `.github/workflows/android.yml` | GitHub Actions: Android APK/AAB üretir |
| `.github/workflows/web.yml` | GitHub Actions: itch.io için web zip'i üretir |
| `*.glb` | Sadece karakter modelleri (hepsi CC0, bkz. `CREDITS.txt`). Rex/Ada/Wren/Kral'ın animasyonları Quaternius Universal Animation Library'den aktarıldı (sprint, zıplama başla/havada/iniş, takla, düşme, darbe, idle, dans) |
| `tiger/species.js` + `tiger-low.animal` | **Kaplan**: `vendor/procedural-animals` (MIT) kütüphanesinin aslan iskeleti, kası, kürkü, IK yürüyüş/dörtnala ve saldırısı + bizim kaplan postu (turuncu, beyaz karın, siyah çizgiler). `.animal` dosyası önceden "pişirilmiş" hali; postu değiştirirsen `node tools/bake-tiger.mjs` ile yeniden üret |
| `tiger-*.mp3` | Gerçek kükreme/hırıltı sesleri (0 A.D. / Wildfire Games, CC BY-SA 3.0; kredi oyunda) |
| `music-*.ogg` | Müzikler: menüde SuperTux'un "Mortimer's Chipdisko" parçası; koşu sırasında aynı tarzda, bize ait 4 chiptune/disko parça (gün doğumu 140, zümrüt orman 146, kızıl kanyon 152, ay ışığı 158 BPM) ve Idol Rush müziği. Koşu parçalarını `python3 tools/chipgen.py` üretiyor; notalar dosyanın içinde, değiştirip yeniden üretebilirsin. Kaplan yaklaşınca kalp atışı sesi hızlanıyor |
| `vendor/procedural-animals/` | Kaplanı çizen/oynatan kütüphane (MIT, lisans dosyası içinde) |
| `privacy.html` | Gizlilik politikası (Play bunu zorunlu tutuyor) |
| `feature-graphic-1024x500.png`, `screenshot-*.png`, `play-icon-512.png` | Play Store görselleri |

---

## 2. GitHub

Kod `github.com/akinware/relic-rush` reposunda. İki otomatik iş (workflow) var, ikisi de `main`'e her gönderimde kendiliğinden çalışır:

- `.github/workflows/android.yml` → **Build Android app**: APK/AAB üretir (bölüm 3–4).
- `.github/workflows/web.yml` → **Build web version (itch.io)**: tarayıcı sürümünü zip olarak üretir. itch.io'ya yüklenecek dosya bu (bölüm 7).

---

## 3. İlk build ve test (telefonsuz)

1. Repo'da **Actions** sekmesi → solda **Build Android app** → **Run workflow** → **Run**.
2. ~10 dakika sonra **android** işi yeşil tik alır. Ardından **emulator-check** işi oyunu sanal bir Pixel telefonda açar (~10-15 dk daha).
3. Run'a tıkla, en alttaki **Artifacts**:
   - `relic-rush-android-…`: APK/AAB dosyaları
   - `emulator-check-…`: `emulator-1-start.png`, `emulator-2-menu.png`, `emulator-3-run.png` ekran görüntüleri + `emulator-logcat.txt`. Menü ve oyun görüntüleri geliyorsa uygulama çalışıyor demektir.
4. Elle oynamak istersen: `relic-rush-debug.apk`'yı Android Studio emülatörüne sürükle, ya da Android telefonu olan bir arkadaşına gönder. Oyunda **Google'ın test reklamları** çıkar ("Test Ad" yazılı).

> Kırmızı ❌ çıkarsa run'a tıkla, hatalı adımı aç, log'u bana yapıştır.

---

## 4. İmza anahtarı + yayın dosyası (AAB)

Ayrı gönderdiğim `relic-dash-signing.zip` içinde senin **upload key**'in var. **Bunu kaybetme ve kimseyle paylaşma.** Şifre yöneticisine ya da Drive'da gizli bir klasöre yedekle.

1. Repo → **Settings → Secrets and variables → Actions → New repository secret**. 4 tane ekle:

| Name | Value |
|---|---|
| `KEYSTORE_BASE64` | `KEYSTORE_BASE64.txt` içindeki uzun metnin tamamı |
| `KEYSTORE_PASSWORD` | `secrets.txt` içindeki şifre |
| `KEY_ALIAS` | `upload` |
| `KEY_PASSWORD` | `secrets.txt` içindeki şifre (aynısı) |

2. Workflow'u tekrar çalıştır. Artifacts'ta şunlar çıkar:
   - `relic-rush-release.aab`: **Google Play'e yüklenen dosya**
   - `relic-rush-release.apk`: imzalı, telefona kurulabilen sürüm
3. Her çalıştırmada sürüm kodu otomatik artar. Play aynı kodu iki kez kabul etmez, sen bir şey yapmazsın.

---

## 5. AdMob kurulumu (gerçek reklamlar)

Şu an `relic.config.json` içinde **Google'ın test ID'leri** var. Para kazanmak için kendi ID'lerini koyman gerekiyor.

1. https://admob.google.com → Google hesabınla gir, ödeme/vergi bilgilerini doldur.
2. **Apps → Add app → Android**. "Uygulama yayınlandı mı?" sorusuna **Hayır** de, adı `Relic Rush` yap. Sana bir **App ID** verir (`ca-app-pub-XXXX~YYYY`).
3. **Ad units → Add ad unit**:
   - **Rewarded** → adı "Revive & bonus" → ID'yi kopyala (`ca-app-pub-XXXX/ZZZZ`)
   - **Interstitial** → adı "Run end" → ID'yi kopyala
4. **Privacy & messaging → European regulations (GDPR) → Create message**. Uygulamayı seç ve yayınla. Avrupa'daki oyunculara açılışta izin formu çıkar; oyun bunu zaten çağırıyor.
5. GitHub'da `relic.config.json` dosyasını düzenle (kalem ikonu):
   ```json
   "admob": {
     "appId": "ca-app-pub-SENİN~APPID",
     "rewarded": "ca-app-pub-SENİN/REWARDED",
     "interstitial": "ca-app-pub-SENİN/INTERSTITIAL",
     "testing": false
   }
   ```
   ⚠️ Gerçek ID'lerle **kendi reklamına asla tıklama**. AdMob hesabı kapatılabilir. Kendi telefonunda test ederken `"testing": true` bırakabilirsin; yayın build'inden önce `false` yap.
6. Oyun Play'de yayınlandıktan sonra:
   - AdMob'da uygulamayı mağazaya bağla: **App settings → Link to app store**.
   - `app-ads.txt` dosyasını ekle. Akinware sitesine (akinware.live) `app-ads.txt` adında bir dosya koy, içine şunu yaz (pub ID AdMob'da **Account** altında):
     ```
     google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
     ```
     Play Console'da geliştirici web sitesi olarak `https://akinware.live` gir.

---

## 6. Google Play Console

**Hesap:** https://play.google.com/console → $25 tek seferlik ücret, kimlik doğrulaması.

**Uygulama oluştur:** Relic Rush · Oyun · Ücretsiz.

### Yükleme sırası
1. **Test → Internal testing** → Create release → `relic-rush-release.aab` yükle. İlk yüklemede **Play App Signing**'i kabul et.
2. **Monetize → Products → In-app products**. AAB yüklendikten sonra açılır. Bu 7 ürünü **aynı ID'lerle** oluştur:

| Product ID | Tür | Önerilen fiyat | Ne verir |
|---|---|---|---|
| `starter_pack` | tek seferlik | €3,99 | Reklamsız + 30 elmas + 3000 altın + 2 sandık (3. koşudan sonra 48 saatlik teklif olarak çıkar) |
| `legend_pack` | tek seferlik | €5,99 | Sir Aldric (Temple Knight) + Golden Pharaoh + Prism trail + 50 elmas + 3 sandık |
| `double_gold` | tek seferlik | €3,99 | Her koşudan 2 kat altın, kalıcı |
| `remove_ads` | tek seferlik | €2,99 | Koşu arası reklamları kaldırır |
| `gems_small` | tüketilebilir | €0,99 | 12 elmas (ilk elmas alımı 2 kat) |
| `gems_medium` | tüketilebilir | €4,99 | 70 elmas |
| `gems_large` | tüketilebilir | €9,99 | 160 elmas |

   Satış için **Payments profile** (ödeme profili) gerekiyor. Almanya'da düzenli gelir elde etmek genelde Gewerbeanmeldung ve vergi bildirimi gerektirir. Ben hukuk/vergi danışmanı değilim, Finanzamt'a ya da bir Steuerberater'a sormanı öneririm.

3. **Setup → License testing**: kendi Gmail'ini ekle. Böylece satın almaları ücretsiz test edersin.
4. **App content** (hepsi zorunlu):
   - **Privacy policy:** `https://SENİN-VERCEL-ADRESİN/privacy.html` (bkz. bölüm 7)
   - **Ads:** Evet, reklam içeriyor
   - **Target audience:** **13+** seç (13 altı seçme; Families kuralları devreye girer)
   - **Content rating:** anketi doldur. Şiddet sorusunda "fantastik/karikatür, kan yok".
   - **Data safety:** AdMob SDK'sı şunları toplar ve paylaşır (reklam, analiz, dolandırıcılık önleme amaçlı):
     - IP adresi (yaklaşık konum)
     - Uygulama içi etkileşimler
     - Tanılama verileri
     - Cihaz kimlikleri (reklam kimliği)

     Ayrıntılar Google'ın rehberinde: https://developers.google.com/admob/android/privacy/play-data-disclosure. Bunların dışında veri toplamıyoruz; kendi sunucumuz yok, oyun ilerlemesi sadece cihazda.
   - **Government apps / News / Health:** Hayır
5. **Store listing** (metinler aşağıda) + görseller:
   - Uygulama ikonu: `play-icon-512.png`
   - Feature graphic: `feature-graphic-1024x500.png`
   - Telefon ekran görüntüleri: `screenshot-1-menu.png` … `screenshot-7-tiger-pounce.png` (menü, kaplan kovalaması, zipline, maden vagonu, orman, kızıl kanyon, kaplan atlayışı)
6. **Closed testing:** yeni kişisel hesaplarda production'a geçmeden önce **en az 12 test kullanıcısının 14 gün boyunca** kapalı teste katılmış olması gerekiyor. Arkadaşlarının Gmail'lerini ekle, test linkini paylaş. 14 gün dolunca **Apply for production**.

### Store listing metinleri (İngilizce, kopyala-yapıştır)
**App name:** `Relic Rush: Jungle Run`

**Short description:** `Outrun the tiger, dodge ancient ruins and grab the gold in this jungle runner!`

**Full description:**
```
Run for your life along an ancient jungle road!

Swipe to turn at the torches, jump over logs, slide under stone arches and dodge crumbling statues. Trip twice and the tiger catches you!

★ Smooth one-thumb swipe controls
★ Endless winding temple paths that get faster the further you go
★ Four zones that change as you run: Sunrise Ruins, Emerald Canopy, Ember Gorge and the Moonlit Temple
★ Broken bridges, rope bridges, fire traps, stone gates and crumbling statues
★ Ride ziplines over the chasm and race mine carts through the old diggings
★ Fill your power meter with gold, then double-tap: Boost, Shield, Magnet or Coin Bonus
★ Red and blue coins worth double and triple
★ Missions raise your level and your score multiplier
★ Unlock 14 explorers and outfits, each with a perk: knights, mages, rogues and more
★ Idol Dash, magnets, shields, 2× gold and boosters
★ Daily Relic Hunt, daily rewards and relic chests
★ Plays offline

How far can you run?
```

---

## 7. Web sürümü: Vercel ve itch.io

**Vercel (relicrush.akinware.live)**

1. vercel.com → **Add New → Project** → `relic-rush` repo'sunu seç → **Deploy**. Ayarları `vercel.json` dosyası kendisi veriyor.
2. Proje → **Settings → Domains** → `relicrush.akinware.live` ekle.
3. name.com → akinware.live → DNS: **CNAME** · Host `relicrush` · Answer `cname.vercel-dns.com`.
4. Gizlilik linki (Play Console için): `https://relicrush.akinware.live/privacy.html`.

**itch.io**

1. GitHub → **Actions** → **Build web version (itch.io)** → en son yeşil çalışma → **Artifacts** → `relic-rush-web-…` zip'ini indir. Zip'i açma, olduğu gibi yükle.
2. itch.io → **Upload new project** → Kind of project: **HTML** → zip'i yükle → **This file will be played in the browser** işaretle.
3. Embed options: **Viewport 405 × 720**, **Mobile friendly** (Orientation: Portrait), **Fullscreen button** açık.

Web sürümünde reklam ve gerçek parayla satın alma kapalı. Reklam akışını tarayıcıda denemek için adresin sonuna `?demoads` ekle.

---

## 8. Ayarlar ve ekonomi

`relic.config.json`:
- `interstitialEveryRuns`: kaç koşuda bir zorunlu reklam (şu an **1** = her koşudan sonra)
- `interstitialMinGapSeconds`: iki zorunlu reklam arası en az süre (45 sn)
- `interstitialGraceRuns`: yeni oyuncuya ilk kaç koşu reklam gösterilmez (2)

Kurallar:
- Oyuncu o koşuda ödüllü reklam izlediyse (revive, ×2 altın) zorunlu reklam **gösterilmez**.
- Geri tuşuyla çıkarken de gösterilmez (Google'ın politikası).

`economy.js`: karakter/trail/booster/upgrade fiyatları, perk'ler, revive maliyeti (1 → 2 → 4 elmas), sandık oranları, günlük ödüller, ücretsiz ödül limitleri.
`progress.js`: görev havuzu ve zorluk eğrisi, seviye ödülleri, RELIC harf avı.

**Oyun döngüsü kısaca:** koş → altın/elmas/harf topla → görevler ilerler → 3 görev bitince seviye atla (skor çarpanı +1, sandık, altın) → altınla booster/upgrade/kaşif al → yeni kaşif perk'iyle daha uzağa koş. Bölgeler her 900 m'de değişir; zorluk mesafeyle artar.

**Kaşifler:** Rex (ücretsiz), Ada (seviye 3 veya 800 altın), Desert Ranger (2000 altın), Wren (3500 altın), Jade Warden (seviye 10), Spirit Walker (5 Relic Hunt), Vex (seviye 8), Shade (seviye 15), Brakka (6500 altın), Old King (40 elmas), Shadow Thief (60 elmas), Ilyra (80 elmas), Sir Aldric (150 elmas veya Legend Pack), Golden Pharaoh (sadece Legend Pack).

Kendi bilgisayarında çalıştırmak için (Node 22 lazım):
```
npm install
npm run build
npx serve dist
```

---

## 9. Elindeki araçlar nerede işe yarar?

- **JetBrains (WebStorm / Android Studio):** Kodu düzenlemek için WebStorm. Android Studio ücretsiz ve içindeki emülatörle telefonsuz oynayabilirsin (bölüm 0).
- **GitHub Education:** Actions dakikaları (APK/AAB build'leri) ve Copilot.
- **Figma Education:** Store görsellerini (feature graphic, ekran görüntüsü çerçeveleri, promo) güzelleştirmek için.
- **Google AI Pro (Gemini):** Store açıklamasını başka dillere çevirmek, promo görseli/video fikirleri, oyuncu yorumlarına cevap taslakları.

---

Kredi ve lisanslar: `CREDITS.txt`. Kaplan sesleri CC BY-SA 3.0 olduğu için kredi oyunun içinde (Ayarlar → Credits) duruyor; kaplan kütüphanesi MIT (lisans metni `vendor/procedural-animals/LICENSE`).
