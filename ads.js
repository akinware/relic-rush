// Ads for Relic Rush.
//  - Android app (Capacitor): Google AdMob — rewarded + interstitial, with Google's consent form (UMP) for EU/UK users.
//  - Web: "demo" shows a labelled placeholder so the flows can be tried; "h5" uses Google H5 Games Ads (needs AdSense approval);
//    "off" disables ads (rewarded buttons then grant nothing and are hidden).
import { Capacitor } from '@capacitor/core';
import CONFIG from './relic.config.json';

const NATIVE = Capacitor.isNativePlatform();
const Q = new URLSearchParams(location.search);
const WEB_MODE = Q.has('noads') ? 'off' : (Q.has('demoads') || window.RELIC_DEMO_ADS) ? 'demo' : (CONFIG.ads.web || 'off');
const A = CONFIG.admob;

let AdMob = null;
let audioHook = () => {};
const state = { ready: false, rewardedLoaded: false, interstitialLoaded: false, privacyRequired: false, busy: false };
const backoff = { rewarded: 0, interstitial: 0 };
const loading = { rewarded: false, interstitial: false };
const timers = { rewarded: 0, interstitial: 0 };

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function withTimeout(promise, ms, fallback) { return Promise.race([promise, wait(ms).then(() => fallback)]); }

// ---------------------------------------------------------------- native (AdMob)
async function nativeInit() {
  ({ AdMob } = await import('@capacitor-community/admob'));
  try {
    let info = await AdMob.requestConsentInfo();
    if (info.isConsentFormAvailable && info.status === 'REQUIRED') info = await AdMob.showConsentForm();
    state.privacyRequired = info.privacyOptionsRequirementStatus === 'REQUIRED';
    if (info.canRequestAds === false) { state.ready = false; return; }
  } catch (e) { console.warn('consent', e); }
  await AdMob.initialize({ initializeForTesting: !!A.testing, tagForChildDirectedTreatment: false, maxAdContentRating: 'Teen' });
  state.ready = true;
  loadRewarded(); loadInterstitial();
}
// one load at a time per format; failures back off 10s → 20s → … → 2 min
function retry(kind) {
  backoff[kind] = Math.min(120000, (backoff[kind] || 5000) * 2);
  clearTimeout(timers[kind]);
  timers[kind] = setTimeout(() => (kind === 'rewarded' ? loadRewarded() : loadInterstitial()), backoff[kind]);
}
async function loadRewarded() {
  if (!state.ready || state.rewardedLoaded || loading.rewarded) return;
  loading.rewarded = true;
  try { await AdMob.prepareRewardVideoAd({ adId: A.rewarded, isTesting: !!A.testing, immersiveMode: true }); state.rewardedLoaded = true; backoff.rewarded = 0; }
  catch { state.rewardedLoaded = false; retry('rewarded'); }
  finally { loading.rewarded = false; }
}
async function loadInterstitial() {
  if (!state.ready || state.interstitialLoaded || loading.interstitial) return;
  loading.interstitial = true;
  try { await AdMob.prepareInterstitial({ adId: A.interstitial, isTesting: !!A.testing, immersiveMode: true }); state.interstitialLoaded = true; backoff.interstitial = 0; }
  catch { state.interstitialLoaded = false; retry('interstitial'); }
  finally { loading.interstitial = false; }
}
function nativeRewarded() {
  return new Promise((resolve) => {
    let earned = false, settled = false; const subs = [];
    const done = (v) => { if (settled) return; settled = true; clearTimeout(guard); subs.forEach((s) => s.then((h) => h.remove()).catch(() => {})); resolve(v); };
    const guard = setTimeout(() => done(earned), 180000);   // never leave the game locked if no event arrives
    subs.push(AdMob.addListener('onRewardedVideoAdReward', () => { earned = true; }));
    subs.push(AdMob.addListener('onRewardedVideoAdDismissed', () => done(earned)));
    subs.push(AdMob.addListener('onRewardedVideoAdFailedToShow', () => done(false)));
    state.rewardedLoaded = false;
    AdMob.showRewardVideoAd().then(() => { earned = true; }).catch(() => done(false));
  }).finally(() => loadRewarded());
}
function nativeInterstitial() {
  return new Promise((resolve) => {
    let settled = false; const subs = [];
    const done = (shown) => { if (settled) return; settled = true; clearTimeout(guard); subs.forEach((s) => s.then((h) => h.remove()).catch(() => {})); resolve(shown); };
    const guard = setTimeout(() => done(true), 90000);
    subs.push(AdMob.addListener('interstitialAdDismissed', () => done(true)));
    subs.push(AdMob.addListener('interstitialAdFailedToShow', () => done(false)));
    state.interstitialLoaded = false;
    AdMob.showInterstitial().catch(() => done(false));
  }).finally(() => loadInterstitial());
}

