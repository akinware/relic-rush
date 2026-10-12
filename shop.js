// Shop, missions, relic chests, offers, daily reward, settings and small message toasts (HTML overlays above the game).
import CONFIG from './relic.config.json';
import { HEROES, TRAILS, PERKS, BOOSTERS, UPGRADES, EXCHANGE, FREE, DAILY, CHEST_PRICE, CHEST_ODDS, save, persist, spend, give, upgradeCost,
  dailyStatus, claimDaily, freeLeft, claimFree, markRewarded, unlockState, unlock, openChest, freeChestIn, claimFreeChest,
  offerState, offerSeen, today } from './economy.js';
import { prog, Progress, missionText, levelReady, multiplier, huntState, huntsCompleted } from './progress.js';
import { Ads } from './ads.js';
import { IAP } from './iap.js';

export const ICONS = {
  gem: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10l4 6-9 12L3 9z" fill="#5fd4ff"/><path d="M3 9h18M9 3l3 6 3-6M12 9v12" stroke="#1d6f99" stroke-width="1.2" fill="none"/></svg>',
  headstart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="#ffd34d"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5z" fill="#8fd3ff"/></svg>',
  doublegold: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="12" r="6" fill="#ffc93c" stroke="#b86f00" stroke-width="1.5"/><circle cx="15" cy="12" r="6" fill="#ffd85a" stroke="#b86f00" stroke-width="1.5"/><text x="15" y="15.5" font-size="8" text-anchor="middle" fill="#7a4300" font-family="Arial" font-weight="700">2×</text></svg>',
  magnet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h4v8a3 3 0 0 0 6 0V3h4v8a7 7 0 0 1-14 0z" fill="#ff6b5b"/><path d="M5 3h4v3H5zM15 3h4v3h-4z" fill="#e8eef2"/></svg>',
  luck: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="#7fd36a"><circle cx="8.5" cy="8.5" r="4"/><circle cx="15.5" cy="8.5" r="4"/><circle cx="8.5" cy="15.5" r="4"/><circle cx="15.5" cy="15.5" r="4"/></g><path d="M12 12l5 9" stroke="#3f7d31" stroke-width="2" stroke-linecap="round"/></svg>',
  ad: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="4" fill="currentColor" opacity=".25"/><path d="M10 9l5 3-5 3z" fill="currentColor"/></svg>',
  gift: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="9" width="18" height="12" rx="2" fill="#ff7a2f"/><rect x="2" y="7" width="20" height="4" rx="1.5" fill="#ffc93c"/><path d="M12 7v14" stroke="#fff4df" stroke-width="2.4"/><path d="M12 7c-2-4-6-4-6-1.5S10 7 12 7zm0 0c2-4 6-4 6-1.5S14 7 12 7z" fill="#ffc93c"/></svg>',
  noads: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="4" fill="#ff7a2f"/><text x="12" y="15.2" font-size="7.5" text-anchor="middle" fill="#fff" font-family="Arial" font-weight="700">ADS</text><path d="M4 20L20 4" stroke="#fff4df" stroke-width="2.4"/></svg>',
  hero: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="4" fill="#ffd9a8"/><path d="M4 21c0-5 3.6-8 8-8s8 3 8 8z" fill="#8fbf6a"/><path d="M7 6c1-4 9-4 10 0z" fill="#7a5230"/></svg>',
  coin: '<i class="coin-ico sm" aria-hidden="true"></i>',
  dash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l5 7-5 7-5-7z" fill="#3fe0b0"/><rect x="8" y="17" width="8" height="4" rx="1" fill="#ffc93c"/></svg>',
  chest: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5v1H3z" fill="#b8742c"/><rect x="3" y="11" width="18" height="9" rx="1.5" fill="#8f5520"/><rect x="3" y="10" width="18" height="2.4" fill="#ffc93c"/><rect x="10.5" y="10" width="3" height="5" rx="1" fill="#ffe08a"/></svg>',
  crown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill="#ffc93c"/><rect x="5" y="17" width="14" height="3" rx="1" fill="#e89a12"/></svg>',
  x2: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#ffc93c" stroke="#b86f00" stroke-width="1.6"/><text x="12" y="16" font-size="9" text-anchor="middle" fill="#7a4300" font-family="Arial" font-weight="700">×2</text></svg>',
};
const SWATCH = {
  rex: '#6f8d3c,#3d5526', ada: '#88a650,#e3c48c', rex_ranger: '#e2bb7a,#8d6a37', wren: '#6b4a2f,#2d2622', ada_jade: '#41d6a6,#1c6b56',
  rex_spirit: '#8fe4ff,#2a6f9a', king: '#3a4f8a,#d4b24a', wren_shadow: '#5a2f80,#140a1e', king_gold: '#ffe08a,#c27a0c',
  rogue: '#5b6b3a,#2c2f24', barbarian: '#c0642f,#5a3218', mage: '#4f7ee0,#d9c26a', shade: '#38404f,#111520', knight: '#c9d2dc,#3b5aa8',
};
const coinTag = (n) => `<span class="price">${ICONS.coin}${n.toLocaleString('en')}</span>`;
const gemTag = (n) => `<span class="price gem">${ICONS.gem}${n.toLocaleString('en')}</span>`;

