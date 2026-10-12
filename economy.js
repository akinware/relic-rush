// Relic Rush economy: two currencies (gold from runs, gems = premium), explorers with outfits and perks, trails,
// consumable boosters, permanent upgrades, relic chests, a 7-day login calendar, offers and the bookkeeping for ads
// and purchases. Everything lives in localStorage.
import CONFIG from './relic.config.json';

// ---------------------------------------------------------------- explorers (model + outfit tint + perk + how to unlock)
export const PERKS = {
  none: { name: 'All-rounder', desc: 'No special perk.' },
  magnet: { name: 'Lodestone', desc: 'Magnets last 4 s longer.' },
  luck: { name: 'Keen Eye', desc: '25% more power-ups on the road.' },
  gold: { name: 'Royal Purse', desc: '+15% gold from every run.' },
  dash: { name: 'Wind Runner', desc: 'Idol Dash carries you 50% further.' },
  revive: { name: 'Second Wind', desc: 'Gem revives after the first cost 1 gem less.' },
  nimble: { name: 'Light Feet', desc: 'Your first stumble each run never wakes the tiger.' },
  iron: { name: 'Iron Hide', desc: 'Starts every run with a shield.' },
  gems: { name: 'Gem Sense', desc: 'Twice as many gems on the road.' },
  valor: { name: 'Valor', desc: '+15% score on every run.' },
};
export const HEROES = [
  { id: 'rex', model: 'adventurer', name: 'Rex', outfit: 'Explorer', perk: 'none', unlock: { type: 'free' } },
  { id: 'ada', model: 'adventurer-f', name: 'Ada', outfit: 'Explorer', perk: 'magnet', unlock: { type: 'level', level: 3, gold: 800 } },
  { id: 'rex_ranger', model: 'adventurer', name: 'Rex', outfit: 'Desert Ranger', tint: 'ranger', perk: 'dash', unlock: { type: 'gold', price: 2000 } },
  { id: 'wren', model: 'hooded', name: 'Wren', outfit: 'Scout', perk: 'luck', unlock: { type: 'gold', price: 3500 } },
  { id: 'ada_jade', model: 'adventurer-f', name: 'Ada', outfit: 'Jade Warden', tint: 'jade', perk: 'magnet', unlock: { type: 'level', level: 10 } },
  { id: 'rex_spirit', model: 'adventurer', name: 'Rex', outfit: 'Spirit Walker', tint: 'spirit', perk: 'revive', unlock: { type: 'hunt', count: 5 } },
  { id: 'king', model: 'king', name: 'Old King', outfit: 'Monarch', perk: 'gold', unlock: { type: 'gems', price: 40 } },
  { id: 'wren_shadow', model: 'hooded', name: 'Wren', outfit: 'Shadow Thief', tint: 'shadow', perk: 'luck', unlock: { type: 'gems', price: 60 } },
  { id: 'king_gold', model: 'king', name: 'Old King', outfit: 'Golden Pharaoh', tint: 'gold', perk: 'gold', unlock: { type: 'iap', product: 'legend_pack' } },
  { id: 'rogue', model: 'rogue', name: 'Vex', outfit: 'Rogue', perk: 'nimble', unlock: { type: 'level', level: 8 } },
  { id: 'barbarian', model: 'barbarian', name: 'Brakka', outfit: 'Barbarian', perk: 'iron', unlock: { type: 'gold', price: 6500 } },
  { id: 'mage', model: 'mage', name: 'Ilyra', outfit: 'Sky Mage', perk: 'gems', unlock: { type: 'gems', price: 80 } },
  { id: 'shade', model: 'rogue-hooded', name: 'Vex', outfit: 'Shade', perk: 'dash', unlock: { type: 'level', level: 15 } },
  { id: 'knight', model: 'knight', name: 'Sir Aldric', outfit: 'Temple Knight', perk: 'valor', unlock: { type: 'gems', price: 150 } },
];
export const heroById = (id) => HEROES.find((h) => h.id === id) || HEROES[0];

export const TRAILS = [
  { id: 'none', name: 'No trail', color: null, unlock: { type: 'free' } },
  { id: 'ember', name: 'Ember', color: 0xff7a2f, unlock: { type: 'gold', price: 1500 } },
  { id: 'jade', name: 'Jade Wisps', color: 0x58e0a0, unlock: { type: 'level', level: 6 } },
  { id: 'spirit', name: 'Spirit', color: 0x7fdcff, unlock: { type: 'gems', price: 20 } },
  { id: 'rainbow', name: 'Prism', color: 'rainbow', unlock: { type: 'iap', product: 'legend_pack' } },
];