// ---------------------------------------------------------------- web: demo placeholder
function demoAd(kind) {
  return new Promise((resolve) => {
    const secs = kind === 'reward' ? 5 : 3;
    const el = document.createElement('div');
    el.className = 'demo-ad';
    el.innerHTML = `<div class="demo-ad-card"><small>${kind === 'reward' ? 'Rewarded ad' : 'Ad'} · demo</small>
      <b>Your ad here</b><p>Real Google ads play in the Android app.</p>
      <div class="demo-ad-bar"><i></i></div><button type="button" disabled>Wait ${secs}s</button></div>`;
    document.body.appendChild(el);
    const btn = el.querySelector('button'), bar = el.querySelector('.demo-ad-bar i');
    let left = secs, earned = false;
    bar.style.transition = `width ${secs}s linear`; requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = '100%'; }));
    const t = setInterval(() => {
      left--;
      if (left > 0) { btn.textContent = `Wait ${left}s`; return; }
      clearInterval(t); earned = true; btn.disabled = false; btn.textContent = kind === 'reward' ? 'Collect reward' : 'Close';
    }, 1000);
    btn.addEventListener('click', () => { el.remove(); resolve(earned); });
  });
}

// ---------------------------------------------------------------- web: Google H5 Games Ads (Ad Placement API)
function h5Init() {
  if (!CONFIG.ads.adsenseClient) return;
  const s = document.createElement('script');
  s.async = true; s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CONFIG.ads.adsenseClient}`;
  s.dataset.adFrequencyHint = '60s';
  document.head.appendChild(s);
  window.adsbygoogle = window.adsbygoogle || [];
  window.adBreak = window.adConfig = function (o) { window.adsbygoogle.push(o); };
  window.adConfig({ preloadAdBreaks: 'on', sound: 'on' });
  state.ready = true;
}
function h5Rewarded(name) {
  return new Promise((resolve) => {
    let earned = false, settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    window.adBreak({
      type: 'reward', name,
      beforeAd: () => audioHook(false), afterAd: () => audioHook(true),
      beforeReward: (showAdFn) => showAdFn(),
      adViewed: () => { earned = true; }, adDismissed: () => { earned = false; },
      adBreakDone: () => finish(earned),
    });
    setTimeout(() => finish(earned), 120000);
  });
}
function h5Interstitial(name) {
  return withTimeout(new Promise((resolve) => {
    window.adBreak({ type: 'next', name, beforeAd: () => audioHook(false), afterAd: () => audioHook(true),
      adBreakDone: (info) => resolve(!!info && info.breakStatus === 'viewed') });
  }), 90000, false);
}

// ---------------------------------------------------------------- public API
export const Ads = {
  native: NATIVE,
  get enabled() { return NATIVE ? state.ready : WEB_MODE === 'demo' || (WEB_MODE === 'h5' && state.ready); },
  get privacyOptionsRequired() { return NATIVE && state.privacyRequired; },
  get busy() { return state.busy; },
  setAudioHook(fn) { audioHook = fn; },
  async init() {
    try {
      if (NATIVE) await nativeInit();
      else if (WEB_MODE === 'h5') h5Init();
    } catch (e) { console.warn('ads init', e); }
  },
  /** Whether a rewarded ad can be offered right now (buttons hide when false). */
  rewardedAvailable() {
    if (NATIVE) { if (state.ready && !state.rewardedLoaded) loadRewarded(); return state.ready && state.rewardedLoaded; }
    return this.enabled;
  },
  /** Shows a rewarded ad; resolves true only if the reward was earned. */
  async showRewarded(placement) {
    if (state.busy || !this.enabled) return false;
    state.busy = true; audioHook(false);
    try {
      if (NATIVE) { if (!state.rewardedLoaded) await withTimeout(loadRewarded(), 6000); return state.rewardedLoaded ? await nativeRewarded() : false; }
      if (WEB_MODE === 'h5') return await h5Rewarded(placement);
      return await demoAd('reward');
    } catch (e) { console.warn('rewarded', e); return false; }
    finally { state.busy = false; audioHook(true); }
  },
  /** Shows an interstitial (caller decides pacing). Resolves true only if an ad was actually shown. */
  async showInterstitial(placement) {
    if (state.busy || !this.enabled) return false;
    if (NATIVE && !state.interstitialLoaded) { loadInterstitial(); return false; }
    state.busy = true; audioHook(false);
    try {
      if (NATIVE) return await nativeInterstitial();
      if (WEB_MODE === 'h5') return await h5Interstitial(placement);
      await demoAd('interstitial'); return true;
    } catch (e) { console.warn('interstitial', e); return false; }
    finally { state.busy = false; audioHook(true); }
  },
  async showPrivacyOptions() {
    if (!NATIVE || !AdMob) return;
    try {
      await AdMob.showPrivacyOptionsForm();
      if (!state.ready) {   // the player may have just allowed ads
        const info = await AdMob.requestConsentInfo();
        if (info.canRequestAds) { await AdMob.initialize({ initializeForTesting: !!A.testing, tagForChildDirectedTreatment: false, maxAdContentRating: 'Teen' }); state.ready = true; loadRewarded(); loadInterstitial(); }
      }
    } catch (e) { console.warn('privacy form', e); }
  },
};