const $ = (id) => document.getElementById(id);
let H = { onChange() {}, onSound() {}, onSkin() {}, onQuality() {}, sfx: null };
let tab = 'boosters';
const overlays = () => [$('shop'), $('settings'), $('daily'), $('doc'), $('missions'), $('chests'), $('offer')];

export function initShop(handlers) {
  H = { ...H, ...handlers };
  $('shopClose').addEventListener('click', () => { click(); closeOverlays(); });
  $('shopTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { click(); tab = b.dataset.tab; renderShop(); } });
  $('shopList').addEventListener('click', onShopAction);
  $('settingsClose').addEventListener('click', () => { click(); closeOverlays(); });
  $('settingsList').addEventListener('click', onSettingsAction);
  $('dailyClaim').addEventListener('click', () => claim(1));
  $('dailyDouble').addEventListener('click', async () => {
    const btn = $('dailyDouble'); btn.disabled = true;
    const ok = await Ads.showRewarded('daily_double'); btn.disabled = false;
    if (ok) { markRewarded(); claim(2); } else toastMsg('Ad not finished — claim normally or try again.');
  });
  $('docClose').addEventListener('click', () => { click(); closeOverlays(); });
  document.querySelectorAll('.close-ov').forEach((b) => b.addEventListener('click', () => { click(); closeOverlays(); }));
  $('missionList').addEventListener('click', onMissionAction);
  $('levelCard').addEventListener('click', onMissionAction);
  $('chestActions').addEventListener('click', onChestAction);
  $('offerBody').addEventListener('click', onOfferAction);
}
const click = () => H.sfx && H.sfx.click();
const ding = () => H.sfx && H.sfx.gem();

export function overlayOpen() { return overlays().some((o) => !o.hidden); }
export function closeOverlays() { overlays().forEach((o) => { o.hidden = true; }); $('docFrame').src = 'about:blank'; H.onChange(); }
function open(el) { overlays().forEach((o) => { o.hidden = o !== el; }); }

let msgTimer = 0;
export function toastMsg(text) {
  const m = $('msg'); m.textContent = text; m.hidden = false; m.classList.remove('show'); void m.offsetWidth; m.classList.add('show');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => { m.hidden = true; }, 2200);
}

export function renderWallet() {
  document.querySelectorAll('[data-wallet="gold"]').forEach((e) => { e.textContent = save.bank.toLocaleString('en'); });
  document.querySelectorAll('[data-wallet="gems"]').forEach((e) => { e.textContent = save.gems.toLocaleString('en'); });
}

// ---------------------------------------------------------------- shop
export function openShop(which) { if (which) tab = which; open($('shop')); renderShop(); }
function row(icon, title, desc, action, extra = '') {
  return `<li class="shop-row ${extra}"><span class="shop-ico">${icon}</span><span class="shop-txt"><b>${title}</b><small>${desc}</small></span>${action}</li>`;
}
const btn = (label, act, { disabled = false, cls = '' } = {}) => `<button class="sbtn ${cls}" type="button" data-act="${act}"${disabled ? ' disabled' : ''}>${label}</button>`;