export const BOOSTERS = {
  headstart: { name: 'Head Start', desc: 'Blast through the first 500 m, untouchable.', price: 600 },
  shield: { name: 'Shield Start', desc: 'Begin the run with a shield that absorbs one hit.', price: 200 },
  doublegold: { name: 'Gold Rush', desc: 'Every coin counts twice for one run.', price: 400 },
};
export const HEADSTART_DIST = 500;

const UPGRADE_COSTS = [300, 800, 1600, 3200, 6000];
export const UPGRADES = {
  magnet: { name: 'Magnet', desc: (l) => `Magnet lasts ${10 + 2 * l}s`, max: 5 },
  luck: { name: 'Lucky Finds', desc: (l) => `More power-ups and gems (+${l * 15}%)`, max: 5 },
  dash: { name: 'Idol Dash', desc: (l) => `Idol Dash flies ${150 + 40 * l} m`, max: 5 },
};
export const upgradeCost = (lvl) => UPGRADE_COSTS[lvl];

export const EXCHANGE = [{ gems: 5, gold: 1000 }, { gems: 20, gold: 5000 }];
export const FREE = { gold: { amount: 200, perDay: 5 }, gem: { amount: 1, perDay: 2 } };
export const CHEST_PRICE = 8;               // gems
export const FREE_CHEST_HOURS = 4;

// 7-day login calendar; missing a day starts it over
export const DAILY = [
  { gold: 100 }, { gold: 200 }, { gems: 1 }, { gold: 400 }, { booster: 'shield' }, { gems: 2 }, { gems: 5, chest: 1 },
];

