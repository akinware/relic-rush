// In-app purchases (Google Play Billing) via capacitor-plugin-cdv-purchase.
// Only active inside the Android app; on the web the gem packs show as "In the app".
import { Capacitor } from '@capacitor/core';
import CONFIG from './relic.config.json';

const NATIVE = Capacitor.isNativePlatform();
const PRODUCTS = CONFIG.products;
let CP = null, store = null, onGrant = () => {}, onChange = () => {};
const state = { ready: false, error: '' };

export const IAP = {
  native: NATIVE,
  get ready() { return state.ready; },
  products: PRODUCTS,
  /**
   * @param grant (id, txId) => boolean — apply the reward; must return false if txId was already granted.
   * @param changed () => void — re-render prices/ownership.
   */
  async init(grant, changed) {
    onGrant = grant; onChange = changed;
    if (!NATIVE) return;
    try {
      CP = await import('capacitor-plugin-cdv-purchase');
      store = CP.store;
      const { ProductType, Platform } = CP;
      store.register(Object.entries(PRODUCTS).map(([id, p]) => ({
        id, platform: Platform.GOOGLE_PLAY,
        type: p.kind === 'consumable' ? ProductType.CONSUMABLE : ProductType.NON_CONSUMABLE,
      })));
      store.when()
        .productUpdated(() => onChange())
        .approved((tx) => {
          // No server: grant locally, de-duplicated by transaction id, then finish (consumes consumables).
          for (const pr of tx.products || []) if (PRODUCTS[pr.id]) onGrant(pr.id, tx.transactionId || tx.purchaseId || '');
          tx.finish();
          onChange();
        })
        .receiptUpdated(() => {
          for (const [id, p] of Object.entries(PRODUCTS)) if (p.kind !== 'consumable' && store.owned(id)) onGrant(id, 'owned:' + id);
          onChange();
        });
      store.error((e) => { state.error = e && e.message ? e.message : String(e); console.warn('iap', e); });
      await store.initialize([Platform.GOOGLE_PLAY]);
      state.ready = true;
      onChange();
    } catch (e) { console.warn('iap init', e); }
  },
  /** Localized price from Play, or the fallback shown before products load. */
  price(id) {
    const pr = store && store.get(id);
    const p = pr && pr.pricing;
    return (p && p.price) || PRODUCTS[id].fallbackPrice || '';
  },
  available(id) { return !!(store && store.get(id) && store.get(id).canPurchase); },
  async buy(id) {
    if (!store) return 'Purchases work in the Android app.';
    const pr = store.get(id); const offer = pr && pr.getOffer();
    if (!offer) return 'This item is not available right now.';
    const err = await offer.order();
    if (err && err.code !== CP.ErrorCode.PAYMENT_CANCELLED) return err.message || 'Purchase failed.';
    return '';
  },
  async restore() {
    if (!store) return 'Purchases work in the Android app.';
    const err = await store.restorePurchases();
    return err ? (err.message || 'Restore failed.') : '';
  },
};