function renderShop() {
  renderWallet();
  document.querySelectorAll('#shopTabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  let html = '';
  if (tab === 'boosters') {
    html += Object.entries(BOOSTERS).map(([id, b]) => row(ICONS[id], `${b.name} <em>×${save.boosters[id] || 0}</em>`, b.desc,
      btn(coinTag(b.price), `booster:${id}`, { disabled: save.bank < b.price }))).join('');
    html += `<li class="shop-note">Tap a booster on the main screen to use it on your next run.</li>`;
  } else if (tab === 'upgrades') {
    html += Object.entries(UPGRADES).map(([id, u]) => {
      const lvl = save.upgrades[id] || 0, maxed = lvl >= u.max;
      const pips = `<span class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</span>`;
      const desc = `${pips}${maxed ? u.desc(lvl) : `Next: ${u.desc(lvl + 1)}`}`;
      return row(ICONS[id], u.name, desc, maxed ? btn('Max', 'none', { disabled: true }) : btn(coinTag(upgradeCost(lvl)), `upgrade:${id}`, { disabled: save.bank < upgradeCost(lvl) }));
    }).join('');
  } else if (tab === 'heroes') {
    const lvl = prog.level, hunts = huntsCompleted();
    html += `<li class="shop-head">Explorers</li><li><ul class="hero-grid">${HEROES.map((h) => {
      const st = unlockState(h, lvl, hunts), sel = save.skin === h.id;
      const [c1, c2] = SWATCH[h.id].split(',');
      const action = sel ? btn('Selected', 'none', { disabled: true, cls: 'ghost' })
        : st.ok ? btn('Select', `skin:${h.id}`, { cls: 'ghost' })
        : st.cur === 'iap' ? btn('Legend Pack', `offer:legend_pack`, { cls: 'iap' })
        : st.cur === 'lock' ? btn(st.label, 'none', { disabled: true, cls: 'ghost' })
        : st.cur === 'free' ? btn('Claim', `skin:${h.id}`)
        : btn(st.cur === 'gems' ? gemTag(st.price) : coinTag(st.price), `skin:${h.id}`, { disabled: !st.can });
      return `<li class="hero-card${sel ? ' sel' : ''}"><span class="swatch" style="background:linear-gradient(135deg,${c1},${c2})"></span>
        <b>${h.name}</b><small>${h.outfit}${st.note && !st.ok ? ` · ${st.note}` : ''}</small><small class="perk">${PERKS[h.perk].name}: ${PERKS[h.perk].desc}</small>${action}</li>`;
    }).join('')}</ul></li>`;
    html += `<li class="shop-head">Trails</li>`;
    html += TRAILS.map((t) => {
      const st = unlockState(t, lvl, hunts), sel = save.trail === t.id;
      const color = t.color === 'rainbow' ? 'linear-gradient(90deg,#ff5a5a,#ffd84a,#5ae07a,#5ac8ff,#b06aff)' : t.color ? `#${t.color.toString(16).padStart(6, '0')}` : 'transparent';
      const icon = `<span style="display:block;width:28px;height:28px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,.25)"></span>`;
      const action = sel ? btn('On', 'none', { disabled: true, cls: 'ghost' })
        : st.ok ? btn('Use', `trail:${t.id}`, { cls: 'ghost' })
        : st.cur === 'iap' ? btn('Legend Pack', 'offer:legend_pack', { cls: 'iap' })
        : st.cur === 'lock' ? btn(st.label, 'none', { disabled: true, cls: 'ghost' })
        : st.cur === 'free' ? btn('Claim', `trail:${t.id}`)
        : btn(st.cur === 'gems' ? gemTag(st.price) : coinTag(st.price), `trail:${t.id}`, { disabled: !st.can });
      return row(icon, t.name, t.id === 'none' ? 'Run clean' : 'Sparks behind your runner', action, sel ? 'selected' : '');
    }).join('');
  } else if (tab === 'gems') {
    const adOk = Ads.rewardedAvailable();
    if (Ads.enabled) {
      html += `<li class="shop-head">Free</li>`;
      html += row(ICONS.gift, `+${FREE.gold.amount} gold`, `Watch a short video · ${freeLeft('gold')} left today`,
        btn(`${ICONS.ad}Watch`, 'free:gold', { disabled: !adOk || freeLeft('gold') <= 0, cls: 'ad' }));
      html += row(ICONS.gem, `+${FREE.gem.amount} gem`, `Watch a short video · ${freeLeft('gem')} left today`,
        btn(`${ICONS.ad}Watch`, 'free:gem', { disabled: !adOk || freeLeft('gem') <= 0, cls: 'ad' }));
    }
    html += `<li class="shop-head">Relic chests</li>`;
    html += row(ICONS.chest, `Relic chest <em>×${save.chests}</em>`, 'Gold, boosters or gems — odds shown before opening', btn(gemTag(CHEST_PRICE), 'chest:buy', { disabled: save.gems < CHEST_PRICE }));
    html += `<li class="shop-head">Store</li>`;
    const P = CONFIG.products;
    const buyBtn = (id) => (IAP.native ? btn(IAP.price(id), `iap:${id}`, { cls: 'iap' }) : btn('In app', 'none', { disabled: true, cls: 'ghost' }));
    const owned = (id) => save.tx.includes('owned:' + id);
    if (!owned('starter_pack')) html += row(ICONS.gift, 'Starter Pack', `No ads + ${P.starter_pack.gems} gems + ${P.starter_pack.gold.toLocaleString('en')} gold + 2 chests`, buyBtn('starter_pack'), 'featured');
    if (!owned('legend_pack')) html += row(ICONS.crown, 'Legend Pack', 'Sir Aldric the Temple Knight + Golden Pharaoh + Prism trail + 50 gems + 3 chests', buyBtn('legend_pack'), 'featured');
    if (!save.doubleGold) html += row(ICONS.x2, 'Double Gold', 'Every run pays twice the gold. Forever.', buyBtn('double_gold'));
    if (!save.noAds) html += row(ICONS.noads, 'Remove Ads', 'No more ads between runs. Bonus videos stay optional.', buyBtn('remove_ads'));
    for (const id of ['gems_small', 'gems_medium', 'gems_large']) {
      const n = P[id].gems, first = !save.firstBuy;
      html += row(ICONS.gem, first ? `${n * 2} gems <em>2× first buy</em>` : `${n} gems`, id === 'gems_large' ? 'Best value' : id === 'gems_medium' ? 'Popular' : 'A handful', buyBtn(id));
    }
    html += `<li class="shop-head">Exchange</li>`;
    html += EXCHANGE.map((x, i) => row(ICONS.coin.replace('sm', ''), `${x.gold.toLocaleString('en')} gold`, 'Trade gems for gold', btn(gemTag(x.gems), `swap:${i}`, { disabled: save.gems < x.gems }))).join('');
    if (IAP.native) html += `<li class="shop-note"><button class="linkbtn" type="button" data-act="restore">Restore purchases</button></li>`;
  }
  $('shopList').innerHTML = html;
}
async function onShopAction(e) {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const [act, id] = b.dataset.act.split(':');
  if (act === 'booster') { if (spend('gold', BOOSTERS[id].price)) { give({ booster: id }); ding(); toastMsg(`${BOOSTERS[id].name} +1`); } }
  else if (act === 'upgrade') { const lvl = save.upgrades[id] || 0; if (spend('gold', upgradeCost(lvl))) { save.upgrades[id] = lvl + 1; persist(); ding(); toastMsg(`${UPGRADES[id].name} level ${lvl + 1}`); } }
  else if (act === 'skin') {
    const h = HEROES.find((x) => x.id === id), st = unlockState(h, prog.level, huntsCompleted());
    if (st.ok || unlock(h, prog.level, huntsCompleted())) {
      if (!st.ok) { ding(); toastMsg(`${h.name} · ${h.outfit} unlocked!`); }
      save.skin = id; persist(); H.onSkin(id);
    }
  } else if (act === 'trail') {
    const t = TRAILS.find((x) => x.id === id), st = unlockState(t, prog.level, huntsCompleted());
    if (st.ok || unlock(t, prog.level, huntsCompleted())) { if (!st.ok) { ding(); toastMsg(`${t.name} trail unlocked!`); } save.trail = id; persist(); }
  } else if (act === 'offer') { openOffer(id); return; }
  else if (act === 'chest') { if (spend('gems', CHEST_PRICE)) { give({ chest: 1 }); ding(); openChests(); return; } } else if (act === 'free') {
    b.disabled = true;
    const ok = await Ads.showRewarded('free_' + id);
    if (ok && claimFree(id)) { markRewarded(); ding(); toastMsg(id === 'gold' ? `+${FREE.gold.amount} gold` : `+${FREE.gem.amount} gem`); }
    else if (!ok) toastMsg('Ad not finished.');
  } else if (act === 'iap') {
    b.disabled = true; const err = await IAP.buy(id); b.disabled = false; if (err) toastMsg(err);
  } else if (act === 'swap') {
    const x = EXCHANGE[+id]; if (spend('gems', x.gems)) { give({ gold: x.gold }); ding(); toastMsg(`+${x.gold.toLocaleString('en')} gold`); }
  } else if (act === 'restore') { const err = await IAP.restore(); toastMsg(err || 'Purchases restored.'); }
  else return;
  click(); renderShop(); H.onChange();
}

// ---------------------------------------------------------------- daily reward
export const dailyReady = () => dailyStatus().claimable;
function rewardLabel(r) {
  const parts = [];
  if (r.gold) parts.push(`${ICONS.coin}<b>${r.gold}</b>`);
  if (r.gems) parts.push(`${ICONS.gem}<b>${r.gems}</b>`);
  if (r.booster) parts.push(`${ICONS[r.booster]}`);
  if (r.chest) parts.push(ICONS.chest);
  return parts.join('');
}
export function openDaily() {
  const st = dailyStatus();
  $('dailyGrid').innerHTML = DAILY.map((r, i) => {
    const cls = i < st.day || (!st.claimable && i === st.day) ? 'done' : i === st.day && st.claimable ? 'today' : '';
    return `<li class="${cls}"><small>Day ${i + 1}</small><span>${rewardLabel(r)}</span></li>`;
  }).join('');
  $('dailyClaim').hidden = !st.claimable;
  $('dailyDouble').hidden = !st.claimable || !Ads.rewardedAvailable();
  $('dailyNote').textContent = st.claimable ? 'Come back every day — miss one and the calendar starts over.' : 'Claimed! Your next reward unlocks tomorrow.';
  open($('daily'));
}
function claim(mult) {
  const r = claimDaily(mult); if (!r) return;
  ding(); toastMsg(mult > 1 ? 'Doubled!' : 'Reward collected');
  openDaily(); H.onChange();
}

// ---------------------------------------------------------------- settings
export function openSettings() { renderSettings(); open($('settings')); }
function renderSettings() {
  const items = [
    `<li><span>Sound</span><button class="toggle" type="button" data-act="sound" aria-pressed="${save.sound}">${save.sound ? 'On' : 'Off'}</button></li>`,
    `<li><span>Graphics<small class="set-note">${save.quality === 'auto' ? `Auto picks for your phone${save.autoQ ? ` (now ${save.autoQ})` : ''}` : save.quality === 'high' ? 'Real-time shadows, sharper image' : 'Smoother on older phones'}</small></span><button class="toggle" type="button" data-act="quality" aria-pressed="${save.quality !== 'low'}">${{ auto: 'Auto', high: 'High', low: 'Low' }[save.quality]}</button></li>`,
  ];
  if (Ads.privacyOptionsRequired) items.push(`<li><span>Ad privacy choices</span><button class="sbtn ghost" type="button" data-act="privacyOptions">Open</button></li>`);
  if (IAP.native) items.push(`<li><span>Purchases</span><button class="sbtn ghost" type="button" data-act="restore">Restore</button></li>`);
  items.push(`<li><span>Privacy policy</span><button class="sbtn ghost" type="button" data-act="doc:privacy.html">Read</button></li>`);
  items.push(`<li><span>Credits</span><button class="sbtn ghost" type="button" data-act="doc:CREDITS.txt">Read</button></li>`);
  items.push(`<li class="ver"><span>Relic Rush ${CONFIG.versionName} · Akinware</span></li>`);
  $('settingsList').innerHTML = items.join('');
}
async function onSettingsAction(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'sound') { H.onSound(!save.sound); renderSettings(); click(); }
  else if (act === 'quality') { save.quality = { auto: 'high', high: 'low', low: 'auto' }[save.quality] || 'auto'; persist(); H.onQuality(); renderSettings(); click(); }
  else if (act === 'privacyOptions') await Ads.showPrivacyOptions();
  else if (act === 'restore') { const err = await IAP.restore(); toastMsg(err || 'Purchases restored.'); }
  else if (act.startsWith('doc:')) { $('docFrame').src = act.slice(4); open($('doc')); }
}