// ---------------------------------------------------------------- storage
const store = {
  get(k, d) { try { const v = localStorage.getItem('relicdash:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('relicdash:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const firstLaunch = store.get('runs', null) === null && store.get('bank', null) === null;
export const save = {
  best: store.get('best', 0), bank: store.get('bank', 0), gems: store.get('gems', firstLaunch ? 3 : 0),
  owned: store.get('owned', ['rex']), skin: store.get('skin', 'rex'),
  trails: store.get('trails', ['none']), trail: store.get('trail', 'none'),
  sound: store.get('sound', true), quality: store.get('quality', 'auto'), autoQ: store.get('autoQ', ''), tutorial: store.get('tutorial', 0), runs: store.get('runs', 0),
  boosters: { headstart: 0, shield: 0, doublegold: 0, ...store.get('boosters', firstLaunch ? { headstart: 1, shield: 2, doublegold: 1 } : {}) },
  equipped: store.get('equipped', []),
  upgrades: { magnet: 0, luck: 0, dash: 0, ...store.get('upgrades', {}) },
  daily: store.get('daily', { streak: 0, last: '' }),
  free: { date: '', gold: 0, gem: 0, ...store.get('free', {}) },
  chests: store.get('chests', firstLaunch ? 1 : 0),
  freeChestAt: store.get('freeChestAt', 0),
  noAds: store.get('noAds', false),
  doubleGold: store.get('doubleGold', false),
  firstBuy: store.get('firstBuy', false),
  offer: store.get('offer', { until: 0, seen: false }),
  tx: store.get('tx', []),
  ads: store.get('ads', { since: 0, lastAt: 0 }),
};
// earlier builds stored model ids
const LEGACY = { adventurer: 'rex', 'adventurer-f': 'ada', hooded: 'wren', king: 'king' };
save.owned = [...new Set(save.owned.map((id) => LEGACY[id] || id).filter((id) => HEROES.some((h) => h.id === id)))];
if (!save.owned.includes('rex')) save.owned.unshift('rex');
save.skin = LEGACY[save.skin] || save.skin;
if (!save.owned.includes(save.skin)) save.skin = 'rex';
if (!save.trails.includes('none')) save.trails.unshift('none');
export function persist() { for (const k of Object.keys(save)) store.set(k, save[k]); }
persist();

// ---------------------------------------------------------------- helpers
export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return today(d); };

// the perk is fixed when a run starts, so changing explorer in the shop mid-run can't change the payout
let runPerk = null;
export const setRunPerk = (p) => { runPerk = p; };
export const perk = () => runPerk || heroById(save.skin).perk;
export const magnetTime = () => 10 + 2 * save.upgrades.magnet + (perk() === 'magnet' ? 4 : 0);
export const powerupChance = () => 0.42 * (1 + 0.15 * save.upgrades.luck) * (perk() === 'luck' ? 1.25 : 1);
export const gemChance = () => 0.05 * (1 + 0.15 * save.upgrades.luck) * (perk() === 'gems' ? 2 : 1);
export const dashDistance = () => (150 + 40 * save.upgrades.dash) * (perk() === 'dash' ? 1.5 : 1);
export const scoreBonus = () => (perk() === 'valor' ? 1.15 : 1);
export const goldMultiplier = () => (save.doubleGold ? 2 : 1) * (perk() === 'gold' ? 1.15 : 1);
// gems spent on reviving: 1, 2, 4, 8 … within one run (the first revive per run can be an ad instead)
export const reviveCost = (n) => Math.max(1, 2 ** n - (perk() === 'revive' ? 1 : 0));

export function spend(cur, amount) {
  const key = cur === 'gems' ? 'gems' : 'bank';
  if (save[key] < amount) return false;
  save[key] -= amount; persist(); return true;
}
export function give({ gold = 0, gems = 0, booster = null, n = 1, chest = 0 } = {}) {
  save.bank += Math.round(gold); save.gems += gems; save.chests += chest;
  if (booster) save.boosters[booster] = (save.boosters[booster] || 0) + n;
  persist();
}

// ---------------------------------------------------------------- unlocks (explorers + trails share the same rules)
/** @returns {{ok:boolean, can:boolean, label:string, cur?:string, price?:number}} */
export function unlockState(item, level, huntsDone) {
  const owned = (item.model ? save.owned : save.trails).includes(item.id);
  const u = item.unlock;
  if (owned || u.type === 'free') return { ok: true, can: false, label: 'Unlocked' };
  if (u.type === 'gold') return { ok: false, can: save.bank >= u.price, label: `${u.price.toLocaleString('en')}`, cur: 'gold', price: u.price };
  if (u.type === 'gems') return { ok: false, can: save.gems >= u.price, label: `${u.price}`, cur: 'gems', price: u.price };
  if (u.type === 'level') {
    if (level >= u.level) return { ok: false, can: true, label: 'Claim', cur: 'free', price: 0 };
    if (u.gold) return { ok: false, can: save.bank >= u.gold, label: `${u.gold.toLocaleString('en')}`, cur: 'gold', price: u.gold, note: `or reach level ${u.level}` };
    return { ok: false, can: false, label: `Level ${u.level}`, cur: 'lock' };
  }
  if (u.type === 'hunt') {
    if (huntsDone >= u.count) return { ok: false, can: true, label: 'Claim', cur: 'free', price: 0 };
    return { ok: false, can: false, label: `${huntsDone}/${u.count} hunts`, cur: 'lock' };
  }
  if (u.type === 'iap') return { ok: false, can: false, label: 'Legend Pack', cur: 'iap' };
  return { ok: false, can: false, label: '' };
}
export function unlock(item, level, huntsDone) {
  const st = unlockState(item, level, huntsDone);
  if (st.ok || !st.can) return false;
  if (st.cur === 'gold' || st.cur === 'gems') { if (!spend(st.cur, st.price)) return false; }
  (item.model ? save.owned : save.trails).push(item.id); persist();
  return true;
}

// ---------------------------------------------------------------- relic chests (odds shown in the game before opening)
export const CHEST_ODDS = [
  { kind: 'gold', weight: 55, label: 'Gold (300–1,500)' },
  { kind: 'booster', weight: 30, label: 'A booster' },
  { kind: 'gems', weight: 15, label: 'Gems (2–6)' },
];
export function openChest() {
  if (save.chests <= 0) return null;
  save.chests--;
  let r = Math.random() * 100, pick = CHEST_ODDS[0];
  for (const o of CHEST_ODDS) { if (r < o.weight) { pick = o; break; } r -= o.weight; }
  let reward;
  if (pick.kind === 'gold') reward = { gold: Math.round((300 + Math.random() * 1200) / 50) * 50 };
  else if (pick.kind === 'booster') { const ids = Object.keys(BOOSTERS); reward = { booster: ids[Math.floor(Math.random() * ids.length)] }; }
  else reward = { gems: 2 + Math.floor(Math.random() * 5) };
  give(reward);
  return reward;
}
export const freeChestIn = () => Math.max(0, save.freeChestAt - Date.now());
export function claimFreeChest() { if (freeChestIn() > 0) return false; save.freeChestAt = Date.now() + FREE_CHEST_HOURS * 3600e3; give({ chest: 1 }); return true; }

// ---------------------------------------------------------------- daily calendar
export function dailyStatus() {
  const t = today();
  if (save.daily.last === t) return { claimable: false, day: (save.daily.streak - 1) % DAILY.length };
  const streak = save.daily.last === yesterday() ? save.daily.streak : 0;
  return { claimable: true, day: streak % DAILY.length, streak };
}
export function claimDaily(mult = 1) {
  const st = dailyStatus(); if (!st.claimable) return null;
  const r = DAILY[st.day];
  give({ gold: (r.gold || 0) * mult, gems: (r.gems || 0) * mult, booster: r.booster || null, n: mult, chest: (r.chest || 0) * mult });
  save.daily = { streak: st.streak + 1, last: today() }; persist();
  return r;
}

// ---------------------------------------------------------------- free rewards (rewarded ads, daily caps)
function freeToday() { if (save.free.date !== today()) save.free = { date: today(), gold: 0, gem: 0 }; return save.free; }
export const freeLeft = (kind) => FREE[kind].perDay - freeToday()[kind];
export function claimFree(kind) {
  const f = freeToday(); if (f[kind] >= FREE[kind].perDay) return false;
  f[kind]++;
  if (kind === 'gold') give({ gold: FREE.gold.amount }); else give({ gems: FREE.gem.amount });
  return true;
}

// ---------------------------------------------------------------- limited-time starter offer
export const OFFER_HOURS = 48;
export function offerState() {
  if (save.tx.includes('owned:starter_pack')) return { active: false };
  if (!save.offer.until && save.runs >= 3) { save.offer = { until: Date.now() + OFFER_HOURS * 3600e3, seen: false }; persist(); }
  const left = save.offer.until - Date.now();
  return { active: left > 0, left, fresh: left > 0 && !save.offer.seen };
}
export function offerSeen() { save.offer.seen = true; persist(); }

// ---------------------------------------------------------------- purchases
/** Applies a Play purchase once. Returns true if something new was granted. */
export function grantProduct(id, txId) {
  const p = CONFIG.products[id]; if (!p) return false;
  const key = p.kind === 'consumable' ? txId : 'owned:' + id;
  if (key && save.tx.includes(key)) return false;
  if (key) {
    save.tx.push(key);
    // keep every ownership key; trim only old consumable transaction ids
    const owned = save.tx.filter((k) => k.startsWith('owned:')), rest = save.tx.filter((k) => !k.startsWith('owned:'));
    save.tx = [...owned, ...rest.slice(-200)];
  }
  if (p.removeAds) save.noAds = true;
  if (p.doubleGold) save.doubleGold = true;
  for (const u of p.unlocks || []) {
    if (HEROES.some((h) => h.id === u) && !save.owned.includes(u)) save.owned.push(u);
    if (TRAILS.some((t) => t.id === u) && !save.trails.includes(u)) save.trails.push(u);
  }
  let gems = p.gems || 0;
  if (p.kind === 'consumable' && gems && !save.firstBuy) { gems *= 2; save.firstBuy = true; }   // first gem pack counts double
  give({ gold: p.gold || 0, gems, chest: p.chests || 0 });
  return true;
}

// ---------------------------------------------------------------- interstitial pacing
let rewardedThisRun = false;
export const markRewarded = () => { rewardedThisRun = true; };
export const newRunForAds = () => { rewardedThisRun = false; save.ads.since++; persist(); };
export function interstitialDue() {
  const c = CONFIG.ads;
  if (save.noAds || rewardedThisRun) return false;
  if (save.runs <= c.interstitialGraceRuns) return false;
  if (save.ads.since < c.interstitialEveryRuns) return false;
  return Date.now() - save.ads.lastAt >= c.interstitialMinGapSeconds * 1000;
}
export function interstitialShown() { save.ads = { since: 0, lastAt: Date.now() }; persist(); }