// ---------------------------------------------------------------- missions + level
export function renderMissionList(el, { compact = false } = {}) {
  el.innerHTML = prog.missions.map((m, i) => {
    const prg = Progress.displayProgress(m), pct = Math.min(100, (prg / m.target) * 100);
    const skip = compact || m.done ? '' : `<button class="skipbtn" type="button" data-act="skip:${i}">Skip ${ICONS.gem}3</button>`;
    return `<li class="mission${m.done ? ' done' : ''}"><span class="tick">✓</span><span class="mt">${missionText(m)}</span>
      <span class="mv"><span>${Math.floor(prg).toLocaleString('en')}/${m.target.toLocaleString('en')}</span>${skip}</span><span class="bar"><i style="width:${pct}%"></i></span></li>`;
  }).join('');
}
export function openMissions() { renderMissions(); open($('missions')); }
function renderMissions() {
  const ready = levelReady();
  $('levelCard').innerHTML = `<span class="lv">${prog.level}</span><b>Level ${prog.level} · ×${multiplier()} score</b>
    <small>${ready ? 'All three done!' : 'Finish all three missions to level up. Each level raises your score multiplier and gives a relic chest.'}</small>
    ${ready ? `<button class="btn primary" type="button" data-act="levelup" style="grid-column:1/-1;font-size:20px;padding:10px">Level up!</button>` : ''}`;
  renderMissionList($('missionList'));
  const h = huntState();
  $('huntCard').innerHTML = `<b>Daily Relic Hunt</b><div class="letters">${h.word.split('').map((c, i) => `<i class="${i < h.got.length ? 'got' : ''}">${c}</i>`).join('')}</div>
    <small>${h.got.length >= 5 ? 'Done for today. New letters tomorrow.' : 'One glowing letter hides on the road each run. Spell RELIC today for 3 gems and a relic chest.'}
    Hunts completed: ${h.total || 0}.</small>`;
}
async function onMissionAction(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const [act, i] = b.dataset.act.split(':');
  if (act === 'skip') {
    if (!spend('gems', 3)) { openShop('gems'); return; }
    Progress.skip(+i); ding(); toastMsg('Mission skipped');
  } else if (act === 'levelup') {
    const r = Progress.levelUp(); if (r) { ding(); toastMsg(`Level ${r.level}! Score ×${multiplier()} · +1 chest`); }
  }
  renderMissions(); H.onChange();
}

// ---------------------------------------------------------------- relic chests
const fmtLeft = (ms) => { const m = Math.ceil(ms / 60e3); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
export function openChests() { $('chestArt').className = 'chest'; $('chestReward').hidden = true; renderChests(); open($('chests')); }
function renderChests() {
  $('chestCount').textContent = save.chests === 1 ? '1 chest to open' : `${save.chests} chests to open`;
  const freeIn = freeChestIn(), adOk = Ads.rewardedAvailable();
  let html = '';
  if (save.chests > 0) html += `<button class="btn primary" type="button" data-act="open">Open chest</button>`;
  if (Ads.enabled) html += freeIn > 0 ? `<button class="btn" type="button" disabled>Free chest in ${fmtLeft(freeIn)}</button>`
    : `<button class="btn ad" type="button" data-act="free"${adOk ? '' : ' disabled'}>${ICONS.ad}Free chest</button>`;
  html += `<button class="btn gemsbtn" type="button" data-act="buy"${save.gems < CHEST_PRICE ? ' disabled' : ''}>Buy a chest · ${ICONS.gem}${CHEST_PRICE}</button>`;
  $('chestActions').innerHTML = html;
  $('chestOdds').textContent = 'Odds: ' + CHEST_ODDS.map((o) => `${o.label} ${o.weight}%`).join(' · ');
}
function rewardHtml(r) {
  if (r.gold) return `${ICONS.coin.replace(' sm', '')} ${r.gold.toLocaleString('en')} gold`;
  if (r.gems) return `${ICONS.gem} ${r.gems} gems`;
  if (r.booster) return `${ICONS[r.booster]} ${BOOSTERS[r.booster].name}`;
  return '';
}
async function onChestAction(e) {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const act = b.dataset.act;
  if (act === 'open') {
    const art = $('chestArt'); $('chestReward').hidden = true;
    art.className = 'chest'; void art.offsetWidth; art.classList.add('shake');
    b.disabled = true;
    setTimeout(() => {
      const r = openChest(); if (!r) return;
      art.classList.add('open'); ding();
      $('chestReward').innerHTML = `<small>You got</small><b>${rewardHtml(r)}</b>`; $('chestReward').hidden = false;
      renderChests(); H.onChange();
    }, 520);
    return;
  }
  if (act === 'free') {
    b.disabled = true;
    const ok = await Ads.showRewarded('free_chest');
    if (ok && claimFreeChest()) { markRewarded(); ding(); toastMsg('+1 relic chest'); } else if (!ok) toastMsg('Ad not finished.');
  } else if (act === 'buy') { if (spend('gems', CHEST_PRICE)) { give({ chest: 1 }); ding(); } }
  $('chestArt').className = 'chest'; $('chestReward').hidden = true;
  renderChests(); H.onChange();
}

// ---------------------------------------------------------------- offers (starter pack with a timer, legend pack)
let offerId = 'starter_pack';
export function openOffer(id = 'starter_pack') { offerId = id; renderOffer(); open($('offer')); if (id === 'starter_pack') offerSeen(); }
function renderOffer() {
  const P = CONFIG.products[offerId];
  const items = offerId === 'legend_pack'
    ? [[ICONS.crown, 'Sir Aldric, Temple Knight (Valor: +15% score)'], [ICONS.crown, 'Golden Pharaoh explorer (Royal Purse: +15% gold)'], [`<span style="display:block;width:22px;height:22px;border-radius:50%;background:linear-gradient(90deg,#ff5a5a,#ffd84a,#5ae07a,#5ac8ff,#b06aff)"></span>`, 'Prism trail'], [ICONS.gem, `${P.gems} gems`], [ICONS.chest, `${P.chests} relic chests`]]
    : [[ICONS.noads, 'No more ads between runs'], [ICONS.gem, `${P.gems} gems`], [ICONS.coin, `${P.gold.toLocaleString('en')} gold`], [ICONS.chest, `${P.chests} relic chests`]];
  const off = offerState();
  const timer = offerId === 'starter_pack' && off.active ? `<p class="offer-timer">Ends in ${fmtLeft(off.left)}</p>` : '';
  const owned = save.tx.includes('owned:' + offerId);
  const buy = owned ? `<button class="btn" type="button" disabled>Owned</button>`
    : IAP.native ? `<button class="btn primary" type="button" data-act="buy">${IAP.price(offerId)}</button>` : `<button class="btn" type="button" disabled>Available in the Android app</button>`;
  $('offerTitle').textContent = offerId === 'legend_pack' ? 'Legend Pack' : 'Starter Pack';
  $('offerBody').innerHTML = `<div class="offer-hero"><b>${offerId === 'legend_pack' ? 'Become a legend' : 'Best value for new explorers'}</b>
    <ul>${items.map(([i, t]) => `<li>${i}<span>${t}</span></li>`).join('')}</ul>${timer}</div>${buy}`;
}
async function onOfferAction(e) {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  b.disabled = true; const err = await IAP.buy(offerId); b.disabled = false; if (err) toastMsg(err);
  renderOffer(); H.onChange();
}
