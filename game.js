// Relic Rush — an endless runner by Akinware. Built on Three.js (MIT).
// 3D models: Quaternius, KayKit & Kenney (CC0 1.0). The tiger is built with procedural-animals (MIT); its voice is
// from 0 A.D. by Wildfire Games (CC BY-SA 3.0). See CREDITS.txt.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createScenery } from './scenery.js';
import { createProps } from './props.js';
import { Animal } from './vendor/procedural-animals/src/animal.js';
import { readBake } from './vendor/procedural-animals/src/bake.js';
import tigerSpecies from './tiger/species.js';
import { HEROES, TRAILS, PERKS, BOOSTERS, HEADSTART_DIST, save, persist, give, spend, reviveCost, magnetTime, powerupChance, gemChance,
  dashDistance, goldMultiplier, scoreBonus, perk, setRunPerk, unlockState, unlock, heroById, offerState, offerSeen,
  markRewarded, newRunForAds, interstitialDue, interstitialShown, grantProduct } from './economy.js';
import { prog, Progress, multiplier, missionText, levelReady, onMissionDone, huntState, nextHuntLetter, collectHuntLetter,
  huntDoneToday, huntsCompleted } from './progress.js';
import { createLook, zoneOf, ZONES, ZONE_LEN } from './look.js';
import { Ads } from './ads.js';
import { IAP } from './iap.js';
import { initShop, openShop, renderWallet, openDaily, openSettings, openMissions, openChests, openOffer, closeOverlays, overlayOpen,
  toastMsg, dailyReady, renderMissionList, ICONS } from './shop.js';

// ---------------------------------------------------------------- params & helpers
const params = new URLSearchParams(location.search);
const AUTOPILOT = params.has('autopilot');
const AUTOSTART = params.has('autostart');
const SEED = params.get('seed');
const ASSET_BASE = window.RELIC_ASSET_BASE || './';
const ASSET_EXT = window.RELIC_ASSET_EXT || '.glb';

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let rand = Math.random;
const rr = (a, b) => a + rand() * (b - a);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (k, dt) => 1 - Math.exp(-k * dt);

// ---------------------------------------------------------------- tuning
const LANE = 2.2, PATH_W = 7.2, HALF = PATH_W / 2, J = PATH_W;
const START_SPEED = 16.5, MAX_SPEED = 27;
const GRAVITY = -32, JUMP_V = 10.8, SLIDE_TIME = 0.75, AIRTIME = 2 * JUMP_V / -GRAVITY;
const H_RUN = 1.75, H_SLIDE = 0.8;
const TURN_EXEC = -1.2;              // a queued turn fires this far before the junction centre
const PW = 0.36, PD = 0.34;          // player half width / half depth for collisions
const STUMBLE_TIME = 0.55, CHASE_TIME = 7;
const BOOST_SPEED = 62;              // head start dash speed (m/s)
const REVIVE_WINDOW = 6;             // seconds to decide on a revive
const CANOPY_Y = -12;
const HERO_H = 2.05;                 // a touch taller than the hitbox so the runner reads on the wide path

// Difficulty only ever goes up: fast at first, then ever slower but without end (no breather between laps).
// The four zones still cycle every 3.6 km (a "lap") for the look and the music.
//   500 m: 0.20 · 1 km: 0.37 · 2 km: 0.65 · 3.6 km: 1.0 (top base speed) · 7.2 km: 1.42 · 10.8 km: 1.6 · -> 1.75
const LAP_LEN = 4 * 900;
function difficulty(dist) { return 1.75 * (1 - Math.exp(-Math.max(0, dist) / 4200)); }
const lapOf = (dist) => Math.floor(Math.max(0, dist) / LAP_LEN);
// top speed is reached at difficulty 1; later laps can push a little past it
const speedAt = (dist) => { const t = difficulty(dist); return t <= 1 ? lerp(START_SPEED, MAX_SPEED, t) : MAX_SPEED + (t - 1) * 18; };
const turnLead = (speed) => Math.max(12, speed * 1.0);       // a correct press a full second early still counts
const turnLate = (speed) => J / 2 + 0.12 * speed + 0.4;      // ...and a beat after the corner edge

const haptic = (pat) => { try { navigator.vibrate && navigator.vibrate(pat); } catch { /* not supported */ } };

// ---------------------------------------------------------------- renderer & scene
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.type = THREE.PCFShadowMap;
// Graphics quality: 'high' = real-time shadows + full resolution, 'low' = blob shadow + 1× pixels. 'auto' measures the first run.
let hiQ = save.quality !== 'low';
function applyQuality() {
  hiQ = save.quality === 'high' || (save.quality === 'auto' && save.autoQ !== 'low');
  renderer.setPixelRatio(hiQ ? Math.min(window.devicePixelRatio || 1, 1.75) : 1);
  renderer.shadowMap.enabled = hiQ;
  if (typeof sun !== 'undefined') sun.castShadow = hiQ;
  scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
  if (typeof resize === 'function') resize();
  try { applyTigerQuality(); } catch { /* the tiger isn't set up yet */ }
}

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe9c99a, 36, 150);
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 900);
const hemi = new THREE.HemisphereLight(0xffe6c4, 0x3a5a30, 1.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe2b8, 2.1);
sun.position.set(-30, 50, 18);
const SUN_OFF = new THREE.Vector3(-30, 50, 18).normalize().multiplyScalar(40);
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 10, far: 80 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
scene.add(sun); scene.add(sun.target);
const look = createLook(scene, { hemi, sun });

// ---------------------------------------------------------------- textures, materials, geometry
const radial = (stops) => canvasTex(64, 64, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  stops.forEach(([o, c]) => r.addColorStop(o, c)); g.fillStyle = r; g.fillRect(0, 0, w, w);
});
const glowTex = radial([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,220,150,.55)'], [1, 'rgba(255,180,80,0)']]);
const shadowTex = radial([[0, 'rgba(0,0,0,.6)'], [0.6, 'rgba(0,0,0,.28)'], [1, 'rgba(0,0,0,0)']]);
const stoneTex = canvasTex(256, 256, (g) => {
  g.fillStyle = '#7a5c3c'; g.fillRect(0, 0, 256, 256);
  const rows = 4, cols = 3, tw = 256 / cols, th = 256 / rows;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * tw / 2;
    for (let i = -1; i <= cols; i++) {
      const x = i * tw + off, y = r * th;
      g.fillStyle = `hsl(${32 + Math.random() * 8},${34 + Math.random() * 12}%,${60 + Math.random() * 9}%)`; g.fillRect(x + 3, y + 3, tw - 6, th - 6);
      g.fillStyle = 'rgba(255,240,210,.18)'; g.fillRect(x + 3, y + 3, tw - 6, 3);
      g.fillStyle = 'rgba(60,40,20,.18)'; g.fillRect(x + 3, y + th - 6, tw - 6, 3);
      for (let k = 0; k < 16; k++) { g.fillStyle = `rgba(80,55,30,${Math.random() * 0.16})`; g.fillRect(x + 4 + Math.random() * (tw - 10), y + 4 + Math.random() * (th - 10), 2 + Math.random() * 5, 2 + Math.random() * 3); }
      if (Math.random() < 0.22) { g.fillStyle = 'rgba(96,128,50,.38)'; g.beginPath(); g.arc(x + 6 + Math.random() * (tw - 12), y + 6 + Math.random() * (th - 12), 5 + Math.random() * 10, 0, Math.PI * 2); g.fill(); }
    }
  }
});
stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping;
stoneTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
// carved temple blocks for the walls under the road (moss along the top, darker towards the depths)
const wallTex = canvasTex(256, 256, (g) => {
  g.fillStyle = '#5d4630'; g.fillRect(0, 0, 256, 256);
  const rows = 5, th = 256 / rows;
  for (let r = 0; r < rows; r++) {
    const bw = 256 / (r % 2 ? 2 : 3), off = (r * 53) % bw;
    for (let x = -off; x < 256; x += bw) {
      const l = 44 + Math.random() * 10;
      g.fillStyle = `hsl(${30 + Math.random() * 8},${26 + Math.random() * 10}%,${l}%)`; g.fillRect(x + 3, r * th + 3, bw - 6, th - 6);
      g.fillStyle = 'rgba(255,235,200,.16)'; g.fillRect(x + 3, r * th + 3, bw - 6, 4);
      g.fillStyle = 'rgba(40,25,10,.22)'; g.fillRect(x + 3, r * th + th - 8, bw - 6, 5);
      for (let k = 0; k < 10; k++) { g.fillStyle = `rgba(60,40,20,${Math.random() * 0.2})`; g.fillRect(x + 6 + Math.random() * (bw - 14), r * th + 6 + Math.random() * (th - 14), 2 + Math.random() * 6, 2 + Math.random() * 3); }
      if (Math.random() < 0.18) { g.strokeStyle = 'rgba(40,25,12,.45)'; g.lineWidth = 1.5; g.beginPath(); let cx = x + bw * Math.random(), cy = r * th + 4; g.moveTo(cx, cy); for (let q = 0; q < 4; q++) { cx += (Math.random() - 0.5) * 14; cy += th / 5; g.lineTo(cx, cy); } g.stroke(); }
    }
  }
  const moss = g.createLinearGradient(0, 0, 0, 40); moss.addColorStop(0, 'rgba(84,122,48,.75)'); moss.addColorStop(1, 'rgba(84,122,48,0)');
  g.fillStyle = moss; g.fillRect(0, 0, 256, 40);
});
wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
wallTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
const fadeTex = canvasTex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#1a120c'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
const letterTex = {};
function letterTexture(ch) {
  if (letterTex[ch]) return letterTex[ch];
  letterTex[ch] = canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 58, 6, 64, 64, 60); gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.6, '#ffc93c'); gr.addColorStop(1, '#c97a10');
    g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.fill();
    g.lineWidth = 7; g.strokeStyle = '#7a4300'; g.stroke();
    g.fillStyle = '#5a2d00'; g.font = 'bold 78px "Lilita One", Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 64, 70);
  });
  return letterTex[ch];
}
const arrowTex = canvasTex(128, 128, (g) => {
  g.translate(64, 64); g.lineJoin = 'round'; g.lineCap = 'round';
  for (const [off, a] of [[18, 0.95], [-14, 0.55]]) {
    g.strokeStyle = `rgba(255,214,90,${a})`; g.lineWidth = 16;
    g.beginPath(); g.moveTo(-34, off + 18); g.lineTo(0, off - 16); g.lineTo(34, off + 18); g.stroke();
  }
});

const M = {
  path: new THREE.MeshLambertMaterial({ map: stoneTex }),
  wall: new THREE.MeshLambertMaterial({ map: wallTex }),
  wallFade: new THREE.MeshLambertMaterial({ map: fadeTex, color: 0x6b5238 }),
  fireStone: new THREE.MeshLambertMaterial({ color: 0x4a3a2c }),
  ember: new THREE.MeshBasicMaterial({ color: 0xc8320c }),
  flameCore: new THREE.MeshBasicMaterial({ color: 0xffe27a }),
  idol: new THREE.MeshStandardMaterial({ color: 0x3fe0b0, metalness: 0.3, roughness: 0.35, emissive: 0x0d6b50, emissiveIntensity: 0.8 }),
  trim: new THREE.MeshLambertMaterial({ color: 0x8a6a46 }),
  wood: new THREE.MeshLambertMaterial({ color: 0x6b4a2f }),
  rail: new THREE.MeshStandardMaterial({ color: 0x8d9299, metalness: 0.85, roughness: 0.38 }),
  cartIron: new THREE.MeshStandardMaterial({ color: 0x4a4d52, metalness: 0.7, roughness: 0.5 }),
  canopy: new THREE.MeshLambertMaterial({ color: 0x3f6d34 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xffc23a, metalness: 0.75, roughness: 0.28, emissive: 0x7a4c00, emissiveIntensity: 0.55 }),
  coinRed: new THREE.MeshStandardMaterial({ color: 0xff5a42, metalness: 0.7, roughness: 0.3, emissive: 0x7a1000, emissiveIntensity: 0.6 }),
  coinBlue: new THREE.MeshStandardMaterial({ color: 0x5cc4ff, metalness: 0.7, roughness: 0.3, emissive: 0x00407a, emissiveIntensity: 0.65 }),
  flame: new THREE.MeshBasicMaterial({ color: 0xffa23a }),
  glow: new THREE.SpriteMaterial({ map: glowTex, color: 0xffb35c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  gemGlow: new THREE.SpriteMaterial({ map: glowTex, color: 0x5ad0ff, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }),
  sparkle: new THREE.SpriteMaterial({ map: glowTex, color: 0xffe08a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  shadow: new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
  bubble: new THREE.MeshBasicMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0.22, depthWrite: false }),
  arrow: new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  magnetRed: new THREE.MeshLambertMaterial({ color: 0xd63a2f }),
  magnetTip: new THREE.MeshStandardMaterial({ color: 0xdfe6ea, metalness: 0.8, roughness: 0.3 }),
};
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  coin: new THREE.CylinderGeometry(0.42, 0.42, 0.1, 20).rotateX(Math.PI / 2),
  flame: new THREE.ConeGeometry(0.2, 0.6, 7).translate(0, 0.3, 0),
  post: new THREE.CylinderGeometry(0.09, 0.13, 1.8, 6).translate(0, 0.9, 0),
  bowl: new THREE.CylinderGeometry(0.32, 0.16, 0.26, 8),
  shadow: new THREE.PlaneGeometry(1.5, 1.2).rotateX(-Math.PI / 2),
  bubble: new THREE.SphereGeometry(1.2, 18, 12),
  arrow: new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2),
  magnetArc: new THREE.TorusGeometry(0.42, 0.15, 10, 20, Math.PI),
  magnetTip: new THREE.CylinderGeometry(0.15, 0.15, 0.22, 10),
  flameBig: new THREE.ConeGeometry(0.24, 0.9, 7).translate(0, 0.45, 0),
  flameCore: new THREE.ConeGeometry(0.13, 0.55, 6).translate(0, 0.28, 0),
  idolHead: new THREE.OctahedronGeometry(0.42, 0),
  idolBase: new THREE.CylinderGeometry(0.22, 0.3, 0.32, 8),
};
// the road, walls, cliffs and plants: PBR textures (tools/gen-textures.py) and shared geometry (scenery.js)
const SC = createScenery({ renderer, loadBinary, canopy: M.canopy });
M.mineFloor = SC.M.mineFloor;
// obstacles, torches and pickups (props.js): stone gates, idol heads, totems, logs, fire troughs, coins, gems...
const PR = createProps({ renderer, SC });
Object.assign(M, { gold: PR.M.gold, coinRed: PR.M.coinRed, coinBlue: PR.M.coinBlue });
G.coin = PR.G.coin;
const LOG_MATS = [PR.M.bark, PR.M.rings];
M.path = SC.M.path; M.path.map = stoneTex;
M.wall = SC.M.wall; M.wall.map = wallTex;
// a block whose texture keeps its scale (4 m per tile) whatever its size
function wallGeometry(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / 4, uv.getY(k) * dims[f][1] / 4); }
  return g;
}

// ---------------------------------------------------------------- model library (instanced placement)
const loader = new GLTFLoader();
// Sandboxed previews may block fetch() of blob: URLs; decode embedded textures through <img> instead.
if (window.RELIC_ASSET_EXT) loader.register((parser) => { parser.textureLoader = new THREE.TextureLoader(parser.options.manager); return { name: 'relic_img_textures' }; });
const LIB = {};
const MODEL_NAMES = [];   // every prop is procedural now (props.js / scenery.js); the .glb loader stays for the heroes
const RECOLOR = { leafsGreen: 0x4f8f3a, grass: 0x62a043, woodBark: 0x6f4b30, woodInner: 0xd2a66d, stone: 0xd6be92, stoneDark: 0xab8f66, dirt: 0x7b5b3c, _defaultMat: 0x8f7d62 };
const WARM_TINT = new Set(['column-large', 'pillar-large', 'pillar-obelisk', 'rocks-tall', 'debris', 'urn-round', 'urn-square']);
const matCache = new Map();
function convertMaterial(m, modelName) {
  const key = m.uuid + (WARM_TINT.has(modelName) ? ':w' : '');
  if (matCache.has(key)) return matCache.get(key);
  const out = new THREE.MeshLambertMaterial({ map: m.map || null, color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
    transparent: !!m.transparent, opacity: m.opacity ?? 1, alphaTest: m.alphaTest || 0, side: m.side });
  if (m.map) { m.map.colorSpace = THREE.SRGBColorSpace; out.color.setHex(WARM_TINT.has(modelName) ? 0xf7d7a6 : 0xffffff); }
  else if (RECOLOR[m.name] !== undefined) out.color.setHex(RECOLOR[m.name]);
  matCache.set(key, out);
  return out;
}
function extract(name, gltf) {
  const root = gltf.scene; root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const parts = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mat = Array.isArray(o.material) ? o.material.map((m) => convertMaterial(m, name)) : convertMaterial(o.material, name);
    parts.push({ geometry: o.geometry, material: mat, matrix: o.matrixWorld.clone() });
  });
  return { parts, box, h: box.max.y - box.min.y };
}
function cloneModel(name) {
  const lib = LIB[name]; const g = new THREE.Group();
  if (lib) for (const p of lib.parts) { const m = new THREE.Mesh(p.geometry, p.material); m.applyMatrix4(p.matrix); g.add(m); }
  return g;
}
function makeIdol() { return PR.makeIdol(); }   // Idol Dash pickup: a jade idol on a gold stand
let x2Face = null;
function makeX2() {     // 2× gold pickup: a big coin with a 2× face
  x2Face ||= new THREE.MeshBasicMaterial({ transparent: true, map: canvasTex(128, 128, (c) => { c.fillStyle = '#6a3a00'; c.font = 'bold 66px "Lilita One", Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('2×', 64, 70); }) });
  return PR.makeX2(x2Face);
}
function makeMagnet() { return PR.makeMagnet(); }

// Models load as .glb; hosts that can't serve .glb can ship them base64-encoded as .txt (RELIC_ASSET_EXT = '.b64.txt').
async function loadModel(name) {
  const url = ASSET_BASE + name + ASSET_EXT;
  if (!ASSET_EXT.endsWith('.txt')) return loader.loadAsync(url);
  const res = await fetch(url); if (!res.ok) throw new Error(url + ' ' + res.status);
  const bin = atob((await res.text()).trim()); const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return loader.parseAsync(buf.buffer, '');
}
// Other binary assets (baked tiger, sounds) follow the same rule.
async function loadBinary(file) {
  const b64 = ASSET_EXT.endsWith('.txt');
  const res = await fetch(ASSET_BASE + file + (b64 ? '.b64.txt' : '')); if (!res.ok) throw new Error(file + ' ' + res.status);
  if (!b64) return res.arrayBuffer();
  const bin = atob((await res.text()).trim()); const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
async function loadLibrary(onProgress) {
  let done = 0; const total = MODEL_NAMES.length + 1;
  const tick = () => onProgress && onProgress(++done / total);
  await Promise.all([
    ...MODEL_NAMES.map((n) => loadModel(n).then((g) => { LIB[n] = extract(n, g); }).catch((e) => console.warn('model', n, e)).finally(tick)),
    SC.load().then(() => PR.link()).catch((e) => console.warn('surfaces', e)).finally(tick),
  ]);
}

// ---------------------------------------------------------------- hero (animated character)
const heroRoot = new THREE.Group(); heroRoot.rotation.order = 'YXZ'; scene.add(heroRoot);
const heroRig = new THREE.Group(); heroRoot.add(heroRig);
const blob = new THREE.Mesh(G.shadow, M.shadow); blob.renderOrder = 1; scene.add(blob);
const bubble = new THREE.Mesh(G.bubble, M.bubble); bubble.visible = false; bubble.position.y = 1.0; heroRoot.add(bubble);
let hero = null; const heroCache = {};

// Some retargeted one-shot clips end on an extra, half-length keyframe that jumps back to the first pose
// (a loop seam from resampling). Played once and clamped, that last key snaps the arms; drop it.
function trimWrapKey(clip) {
  let cut = false;
  for (const t of clip.tracks) {
    const T = t.times, n = T.length; if (n < 4) continue;
    const gl = T[n - 1] - T[n - 2], gp = T[n - 2] - T[n - 3]; if (!(gl < gp * 0.7)) continue;
    const s = t.getValueSize(), v = t.values; let d = 0;
    for (let i = 0; i < s; i++) d += Math.abs(v[(n - 1) * s + i] - v[(n - 2) * s + i]);
    if (d < 0.05) continue;
    t.times = T.slice(0, n - 1); t.values = v.slice(0, (n - 1) * s); cut = true;
  }
  if (cut) {
    const end = Math.max(...clip.tracks.map((t) => t.times[t.times.length - 1]));
    for (const t of clip.tracks) t.trim(0, end);
    clip.duration = end;
  }
  return clip;
}
// Keep the runner in place: hips may bob up and down but never drift forward or sideways.
function pinRoot(clip) {
  for (const t of clip.tracks) {
    if (!/^(Body|root|hips)\.position$/.test(t.name)) continue;   // root/hips only: limbs keep their own motion
    const v = t.values; const x0 = v[0], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
  }
  return clip;
}
// KayKit heroes carry every weapon of their class; each keeps only its signature kit while running.
const KIT = {
  knight: ['1H_Sword', 'Round_Shield'], barbarian: ['1H_Axe', 'Barbarian_Round_Shield'], mage: ['1H_Wand'],
  rogue: ['Knife', 'Knife_Offhand'], 'rogue-hooded': ['Knife', 'Knife_Offhand'],
};
const PROP = /^(1H_|2H_|Badge_|Rectangle_|Round_|Spike_|Barbarian_Round|Mug|Spellbook|Knife|Throwable)/;
// Heroes: PBR materials lit by a soft studio environment, plus a warm rim light so the runner stands out
// against the ruins.
let heroEnv = null;
function heroMaterial(o) {
  if (!heroEnv) { const pm = new THREE.PMREMGenerator(renderer); heroEnv = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); }
  const m = new THREE.MeshStandardMaterial({ ...o, envMap: heroEnv, envMapIntensity: 0.3 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = heroRim;
    sh.fragmentShader = 'uniform vec3 uRim;\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
      'float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);\n  outgoingLight += uRim * rimF;\n  #include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'hero-rim';
  return m;
}
const heroRim = { value: new THREE.Color(0xffc98a).multiplyScalar(0.22) };
async function loadHero(id) {
  if (!heroCache[id]) {
    heroCache[id] = loadModel(id).then((g) => {
      const model = g.scene;
      const kit = KIT[id];
      if (kit) model.traverse((o) => { if (PROP.test(o.name) && !(o.parent && PROP.test(o.parent.name))) o.visible = kit.includes(o.name); });
      model.traverse((o) => { if (o.name === 'Sword') o.visible = false; });   // Wren's sword is a group of meshes
      model.traverse((o) => {
        if (!o.isMesh) return;
        if (o.name === 'Sword') { o.visible = false; return; }
        o.frustumCulled = false; o.castShadow = true;
        const conv = (m) => {
          const c = m.color.clone().multiplyScalar(m.map ? 0.9 : /Skin/i.test(m.name || '') ? 0.92 : 1.08);
          const metal = /Metal|Gold|Silver|Steel/i.test(m.name || '');
          const out = heroMaterial({ color: c, map: m.map || null, roughness: metal ? 0.38 : 0.72, metalness: metal ? 0.55 : 0.0 });
          out.userData = { base: c.clone(), part: m.name || '' }; return out;
        };
        o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
      });
      // Measure the visible body only, with skinning applied (hidden props like the sword would skew the scale).
      model.updateMatrixWorld(true);
      const box = new THREE.Box3();
      const shown = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
      model.traverse((o) => { if (o.isMesh && shown(o)) { if (o.isSkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); } else box.expandByObject(o, true); } });
      const s = HERO_H / (box.max.y - box.min.y);
      model.scale.setScalar(s);
      model.position.set(-(box.min.x + box.max.x) / 2 * s, -box.min.y * s, -(box.min.z + box.max.z) / 2 * s);
      const pivot = new THREE.Group(); pivot.add(model); pivot.rotation.y = Math.PI; // the pack faces +z; the runner faces -z
      const names = new Set(); model.traverse((o) => names.add(o.name));
      const mixer = new THREE.AnimationMixer(model);
      const find = (n) => g.animations.find((a) => a.name === n || a.name.endsWith('|' + n));
      const actions = {}, dur = {};
      // KayKit heroes keep their own clips; the Quaternius heroes carry clips retargeted from Quaternius'
      // Universal Animation Library (sprint, jump start / loop / land, roll, death, hit, idle, dance)
      const kk = !!find('Running_A');
      const MAP = kk ? [['idle', 'Idle'], ['run', 'Running_A'], ['roll', 'UAL_Roll'], ['death', 'Death_A'], ['hit', 'Hit_A'],
        ['jumpStart', 'Jump_Start'], ['jumpLoop', 'Jump_Idle'], ['jumpLand', 'Jump_Land'], ['cheer', 'Cheer']]
        : [['idle', 'idle'], ['run', 'run'], ['roll', 'roll'], ['death', 'death'], ['hit', 'hit'],
          ['jumpStart', 'jumpStart'], ['jumpLoop', 'jumpLoop'], ['jumpLand', 'jumpLand'], ['cheer', 'cheer']];
      const ONE_SHOT = new Set(['death', 'roll', 'hit', 'jumpStart', 'jumpLand', 'cheer']);
      for (const [k, n] of MAP) {
        const c = find(n); if (!c) continue;
        const clip = pinRoot(c.clone()); if (ONE_SHOT.has(k)) trimWrapKey(clip);
        actions[k] = mixer.clipAction(clip); dur[k] = clip.duration;
      }
      for (const k of ['death', 'roll', 'hit', 'jumpStart', 'jumpLand', ...(kk ? ['cheer'] : [])]) if (actions[k]) { actions[k].setLoop(THREE.LoopOnce, 1); actions[k].clampWhenFinished = true; }
      const mats = []; model.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.push(m)); });
      return { id, pivot, mixer, actions, dur, current: null, mats, kk, dropT: 9, stride: kk ? 7.5 : 6.4, cheerT: 0, landT: 0, wasAir: false, leanZ: 0, yawLean: 0, lastX: 0 };
    });
  }
  return heroCache[id];
}
// Outfits recolour the clothing; skin, eyes and hair keep their colours.
const KEEP = /^(Skin|Eye|Eyebrows|Hair)/;
const TINTS = {
  ranger: (c, part, hsl) => { if (/Gold|Metal/.test(part)) return; c.setHSL(0.09 + hsl.h * 0.05, 0.42, Math.min(0.5, hsl.l * 1.9 + 0.03)); },
  jade: (c, part, hsl) => { if (/Gold/.test(part)) return; c.setHSL(0.43, 0.55, Math.min(0.45, hsl.l * 1.5 + 0.02)); },
  spirit: (c, part, hsl, m) => { c.setHSL(0.53, 0.6, Math.min(0.55, hsl.l * 2.2 + 0.08)); m.emissive.setHSL(0.52, 0.9, 0.12); },
  shadow: (c, part, hsl, m) => { if (/Gold|Metal/.test(part)) { c.setHSL(0.78, 0.5, 0.35); return; } c.setHSL(0.76, 0.45, Math.max(0.015, hsl.l * 0.55)); m.emissive.setHSL(0.78, 0.8, 0.03); },
  gold: (c, part, hsl, m) => { if (/Blue|DarkBrown/.test(part)) { c.setHSL(0.98, 0.7, 0.18); return; } c.setHSL(0.115, 0.85, Math.min(0.5, 0.18 + hsl.l * 1.3)); m.emissive.setHSL(0.1, 0.9, 0.06); },
};
function applyTint(h, tint) {
  const hsl = {};
  for (const m of h.mats) {
    m.color.copy(m.userData.base); m.emissive.setHex(0x000000);
    if (!tint || KEEP.test(m.userData.part)) continue;
    m.color.getHSL(hsl); TINTS[tint](m.color, m.userData.part, hsl, m);
  }
}
function setHero(h, tint) {
  if (hero) heroRig.remove(hero.pivot);
  hero = h; heroRig.add(h.pivot); applyTint(h, tint);
  hero.current = null; playAnim('idle', 0);
}
function playAnim(name, fade = 0.12, timeScale = 1, startAt = 0, restart = false) {
  if (!hero) return;
  if (!hero.actions[name]) name = name === 'jumpStart' || name === 'jumpLand' ? 'jumpLoop' : name === 'cheer' ? 'idle' : 'run';
  const a = hero.actions[name]; if (!a) return;
  a.timeScale = timeScale;
  if (hero.current === name && !restart) return;
  if (hero.current === name) { a.reset(); a.time = startAt * (hero.dur[name] || 0); a.play(); return; }   // replay a one-shot from the top
  const prev = hero.current ? hero.actions[hero.current] : null;
  a.reset(); a.time = startAt * (hero.dur[name] || 0); a.enabled = true; a.setEffectiveWeight(1); a.play();
  if (prev && prev !== a) prev.crossFadeTo(a, fade, false); else a.fadeIn(fade);
  hero.current = name;
}

// ---------------------------------------------------------------- chaser (tiger)
// A Bengal tiger from procedural-animals (tiger/species.js): a skinned, furred body with IK gaits, baked
// offline into tiger-<quality>.animal. It lives in its own space scaled by TIGER_SCALE (a big male next to
// the runner), follows the runner's trail with follow(), and plays its own charge -> leap -> grab attack.
const TIGER_SCALE = 1.22;
const tigerSpace = new THREE.Group(); tigerSpace.scale.setScalar(TIGER_SCALE); scene.add(tigerSpace);
let tiger = null;
async function loadTiger() {
  const A = new Animal(tigerSpecies, readBake(await loadBinary('tiger-low.animal')), {});
  A.motion.idleVariants = false;            // no lying down, yawning or idle roars between runs
  A.object.visible = false; tigerSpace.add(A.object);
  tiger = { A, pos: new THREE.Vector3(), visible: false, dist: 30, prevDist: 30, heading: 0, mode: 'chase', t: 0, hold: 0,
    growlT: 0, attacking: false, done: false, landed: false, target: new THREE.Vector3(), look: new THREE.Vector3() };
  // the grab: the tiger lands on the runner
  A.on('attackHit', () => {
    if (p.state !== 'pounce' || tiger.landed) return;
    tiger.landed = true; Sound.thud(); Sound.snarl(0.9); shake = 0.6; haptic([90, 40, 60]);
  });
  applyTigerQuality();
}
// 'low' build tier (13k vertices, 8 fur shells); on low graphics the fur shells go too
function applyTigerQuality() { if (tiger) tiger.A.setQuality(hiQ ? 'low' : 'crowd'); }
function showTiger(on) { if (tiger && tiger.visible !== on) { tiger.visible = on; tiger.A.object.visible = on; } }
function syncTigerPos() { tiger.pos.copy(tiger.A.position).multiplyScalar(TIGER_SCALE); tiger.pos.y = 0; }

// ---------------------------------------------------------------- world generation
const canopy = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), M.canopy);
canopy.position.y = CANOPY_Y; scene.add(canopy);

const segMap = new Map();
let lastIdx = -1, genDistance = 0, lastTurns = [];
let huntSpawn = null;   // { seg, ch } — where this run's Relic Hunt letter appears
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const dirOf = (T) => { const a = T * Math.PI / 2; return new THREE.Vector3(Math.round(Math.sin(a)), 0, -Math.round(Math.cos(a))); };

function compose(x, y, z, rotY, sx, sy = sx, sz = sx) {
  tmpQ.setFromAxisAngle(UP, rotY);
  return new THREE.Matrix4().compose(tmpV.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz));
}
function put(seg, name, x, y, z, rotY, sx, sy, sz) { if (LIB[name]) (seg.inst[name] ||= []).push(compose(x, y, z, rotY, sx, sy, sz)); }
function putH(seg, name, x, base, z, rotY, h) { const lib = LIB[name]; if (!lib) return; const s = h / lib.h; put(seg, name, x, base - lib.box.min.y * s, z, rotY, s); }
const CASTERS = new Set(['log', 'tower-square-arch', 'statue_head', 'rocks-tall', 'statue_block', 'statue_obelisk']);
function flushInstances(seg) {
  for (const [name, mats] of Object.entries(seg.inst)) {
    for (const part of LIB[name].parts) {
      const im = new THREE.InstancedMesh(part.geometry, part.material, mats.length);
      for (let i = 0; i < mats.length; i++) im.setMatrixAt(i, tmpM.multiplyMatrices(mats[i], part.matrix));
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
      if (CASTERS.has(name)) im.castShadow = true;
      seg.group.add(im); seg.disposables.push(im);
    }
  }
  seg.inst = {};
}
function box(seg, mat, w, h, d, x, y, z) { const m = new THREE.Mesh(G.box, mat); m.scale.set(w, h, d); m.position.set(x, y, z); seg.group.add(m); return m; }
function pathTop(seg, w, len, x, z, vScale) {
  const geo = new THREE.PlaneGeometry(w, len).rotateX(-Math.PI / 2);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / PATH_W), uv.getY(i) * vScale);
  const m = new THREE.Mesh(geo, M.path); m.position.set(x, 0, z); m.receiveShadow = true; seg.group.add(m); seg.disposables.push(geo);
}
function wallBlock(seg, w, h, d, x, y, z) {
  const geo = wallGeometry(w, h, d); const m = new THREE.Mesh(geo, M.wall); m.position.set(x, y, z); seg.group.add(m); seg.disposables.push(geo);
  const deep = new THREE.Mesh(G.box, M.wallFade); deep.scale.set(w - 0.02, 14, d - 0.02); deep.position.set(x, y - h / 2 - 7, z); seg.group.add(deep);   // fades into the canopy
}
// ---------------------------------------------------------------- scenery instancing (scenery.js parts)
const TREE_MATS = [SC.M.bark, SC.M.leaves], PALM_MATS = [SC.M.bark, SC.M.frond];
const onBridge = (seg, d, m = 0) => seg.bridges.some((b) => d > b.d0 - m && d < b.d1 + m);
function sc(seg, key, geo, mat, m4, cast = false, recv = false) {
  (seg.sc ||= {});
  (seg.sc[key] ||= { geo, mat, list: [], cast, recv }).list.push(m4);
}
function flushScenery(seg) {
  for (const e of Object.values(seg.sc || {})) {
    const im = new THREE.InstancedMesh(e.geo, e.mat, e.list.length);
    e.list.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
    im.castShadow = e.cast; im.receiveShadow = e.recv;
    seg.group.add(im); seg.disposables.push(im);
  }
  seg.sc = {};
}
// a row of carved curb blocks from d0 to d1 at x; every fourth block is a capped post
function curbs(seg, x, d0, d1) {
  let k = 0;
  for (let d = d0 + 0.9; d < d1 - 0.5; d += 1.8, k++) {
    if (k % 4 === 2) { sc(seg, 'post', SC.G.post, M.wall, compose(x, -0.15, -d, 0, 1), true, true); sc(seg, 'cap', SC.G.cap, M.wall, compose(x, -0.15, -d, 0, 1), true); }
    else sc(seg, 'curb', SC.G.curb, M.wall, compose(x, 0.15, -d, Math.PI / 2, 1, 1 + (k % 3) * 0.04, 1), true, true);
  }
}
// tall piers under the road edge, dropping into the jungle
function pier(seg, x, d) {
  sc(seg, 'pier', SC.G.pier, M.wall, compose(x, -0.5, -d, 0, 1));
  sc(seg, 'pierCap', SC.G.pierCap, M.wall, compose(x, -0.45, -d, 0, 1));
}
// rope bridge deck: planks across the road, two beams, posts and rope rails
function bridgeDeck(seg, a, b) {
  const w = PATH_W + 0.5;
  for (let d = a + 0.17; d < b; d += 0.34) {
    sc(seg, 'plank', SC.G.plank, SC.M.plank, compose(rr(-0.06, 0.06), -0.08 - rand() * 0.03, -d, rr(-0.025, 0.025), w, 1, 1 + rand() * 0.1), false, true);
  }
  for (const s of [-1, 1]) {
    sc(seg, 'beam', SC.G.bridgeBeam, SC.M.plank, compose(s * (HALF - 0.1), -0.3, -(a + b) / 2, 0, 1, 1, b - a));
    const n = Math.max(2, Math.round((b - a) / 3));
    for (let i = 0; i <= n; i++) sc(seg, 'bpost', SC.G.bridgePost, SC.M.plank, compose(s * (HALF + 0.12), -0.15, -(a + (b - a) * i / n), 0, 1), true);
    for (const h of [0.75, 1.3]) {
      // two ropes per side, sagging between posts
      for (let i = 0; i < n; i++) {
        const z0 = a + (b - a) * i / n, z1 = a + (b - a) * (i + 1) / n;
        sc(seg, 'rope', SC.G.rope, SC.M.rope, compose(s * (HALF + 0.12), h - 0.08, -(z0 + z1) / 2, 0, 1, 1, z1 - z0));
      }
    }
  }
}
// the jungle world around a segment: rock spires (some with waterfalls), the tree sea, vines, ferns, sun shafts
function dressSegment(seg) {
  const L = seg.length, side = seg.turn === 'R' ? 1 : -1;
  // vines hanging over the road edge, ferns on the curbs
  for (let d = seg.idx === 0 ? -26 : 2; d < L - 1; d += rr(2.2, 4.5)) {
    if (seg.gaps.some((g) => d > g.d0 - 1 && d < g.d1 + 1) || onBridge(seg, d, 1) || rideAt(seg, d, 3)) continue;
    const s = rand() < 0.5 ? -1 : 1;
    if (rand() < 0.55) sc(seg, 'vine', SC.G.vine, SC.M.vine, compose(s * (HALF + 0.68), 0.42, -d, s * Math.PI / 2, rr(0.8, 1.2), rr(0.7, 1.3), 1));
    if (rand() < 0.4) sc(seg, 'fern', SC.G.fern, SC.M.fern, compose(-s * (HALF + 0.4), 0.42, -d, rand() * 6, rr(0.45, 0.75)));
  }
  // the tree sea below the road
  for (let d = seg.idx === 0 ? -50 : -6; d < L + J + 10; d += rr(4, 7)) {
    for (const s of [-1, 1]) {
      if (s === side && d > L - 12) continue;
      for (let k = 0; k < 2; k++) {
        const x = s * rr(6, 70), yo = rr(-2, 3);
        let sz = rr(5, 11);
        if (Math.abs(x) - sz * 1.4 < HALF + 2) sz = Math.min(sz, (-3 - CANOPY_Y - yo) / 1.0);   // near the road: stay well below its edge
        sc(seg, 'crown' + (k & 1), SC.G.crowns[k & 1], SC.M.crown, compose(x, CANOPY_Y + yo, -d - rr(-3, 3), rand() * 6, sz, sz * rr(0.8, 1.1), sz));
      }
    }
  }
  // rock spires rising from the jungle; some carry a waterfall
  for (let d = seg.idx === 0 ? -20 : 30; d < L - 40; d += rr(28, 55)) {
    const s = rand() < 0.5 ? -1 : 1;
    if (s === side && d > L - 70) continue;
    const x = s * rr(20, 44), h = rr(26, 50), wdt = rr(6, 11);
    const v = Math.floor(rand() * 3);
    sc(seg, 'spire' + v, SC.G.spires[v], SC.M.rock, compose(x, CANOPY_Y - 10 + h * 0.5, -d, rand() * 6, wdt, h * 0.5, wdt * rr(0.8, 1.2)));
    if (rand() < 0.4) {
      const top = CANOPY_Y - 10 + h * 0.82, fallW = rr(2.2, 4);
      const fx = x - s * wdt * 0.62;
      const fall = new THREE.Mesh(SC.G.fall, SC.M.water);
      fall.position.set(fx, top, -d); fall.scale.set(fallW, top - CANOPY_Y + 2, 1); fall.rotation.y = s * Math.PI / 2;
      seg.group.add(fall);
      for (let k = 0; k < 3; k++) { const f = new THREE.Sprite(SC.M.foam); f.position.set(fx + rr(-1, 1), CANOPY_Y + 1 + k * 1.2, -d + rr(-1.5, 1.5)); f.scale.setScalar(rr(4, 7)); seg.group.add(f); }
    }
  }
  // sun shafts slanting through the trees beside the road
  for (let d = 15; d < L - 15; d += rr(25, 45)) {
    const s = rand() < 0.5 ? -1 : 1, m = new THREE.Mesh(SC.G.shaft, SC.M.shaft);
    m.position.set(s * rr(9, 16), 22, -d); m.scale.set(rr(3, 6), 34, 1); m.rotation.set(0, rr(-0.4, 0.4), s * 0.32);
    seg.group.add(m);
  }
}
// both arms straight up to the zipline grip: rotate each arm segment (world space) so it points up and slightly out
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _want = new THREE.Vector3(), _dq = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion();
function armChain(h) {
  if (h.armChain !== undefined) return h.armChain;
  const find = (re) => { let f = null; h.pivot.traverse((o) => { if (!f && o.isBone && re.test(o.name)) f = o; }); return f; };
  h.armChain = [];
  for (const s of ['L', 'R']) {
    const up = find(new RegExp(`^upperarm\\.?${s}$`, "i")), lo = find(new RegExp(`^lowerarm\\.?${s}$`, "i"));
    if (up && lo && lo.children.length) h.armChain.push({ side: s === 'L' ? -1 : 1, segs: [[up, lo], [lo, lo.children.find((c) => c.isBone) || lo.children[0]]] });
  }
  return h.armChain;
}
function raiseArms(h) {
  h.pivot.updateMatrixWorld(true);
  for (const arm of armChain(h)) {
    _want.set(arm.side * 0.16, 1, 0.04).normalize().applyQuaternion(heroRoot.quaternion);
    for (const [bone, child] of arm.segs) {
      bone.getWorldPosition(_a); child.getWorldPosition(_b);
      const cur = _b.sub(_a).normalize();
      _dq.setFromUnitVectors(cur, _want);
      bone.getWorldQuaternion(_wq); bone.parent.getWorldQuaternion(_pq);
      bone.quaternion.copy(_pq.invert().multiply(_dq.multiply(_wq)));
      bone.updateMatrixWorld(true);
    }
  }
}
// ---------------------------------------------------------------- set pieces: zipline and mine cart
function makeCart() {
  const c = new THREE.Group();
  const wood = SC.M.plank, iron = M.cartIron;
  const add = (mat, w, h, d, x, y, z) => { const m = new THREE.Mesh(G.box, mat); m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = true; c.add(m); return m; };
  add(wood, 1.5, 0.12, 1.9, 0, 0.32, 0);                                    // floor
  for (const s of [-1, 1]) { add(wood, 0.1, 0.6, 1.9, s * 0.74, 0.63, 0); add(wood, 1.5, 0.6, 0.1, 0, 0.63, s * 0.94); }
  for (const y of [0.42, 0.9]) for (const s of [-1, 1]) { add(iron, 1.6, 0.08, 0.06, 0, y, s * 0.97); add(iron, 0.06, 0.08, 2.0, s * 0.77, y, 0); }
  const wheel = new THREE.CylinderGeometry(0.22, 0.22, 0.12, 14).rotateZ(Math.PI / 2);
  for (const sx of [-0.62, 0.62]) for (const sz of [-0.6, 0.6]) { const w = new THREE.Mesh(wheel, iron); w.position.set(sx, 0.22, sz); c.add(w); }
  return c;
}
const zipGear = (() => {
  const g = new THREE.Group();
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 14), new THREE.MeshStandardMaterial({ color: 0x777b80, metalness: 0.8, roughness: 0.4 }));
  g.add(wheel);
  const bar = new THREE.Mesh(G.box, M.wood); bar.scale.set(0.05, 0.5, 0.05); bar.position.y = -0.3; g.add(bar);
  const grip = new THREE.Mesh(G.box, M.wood); grip.scale.set(0.7, 0.07, 0.07); grip.position.y = -0.56; g.add(grip);
  g.visible = false; scene.add(g); return g;
})();
function buildRide(seg) {
  const rd = seg.ride; if (!rd) return;
  if (rd.kind === 'zip') {
    // A-frame towers at both ends, a rope sagging between them
    for (const d of [rd.d0, rd.d1]) {
      for (const s of [-1, 1]) sc(seg, 'zpost', SC.G.bridgePost, SC.M.plank, compose(s * 1.3, 0, -d, 0, 1.6, ZIP_TOP / 1.35, 1.6), true);
      sc(seg, 'zbeam', SC.G.bridgeBeam, SC.M.plank, compose(0, ZIP_TOP + 0.35, -d, Math.PI / 2, 1.2, 1.2, 3.1), true);
      addTorch(seg, 1.9, -d + 0.6); addTorch(seg, -1.9, -d + 0.6);
    }
    const N = 24;
    for (let i = 0; i < N; i++) {
      const a = rd.d0 + (rd.d1 - rd.d0) * i / N, b = rd.d0 + (rd.d1 - rd.d0) * (i + 1) / N;
      const ya = zipRopeY(rd, a) + 0.3, yb = zipRopeY(rd, b) + 0.3;
      const len = Math.hypot(b - a, yb - ya), m4 = new THREE.Matrix4().compose(tmpV.set(0, (ya + yb) / 2, -(a + b) / 2), tmpQ.setFromEuler(new THREE.Euler(Math.atan2(yb - ya, b - a), 0, 0)), tmpS.set(1.4, 1.4, len));
      sc(seg, 'zrope', SC.G.rope, SC.M.rope, m4);
    }
  } else {
    // mine: rails and sleepers, timber frames, rock walls, lanterns, the parked cart and a buffer stop
    const a = rd.d0 - 4, b = rd.d1 + 3;
    const spans = []; let x = a;
    for (const gp of [...seg.gaps].sort((p, q) => p.d0 - q.d0)) { if (gp.d1 < a || gp.d0 > b) continue; spans.push([x, gp.d0]); x = gp.d1; }
    spans.push([x, b]);
    for (const [s0, s1] of spans) {
      // trodden dirt and gravel over the stones
      const fg = new THREE.PlaneGeometry(PATH_W + 0.4, s1 - s0).rotateX(-Math.PI / 2), fuv = fg.attributes.uv;
      for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * (PATH_W + 0.4) / 3.5, fuv.getY(i) * (s1 - s0) / 3.5);
      const fl = new THREE.Mesh(fg, M.mineFloor); fl.position.set(0, 0.006, -(s0 + s1) / 2); fl.receiveShadow = true; seg.group.add(fl); seg.disposables.push(fg);
      for (const sx of [-0.55, 0.55]) sc(seg, 'rail', G.box, M.rail, compose(sx, 0.08, -(s0 + s1) / 2, 0, 0.09, 0.12, s1 - s0), false, true);
      for (let d = s0 + 0.35; d < s1 - 0.2; d += 0.8) sc(seg, 'sleeper', SC.G.plank, SC.M.plank, compose(0, 0.01, -d, rr(-0.04, 0.04), 1.75, 0.6, 0.75), false, true);
    }
    for (let d = rd.d0 - 2; d <= rd.d1 + 2; d += 6) {
      for (const s of [-1, 1]) sc(seg, 'mpost', G.box, SC.M.plank, compose(s * (HALF + 0.35), 2.7, -d, 0, 0.38, 5.4, 0.38), true);
      sc(seg, 'mbeam', G.box, SC.M.plank, compose(0, 5.55, -d, 0, PATH_W + 1.4, 0.42, 0.42), true);
      for (const s of [-1, 1]) sc(seg, 'mbrace', G.box, SC.M.plank, compose(s * (HALF - 0.1), 4.95, -d, 0, 1, 1, 1).multiply(new THREE.Matrix4().makeRotationZ(s * 0.7)).multiply(new THREE.Matrix4().makeScale(0.9, 0.22, 0.25)));
    }
    for (let d = rd.d0 - 6; d < rd.d1 + 6; d += rr(4.2, 5.6)) for (const s of [-1, 1]) {
      const h = rr(5.5, 9.5);
      sc(seg, 'rwall', SC.G.rockWall, SC.M.rock, compose(s * (HALF + 2.2 + rr(0, 0.5)), -3, -d, rr(-0.12, 0.12) + (s < 0 ? Math.PI : 0), rr(0.9, 1.2), h + 3, 1), true, true);
    }
    for (let d = rd.d0 + 4, k = 0; d < rd.d1; d += 12, k++) addTorch(seg, (k % 2 ? 1 : -1) * (HALF + 0.55), -d);
    box(seg, SC.M.plank, 1.6, 0.6, 0.4, 0, 0.45, -(rd.d1 + 2.2));
    seg.cart = makeCart(); seg.cart.position.set(0, 0, -(rd.d0 + 0.6)); seg.group.add(seg.cart);
  }
}
// one instanced mesh per coin colour (gold / red / blue)
function buildCoins(seg) {
  seg.coinMeshes = [];
  [M.gold, M.coinRed, M.coinBlue].forEach((mat, i) => {
    const list = seg.coins.filter((c) => (c.v || 1) === i + 1); if (!list.length) return;
    const mesh = new THREE.InstancedMesh(G.coin, mat, list.length); mesh.frustumCulled = false;
    seg.group.add(mesh); seg.disposables.push(mesh); seg.coinMeshes.push({ mesh, list });
  });
}
function slab(seg, a, b) { const len = b - a, zc = -(a + b) / 2; pathTop(seg, PATH_W, len, 0, zc, len / PATH_W); wallBlock(seg, PATH_W, 5, len, 0, -2.51, zc); }

// coin rows: gold (1), red (2) from 300 m, blue (3) from 900 m; richer the further you get
function coinTier(dist) {
  const r = rand(), t = Math.min(1, dist / 4000);
  if (dist > 900 && r < 0.04 + 0.06 * t) return 3;
  if (dist > 300 && r < 0.14 + 0.12 * t) return 2;
  return 1;
}
let lastRideIdx = -9;
// set pieces: a zipline over a chasm, or a mine-cart ride through a timbered cut in the rock
function chooseRide(seg) {
  const L = seg.length, at = genDistance;
  if (seg.idx < 2 || seg.idx - lastRideIdx < 3 || L < 105) return null;
  const r = rand();
  if (at > 1100 && r < 0.2) { const len = Math.min(L - 50, rr(95, 130)); const d0 = rr(26, L - 24 - len); return { kind: 'cart', d0, d1: d0 + len }; }
  if (at > 380 && r < 0.42) { const len = rr(48, 66); const d0 = rr(28, L - 26 - len); return { kind: 'zip', d0, d1: d0 + len }; }
  return null;
}
const rideAt = (seg, d, m = 0) => seg.ride && d > seg.ride.d0 - m && d < seg.ride.d1 + m ? seg.ride : null;
const ZIP_SWING = 1.0, ZIP_TOP = 3.6, ZIP_HANG = 2.62;
const zipSag = (rd) => Math.min(6, (rd.d1 - rd.d0) * 0.09);
const zipRopeY = (rd, d) => { const u = clamp((d - rd.d0) / (rd.d1 - rd.d0), 0, 1); return ZIP_TOP - zipSag(rd) * 4 * u * (1 - u); };
const zipCut = (seg, d) => seg.ride && seg.ride.kind === 'zip' && d > seg.ride.d0 + 2 && d < seg.ride.d1 - 2;

function populate(seg) {
  const L = seg.length, distAt = (d) => genDistance + d;
  let d = seg.idx === 0 ? 46 : 18;
  const end = L - 18, obs = seg.obstacles;
  const lanesOf = () => [-1, 0, 1].sort(() => rand() - 0.5);
  seg.ride = chooseRide(seg); if (seg.ride) lastRideIdx = seg.idx;
  const rd = seg.ride;
  while (true) {
    const sp = speedAt(distAt(d)), t = difficulty(distAt(d));
    d += sp * lerp(1.05, 0.8, t) + rand() * 10 * (1 - t * 0.5);
    if (d > end) break;
    const zone = zoneOf(distAt(d));
    if (rd) {
      // keep the run-up and the landing clear; inside the mine only jump / duck hazards on the single track
      if (rd.kind === 'zip' && d > rd.d0 - 14 && d < rd.d1 + 9) { d = rd.d1 + 9; continue; }
      if (rd.kind === 'cart') {
        if (d > rd.d0 - 12 && d < rd.d0 + 12) { d = rd.d0 + 12; continue; }
        if (d >= rd.d0 + 12 && d < rd.d1 - 9) {
          const type = pick(['high', 'high', 'gap', 'low']), ob = { type, d, hit: false, mine: true };
          if (type === 'gap') { ob.len = 2.6 + t; seg.gaps.push({ d0: d - ob.len / 2, d1: d + ob.len / 2 }); }
          obs.push(ob); d += 4; continue;
        }
        if (d >= rd.d1 - 9 && d < rd.d1 + 9) { d = rd.d1 + 9; continue; }
      }
      if (d < rd.d0 && d + 34 > rd.d0) { d = rd.d0 - 14; }   // no combos running into the set piece
    }
    // hand-made combos get more common with distance
    if (seg.idx > 0 && !rideAt(seg, d, 40) && rand() < 0.1 + 0.3 * t) {
      const placed = placePattern(seg, d, sp, end, t, zone);
      if (placed) { d = placed; continue; }
    }
    let type; const r = rand();
    if (seg.idx === 0 && obs.length < 3) type = ['low', 'block', 'high'][obs.length];
    else if (r < 0.32) type = 'block'; else if (r < 0.54) type = 'low'; else if (r < 0.78) type = 'high'; else type = 'gap';
    // broken floor: one or two lanes have fallen away (from the second zone on)
    if ((type === 'block' || type === 'gap') && distAt(d) > ZONE_LEN * 0.8 && rand() < 0.3) type = 'lanegap';
    const ob = { type, d, hit: false };
    if (type === 'lanegap') {
      ob.len = 6 + t * 2; ob.lanes = lanesOf().slice(0, rand() < 0.45 ? 2 : 1);
      seg.laneGaps.push({ d0: d - ob.len / 2, d1: d + ob.len / 2, lanes: ob.lanes });
      obs.push(ob); d += ob.len / 2 + 5;   // room to step back into a lane after the broken floor
      continue;
    }
    if (type === 'low') ob.fire = rand() < (zone >= 2 ? 0.6 : 0.12);
    if (type === 'block') {
      ob.lanes = lanesOf().slice(0, rand() < 0.3 + t * 0.35 ? 2 : 1);
      ob.models = ob.lanes.map(() => pick(['idol', 'idol', 'totem', 'spire', 'column']));
    }
    if (type === 'gap') { ob.len = 3 + t * 1.4; seg.gaps.push({ d0: d - ob.len / 2, d1: d + ob.len / 2 }); }
    obs.push(ob);
    // set piece: a gap with a gate right after the landing (unlocks after ~400 m)
    if (type === 'gap' && distAt(d) > 400 && rand() < 0.35) {
      const d2 = d + AIRTIME * sp + 4.5;
      if (d2 < end && !rideAt(seg, d2, 12)) { obs.push({ type: 'high', d: d2, hit: false }); d = d2; }
    }
  }
  // coins: runs between obstacles and arcs over jumps
  const stops = [{ d: seg.idx === 0 ? 10 : 6 }, ...obs, { d: L - 6 }];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i].d + 6, b = stops[i + 1].d - 6;
    if (b - a < 8 || rand() > 0.78) continue;
    const next = stops[i + 1];
    const lanes = [-1, 0, 1].filter((l) => !(next.lanes && next.lanes.includes(l)));
    const lane = pick(lanes.length ? lanes : [0]);
    const n = Math.min(9, Math.floor((b - a) / 2.3)), v = coinTier(distAt(a));
    for (let k = 0; k < n; k++) seg.coins.push({ d: a + k * 2.3, x: lane * LANE, y: 1.0, taken: false, v });
    if (rand() < gemChance() * 0.6) seg.gems.push({ d: a + n * 2.3 + 1, lane, taken: false });
  }
  for (const ob of obs) {
    if ((ob.type === 'low' || ob.type === 'gap') && rand() < 0.5) {
      const lane = pick([-1, 0, 1]);
      const v = coinTier(distAt(ob.d));
      for (let k = -2; k <= 2; k++) seg.coins.push({ d: ob.d + k * 1.9, x: lane * LANE, y: 1.0 + 1.35 * (1 - (k / 2.6) ** 2), taken: false, v });
    }
  }
  // power-ups
  if (seg.idx > 0 && rand() < powerupChance() && obs.length > 1) {
    const ob = obs[Math.floor(rand() * (obs.length - 1))];
    const lane = ob.lanes ? ([-1, 0, 1].find((l) => !ob.lanes.includes(l)) ?? 0) : 0;
    const k = rand();
    seg.powerups.push({ d: ob.d - 7, lane, taken: false, kind: k < 0.32 ? 'shield' : k < 0.64 ? 'magnet' : k < 0.82 ? 'x2' : 'dash' });
  }
  // set-piece coins: along the zipline (a swing left or right picks up the side rows), single file in the mine
  if (rd) {
    seg.coins = seg.coins.filter((c) => !(rd.kind === 'zip' ? (c.d > rd.d0 - 2 && c.d < rd.d1 + 2) : false));
    seg.gems = seg.gems.filter((gm) => !rideAt(seg, gm.d, 2));
    for (const pu of seg.powerups) if (rideAt(seg, pu.d, 1)) pu.lane = 0;
    if (rd.kind === 'zip') {
      const v = coinTier(distAt(rd.d0) + 400);
      for (let dd = rd.d0 + 5; dd < rd.d1 - 4; dd += 2.2) {
        const u = (dd - rd.d0) / (rd.d1 - rd.d0), side = Math.sin(u * Math.PI * 3) > 0.35 ? 1 : Math.sin(u * Math.PI * 3) < -0.35 ? -1 : 0;
        seg.coins.push({ d: dd, x: side * ZIP_SWING, y: zipRopeY(rd, dd) - ZIP_HANG + 1.1, taken: false, v });
      }
    } else for (const c of seg.coins) if (c.d > rd.d0 - 1 && c.d < rd.d1 + 1) c.x = 0;
  }
  // rope bridges: a stretch of the road crosses the chasm on planks (no broken floor on them)
  if (seg.idx > 0 && L > 70 && rand() < 0.45) {
    const len = rr(26, 42), b0 = rr(24, L - 24 - len), b1 = b0 + len;
    if (!seg.gaps.some((g) => g.d1 > b0 - 3 && g.d0 < b1 + 3) && !seg.laneGaps.some((g) => g.d1 > b0 - 3 && g.d0 < b1 + 3) && !(rd && rd.d1 > b0 - 6 && rd.d0 < b1 + 6)) seg.bridges.push({ d0: b0, d1: b1 });
  }
  // today's Relic Hunt letter, somewhere quiet in the chosen segment
  if (huntSpawn && huntSpawn.seg === seg.idx) {
    const spots = [{ d: 10 }, ...obs, { d: L - 10 }];
    let best = null;
    for (let i = 0; i < spots.length - 1; i++) { const gap = spots[i + 1].d - spots[i].d, mid = (spots[i].d + spots[i + 1].d) / 2; if (gap > 14 && !rideAt(seg, mid, 6) && (!best || gap > best.gap)) best = { gap, d: mid }; }
    if (best) seg.letter = { d: best.d, lane: rideAt(seg, best.d, 2) ? 0 : pick([-1, 0, 1]), ch: huntSpawn.ch, taken: false };
  }
}
function placePattern(seg, d, sp, end, t, zone) {
  const obs = seg.obstacles, lanes = [-1, 0, 1];
  const kind = pick(t < 0.3 ? ['weave', 'gate_log', 'log_gate'] : ['weave', 'weave', 'gate_log', 'log_gate', 'double_gap']);
  if (kind === 'weave') {
    const a = pick(lanes), b = clamp(a + (t > 0.5 ? pick([-2, -1, 1, 2]) : pick([-1, 1])), -1, 1);
    if (a === b) return 0;
    const d2 = d + 11 + sp * 0.3; if (d2 > end) return 0;
    for (const [dd, free] of [[d, a], [d2, b]]) {
      const bl = lanes.filter((l) => l !== free);
      obs.push({ type: 'block', d: dd, hit: false, lanes: bl, models: bl.map(() => pick(['statue_head', 'rocks-tall', 'statue_block'])) });
    }
    return d2;
  }
  if (kind === 'gate_log' || kind === 'log_gate') {
    const first = kind === 'gate_log' ? 'high' : 'low', second = first === 'high' ? 'low' : 'high';
    const d2 = d + (first === 'low' ? AIRTIME * sp + 3.5 : sp * 0.8 + 2); if (d2 > end) return 0;
    obs.push({ type: first, d, hit: false, fire: first === 'low' && zone >= 2 }, { type: second, d: d2, hit: false, fire: second === 'low' && zone >= 2 });
    return d2;
  }
  if (kind === 'double_gap') {
    const len = 3 + t * 1.4, d2 = d + AIRTIME * sp + 6; if (d2 > end) return 0;
    for (const dd of [d, d2]) { obs.push({ type: 'gap', d: dd, len, hit: false }); seg.gaps.push({ d0: dd - len / 2, d1: dd + len / 2 }); }
    return d2;
  }
  return 0;
}

function buildSegment(seg) {
  const L = seg.length, side = seg.turn === 'R' ? 1 : -1;
  const cuts = [...seg.gaps, ...(seg.ride && seg.ride.kind === 'zip' ? [{ d0: seg.ride.d0 + 2, d1: seg.ride.d1 - 2 }] : [])].sort((p, q) => p.d0 - q.d0);
  // floor: full-width slabs, except over broken sections where only the surviving lanes are built
  const floor = (a0, b0) => {
    const lg = seg.laneGaps.filter((g) => g.d1 > a0 && g.d0 < b0).sort((p, q) => p.d0 - q.d0);
    let x0 = a0;
    for (const g of lg) {
      if (g.d0 > x0) slab(seg, x0, g.d0);
      const len = g.d1 - g.d0, zc = -(g.d0 + g.d1) / 2;
      for (const ln of [-1, 0, 1]) {
        if (g.lanes.includes(ln)) continue;
        pathTop(seg, STRIP, len, ln * STRIP, zc, len / PATH_W); wallBlock(seg, STRIP, 5, len, ln * STRIP, -2.51, zc);
      }
      for (const e of [g.d0, g.d1]) for (const ln of g.lanes) { const v = Math.floor(rand() * 3); sc(seg, 'rub' + v, PR.G.rubble[v], v === 2 ? PR.M.stone : PR.M.rock, compose(ln * STRIP + rr(-0.6, 0.6), 0.05, -e + (e === g.d0 ? 0.4 : -0.4), rand() * 6, rr(0.55, 0.8)), true, true); }
      x0 = g.d1;
    }
    if (b0 > x0) slab(seg, x0, b0);
  };
  // stone road, except where a rope bridge spans the chasm
  const stone = (a0, b0) => {
    let x = a0;
    for (const br of seg.bridges) { if (br.d1 <= x || br.d0 >= b0) continue; if (br.d0 > x) floor(x, br.d0); bridgeDeck(seg, Math.max(x, br.d0), Math.min(b0, br.d1)); x = br.d1; }
    if (b0 > x) floor(x, b0);
  };
  let a = seg.idx === 0 ? -30 : 0;
  for (const g of cuts) { stone(a, g.d0); a = g.d1; }
  stone(a, L);
  // carved curbs and posts along both edges (not on the bridges)
  const curbRun = (d0, d1) => {
    const rd = seg.ride;
    if (rd && rd.kind === 'cart' && rd.d0 - 3 < d1 && rd.d1 + 3 > d0) { if (rd.d0 - 3 > d0) curbRun(d0, rd.d0 - 3); if (rd.d1 + 3 < d1) curbRun(rd.d1 + 3, d1); return; }
    for (const br of seg.bridges) if (br.d0 < d1 && br.d1 > d0) { if (br.d0 > d0) curbRun(d0, br.d0); if (br.d1 < d1) curbRun(br.d1, d1); return; }
    for (const s of [-1, 1]) curbs(seg, s * (HALF + 0.33), d0, d1);
    for (let d = d0 + 4; d < d1 - 4; d += 10) if (!onBridge(seg, d, 2)) for (const s of [-1, 1]) pier(seg, s * (HALF + 0.62), d);
  };
  a = seg.idx === 0 ? -30 : 0;
  for (const g of cuts) { curbRun(a, g.d0); a = g.d1; }
  curbRun(a, L);
  // junction: floor, closed side wall, arrow, torches at the opening, obelisks on the far edge
  const zc = -(L + J / 2);
  pathTop(seg, J, J, 0, zc, 1);
  wallBlock(seg, J, 5, J, 0, -2.51, zc);
  curbs(seg, -side * (HALF + 0.33), L, L + J);
  const arrow = new THREE.Mesh(G.arrow, M.arrow); arrow.position.set(0, 0.02, zc); arrow.rotation.y = -side * Math.PI / 2; seg.group.add(arrow);
  for (const z of [-(L - 0.4), -(L + J + 0.4)]) addTorch(seg, side * (HALF + 0.55), z);
  for (const s of [-1, 1]) sc(seg, 'obelisk', PR.G.obelisk, PR.M.stone, compose(s * (HALF - 0.45), 0, -(L + J - 0.5), 0, 1), true, true);

  for (const ob of seg.obstacles) {
    const z = -ob.d;
    if (ob.mine && ob.type === 'high') {   // a sagging timber across the mine track: duck!
      box(seg, SC.M.plank, PATH_W + 1.6, 0.42, 0.45, 0, 1.68, z).rotation.z = rr(-0.05, 0.05);
      for (const s of [-1, 1]) box(seg, SC.M.plank, 0.36, 1.9, 0.36, s * (HALF + 0.4), 0.95, z);
      continue;
    }
    if (ob.mine && ob.type === 'low') {     // ore and rock spilled on the rails: jump!
      for (let k = 0; k < 7; k++) { const v = k % 3; sc(seg, 'rub' + v, PR.G.rubble[v], PR.M.rock, compose(rr(-1.4, 1.4), 0.1, z + rr(-0.35, 0.35), rand() * 6, rr(0.9, 1.4)), true, true); }
      box(seg, M.cartIron, 1.6, 0.6, 1.0, 0.4, 0.3, z).rotation.set(0.15, 0.4, 1.4);
      continue;
    }
    if (ob.type === 'low' && ob.fire) {
      // fire trap: a carved stone trough of glowing coals with a wall of flame
      sc(seg, 'trough', PR.G.trough, PR.M.stone, compose(0, 0, z, 0, 1), true, true);
      const bed = new THREE.Mesh(PR.G.coalBed, PR.M.coals); bed.position.z = z; seg.group.add(bed);
      for (let x = -3.15; x <= 3.16; x += 0.9) {
        const flame = new THREE.Mesh(PR.G.flameQuad, PR.M.fire), w = rr(0.85, 1.15), h = rr(0.95, 1.25);
        flame.position.set(x + rr(-0.12, 0.12), 0.38, z + rr(-0.15, 0.15)); flame.scale.set(w, h, 1); seg.group.add(flame);
        const glow = new THREE.Sprite(M.glow); glow.position.set(flame.position.x, 0.85, z); glow.scale.setScalar(1.4); seg.group.add(glow);
        seg.torches.push({ flame, glow, seed: Math.random() * 10, base: 1.4, fs: [w, h] });
      }
    } else if (ob.type === 'low') {
      // a fallen jungle trunk across the road, ferns sprouting at its ends
      const v = rand() < 0.5 ? 0 : 1, flip = rand() < 0.5 ? 0 : Math.PI;
      sc(seg, 'log' + v, PR.G.logs[v], LOG_MATS, compose(0, 0, z, flip + rr(-0.03, 0.03), 1), true, true);
      for (const s of [-1, 1]) if (rand() < 0.7) sc(seg, 'fern', SC.G.fern, SC.M.fern, compose(s * rr(2.6, 3.6), 0, z + rr(-0.6, 0.6), rand() * 6, rr(0.4, 0.6)));
    } else if (ob.type === 'high') {
      // carved stone gate: slide under the lintel; vines hang from its ends
      sc(seg, 'gate', PR.G.gate, PR.M.stone, compose(0, 0, z, 0, 1), true, true);
      for (const s of [-1, 1]) for (let k = 0; k < 2; k++) sc(seg, 'vine', SC.G.vine, SC.M.vine, compose(s * rr(3.3, 4.6), 1.3, z + 0.52, rr(-0.2, 0.2), rr(0.45, 0.7), rr(0.18, 0.26), 1));
    } else if (ob.type === 'block') {
      ob.lanes.forEach((ln, i) => {
        const name = ob.models[i], x = ln * LANE;
        if (name === 'idol') sc(seg, 'idolHead', PR.G.idolHead, PR.M.stone, compose(x, 0, z, rr(-0.08, 0.08), 1.05), true, true);
        else if (name === 'totem') sc(seg, 'totem', PR.G.totem, PR.M.stone, compose(x, 0, z, rr(-0.06, 0.06), 1), true, true);
        else if (name === 'spire') { const v = rand() < 0.5 ? 0 : 1; sc(seg, 'rspire' + v, PR.G.rockSpire[v], PR.M.rock, compose(x, 0, z, rand() * 6, 1, rr(0.95, 1.15), 1), true, true); }
        else sc(seg, 'col2', SC.G.columns[2], M.wall, compose(x, 0, z, rand() * 6, 1.45, 0.62, 1.45), true, true);
      });
    } else if (ob.type === 'gap') {
      for (const e of [ob.d - ob.len / 2, ob.d + ob.len / 2]) for (let k = 0; k < 2; k++) { const v = Math.floor(rand() * 3); sc(seg, 'rub' + v, PR.G.rubble[v], v === 2 ? PR.M.stone : PR.M.rock, compose(rr(-2.8, 2.8), 0.05, -e + (e < ob.d ? 0.45 : -0.45), rand() * 6, rr(0.6, 0.9)), true, true); }
    }
  }
  // ruins and plants along the path
  const nearGap = (d, m) => seg.gaps.some((g) => d > g.d0 - m && d < g.d1 + m) || onBridge(seg, d, m) || !!rideAt(seg, d, m + 2);
  for (let d = seg.idx === 0 ? -26 : 4; d < L - 2; d += rr(8, 13)) {
    if (nearGap(d, 2)) continue;
    for (const s of [-1, 1]) {
      if (rand() < 0.25) continue;
      const v = rand() < 0.2 ? 2 : rand() < 0.5 ? 1 : 0, h = rr(5.6, 8.6);
      sc(seg, 'col' + v, SC.G.columns[v], M.wall, compose(s * (HALF + 1.15), -2.2, -d, Math.round(rand() * 4) * Math.PI / 2 + rr(-0.05, 0.05), 0.95, h / 6, 0.95), true, true);
    }
  }
  for (let d = seg.idx === 0 ? -26 : 3; d < L - 2; d += rr(5, 9)) {
    if (nearGap(d, 1)) continue;
    // on the curbs: leafy bushes, ferns, clay urns, fallen stones
    const x = (rand() < 0.5 ? -1 : 1) * (HALF + 0.3), r = rand();
    if (r < 0.35) { const s = rr(0.38, 0.55); sc(seg, 'bush' + (r < 0.17 ? 0 : 1), SC.G.crowns[r < 0.17 ? 0 : 1], SC.M.crown, compose(x, 0.45 + s * 0.35, -d, rand() * 6, s, s * 0.8, s)); }
    else if (r < 0.65) sc(seg, 'fern', SC.G.fern, SC.M.fern, compose(x, 0.42, -d, rand() * 6, rr(0.45, 0.7)));
    else if (r < 0.85) sc(seg, 'urn', PR.G.urn, PR.M.terracotta, compose(x, 0.42, -d, rand() * 6, rr(0.9, 1.2)), true, true);
    else { const v = Math.floor(rand() * 3); sc(seg, 'rub' + v, PR.G.rubble[v], v === 2 ? PR.M.stone : PR.M.rock, compose(x, 0.45, -d, rand() * 6, rr(0.5, 0.75)), true, true); }
  }
  // jungle rising from the canopy. Every crown keeps clear of this road, of the road we came in on (behind
  // d = 0) and of the next road (across the junction, on the turn side), so no tree ever reads as an obstacle.
  const treeFits = (x, d, r) => {
    if (Math.abs(x) - r < HALF + 2.2) return false;
    if (seg.idx > 0 && d - r < 3) return false;
    if (Math.sign(x) === side && d + r > L - 3 && d - r < L + J + 3) return false;
    return true;
  };
  const plantTree = (x, d, h) => {
    const palm = rand() < 0.38, v = palm ? (rand() < 0.5 ? 0 : 1) : Math.floor(rand() * 3), geo = palm ? SC.G.palms[v] : SC.G.trees[v];
    const k = h / geo.userData.h * (palm ? 1.3 : 1.25), sx = rr(0.9, 1.15), r = geo.userData.r * k * Math.max(sx, 1) + 0.6;
    for (let tries = 0; tries < 3; tries++) {
      const xx = tries === 0 ? x : Math.sign(x) * (HALF + 2.4 + r + rr(0, 8));
      if (!treeFits(xx, d, r)) continue;
      sc(seg, (palm ? 'palm' : 'tree') + v, geo, palm ? PALM_MATS : TREE_MATS, compose(xx, CANOPY_Y - 0.5, -d, rand() * 6, k * sx, k, k * sx));
      return;
    }
  };
  for (let d = seg.idx === 0 ? -40 : 8; d < L + J + 22; d += rr(4.5, 8)) {
    for (const s of [-1, 1]) {
      if (rand() < 0.2) continue;
      plantTree(s * rr(8.5, 24), d, rr(10.5, 17));
    }
  }
  for (let k = 0; k < 7; k++) plantTree((rand() < 0.5 ? -1 : 1) * rr(0, 16), L + J + rr(8, 26), rr(11, 17));

  buildCoins(seg);
  for (const gem of seg.gems) {
    gem.mesh = new THREE.Mesh(PR.G.gem, PR.M.gem); gem.mesh.scale.setScalar(1.25); gem.mesh.position.set(gem.lane * LANE, 0.6, -gem.d);
    const gl = new THREE.Sprite(M.gemGlow); gl.scale.setScalar(2.4); gem.mesh.add(gl); seg.group.add(gem.mesh);
  }
  for (const pu of seg.powerups) {
    pu.mesh = pu.kind === 'shield' ? PR.makeShield() : pu.kind === 'magnet' ? makeMagnet() : pu.kind === 'x2' ? makeX2() : makeIdol();
    pu.mesh.position.set(pu.lane * LANE, 1.25, -pu.d);
    const halo = new THREE.Sprite(M.glow); halo.scale.setScalar(2.2); halo.position.copy(pu.mesh.position); seg.group.add(halo); pu.halo = halo;
    seg.group.add(pu.mesh);
  }
  if (seg.letter) {
    const L0 = seg.letter;
    L0.mesh = new THREE.Mesh(G.coin, PR.M.letter(L0.ch)); L0.mesh.scale.setScalar(1.9);
    L0.mesh.position.set(L0.lane * LANE, 1.3, -L0.d); seg.group.add(L0.mesh);
    L0.halo = new THREE.Sprite(M.glow); L0.halo.scale.setScalar(3); L0.halo.position.copy(L0.mesh.position); seg.group.add(L0.halo);
  }
  dressSegment(seg); buildRide(seg); flushInstances(seg); flushScenery(seg);
}
function addTorch(seg, x, z) {   // carved stone brazier with a shader flame
  sc(seg, 'brazier', PR.G.brazier, PR.M.stone, compose(x, 0, z, rand() * 6, 1), true, true);
  const flame = new THREE.Mesh(PR.G.flameQuad, PR.M.fire); flame.position.set(x, 1.6, z); flame.scale.set(0.8, 1.1, 1); seg.group.add(flame);
  const glow = new THREE.Sprite(M.glow); glow.position.set(x, 2.0, z); glow.scale.setScalar(2.6); seg.group.add(glow);
  seg.torches.push({ flame, glow, seed: Math.random() * 10, base: 2.6, fs: [0.8, 1.1] });
}
function createSegment(idx, start, T, length) {
  const seg = { idx, T, dir: dirOf(T), right: dirOf(T + 1), start: start.clone(), length,
    obstacles: [], gaps: [], laneGaps: [], bridges: [], ride: null, coins: [], gems: [], powerups: [], torches: [], inst: {}, disposables: [], group: new THREE.Group() };
  const l2 = lastTurns.slice(-2);   // never three turns the same way: the path cannot loop into itself
  seg.turn = (l2.length === 2 && l2[0] === l2[1]) ? (l2[0] === 'L' ? 'R' : 'L') : (rand() < 0.5 ? 'L' : 'R');
  lastTurns.push(seg.turn);
  seg.center = seg.start.clone().addScaledVector(seg.dir, length + J / 2);
  seg.group.position.copy(seg.start);
  seg.group.rotation.y = -T * Math.PI / 2;
  populate(seg); buildSegment(seg);
  scene.add(seg.group);
  return seg;
}
function appendSegment() {
  let seg;
  if (lastIdx < 0) seg = createSegment(0, new THREE.Vector3(0, 0, 0), 0, 135);
  else {
    const prev = segMap.get(lastIdx);
    const T = prev.T + (prev.turn === 'R' ? 1 : -1);
    genDistance += prev.length + J;
    const t = Math.min(1, difficulty(genDistance));
    seg = createSegment(lastIdx + 1, prev.center.clone().addScaledVector(dirOf(T), J / 2), T, Math.round(rr(85, 165) - t * 20));
  }
  segMap.set(seg.idx, seg); lastIdx = seg.idx;
}
function disposeSeg(seg) { scene.remove(seg.group); for (const d of seg.disposables) d.dispose(); }
function ensureSegments() {
  while (lastIdx < p.segIdx + 3) appendSegment();
  for (const [i, s] of segMap) if (i < p.segIdx - 1) { disposeSeg(s); segMap.delete(i); }
}
function resetWorld() { for (const s of segMap.values()) disposeSeg(s); segMap.clear(); lastIdx = -1; genDistance = 0; lastTurns = []; lastRideIdx = -9; }

// ---------------------------------------------------------------- player state
const p = {
  state: 'loading', segIdx: 0, d: 0, x: 0, lane: 0, y: 0, vy: 0, slide: 0, coyote: 0, jumpBuf: 0, speed: START_SPEED, T: 0,
  theta: 0, turnQueued: null, dist: 0, coins: 0, runTime: 0, deadTimer: 0, reason: '', pendingSlide: false,
  shield: false, magnet: 0, invuln: 0, stumble: 0, chase: 0, turns: 0, countdown: 0, landed: 0,
  boost: 0, coinMul: 1, gems: 0, power: 0, powerUses: 0, powerReady: false, powerFx: 0, powerLock: 0, adRevived: false, gemRevives: 0, deathD: 0, reviveTimer: 0, doubled: false,
  score: 0, x2: 0, mult: 1, letter: null, levelUp: null, hover: 0, goldBanked: 0, ride: null, clack: 0, cartLean: 0,
};
const cur = () => segMap.get(p.segIdx);
const worldAt = (seg, d, x, y, out) => out.copy(seg.start).addScaledVector(seg.dir, d).addScaledVector(seg.right, x).setY(y);
const inGap = (seg, d) => seg.gaps.some((g) => d > g.d0 + 0.25 && d < g.d1 - 0.25);
const STRIP = PATH_W / 3;   // the broken-floor sections are built from three lane-wide strips
const inLaneGap = (seg, d, x) => seg.laneGaps.some((g) => d > g.d0 + 0.3 && d < g.d1 - 0.3 && g.lanes.some((ln) => Math.abs(x - ln * STRIP) < STRIP / 2 - 0.15));
function isGround(seg, d, x) {
  if (d < 0) return seg.idx === 0 ? (d > -30 && Math.abs(x) <= HALF + 0.1) : (d >= -J - 0.05 && Math.abs(x) <= J / 2 + 0.3);
  if (d <= seg.length) return Math.abs(x) <= HALF + 0.1 && !inGap(seg, d) && !inLaneGap(seg, d, x) && !zipCut(seg, d);
  if (d <= seg.length + J) return Math.abs(x) <= J / 2 + 0.3;
  return false;
}
const cornerOffset = (seg) => p.d - (seg.length + J / 2);   // <0 before the junction centre

// ---------------------------------------------------------------- input
function handleSwipe(dir) {
  if (p.state !== 'run') return;
  const seg = cur();
  if (p.ride && p.ride.kind === 'zip' && (dir === 'up' || dir === 'down')) return;   // hanging on: only swing left / right
  if (p.ride && p.ride.kind === 'cart' && (dir === 'left' || dir === 'right')) { p.cartLean = dir === 'left' ? -1 : 1; Sound.swish(); return; }
  if (dir === 'up') {
    if (p.coyote > 0 && p.vy <= 0.01) doJump(); else p.jumpBuf = 0.16;
    return;
  }
  if (dir === 'down') {
    p.jumpBuf = 0;
    if (p.y > 0.05) { p.vy = Math.min(p.vy, -24); p.pendingSlide = true; }
    else if (p.slide > 0.12) p.slideBuf = true;     // mid-roll: the next roll starts when this one ends
    else startSlide();
    return;
  }
  const side = dir === 'left' ? 'L' : 'R';
  const a = cornerOffset(seg);
  if (seg.turn === side && a >= -turnLead(p.speed) && a <= turnLate(p.speed)) {
    p.turnQueued = side;
    if (a >= TURN_EXEC) doTurn();
    return;
  }
  // anything else (including the wrong way at a corner) is a harmless lane change
  const nl = clamp(p.lane + (side === 'L' ? -1 : 1), -1, 1);
  if (nl !== p.lane) { p.lane = nl; Sound.swish(); }
}
function doJump() { p.vy = JUMP_V; p.y = Math.max(p.y, 0.001); p.coyote = 0; p.jumpBuf = 0; p.slide = 0; p.slideBuf = false; p.pendingSlide = false; Sound.jump(); Progress.ev('jump'); }
function startSlide() { Sound.slide(); Progress.ev('slide'); p.slide = SLIDE_TIME; p.slideBuf = false; p.slideSeq = (p.slideSeq || 0) + 1; }
function doTurn() {
  const seg = cur(), next = segMap.get(p.segIdx + 1), side = p.turnQueued;
  p.turnQueued = null;
  if (!next || seg.turn !== side) return;
  let a = cornerOffset(seg);
  if (a > J / 2 - 0.3) { a = J / 2 - 0.3; if (p.y < 0) { p.y = 0; p.vy = 0; } }   // a late press snaps back onto the corner
  const l = p.x;
  if (side === 'R') { p.d = l - J / 2; p.x = -a; } else { p.d = -l - J / 2; p.x = a; }
  p.segIdx++; p.lane = 0; p.T = next.T; p.turns++;
  camRoll = side === 'L' ? 0.1 : -0.1;
  Sound.turn(); haptic(12); Progress.ev('turn');
  ensureSegments();
  if (save.tutorial < 3) { save.tutorial++; persist(); }
  hideToast();
}

const EDGE = 26;
let swipe = null;
const fireSwipe = (dx, dy) => { if (Math.abs(dx) > Math.abs(dy)) handleSwipe(dx < 0 ? 'left' : 'right'); else handleSwipe(dy < 0 ? 'up' : 'down'); };
addEventListener('pointerdown', (e) => {
  if (e.target.closest && e.target.closest('button, a')) return;
  const x = e.clientX, y = e.clientY;
  if (e.pointerType !== 'mouse' && (x < EDGE || x > innerWidth - EDGE || y > innerHeight - EDGE)) return;   // system gesture zones
  swipe = { x, y, id: e.pointerId, done: false };
}, { passive: true });
addEventListener('pointermove', (e) => {
  if (!swipe || swipe.done || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
  swipe.done = true; fireSwipe(dx, dy);
}, { passive: true });
let lastTap = 0;
addEventListener('pointerup', (e) => {
  if (swipe && !swipe.done && e.pointerId === swipe.id) {
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    if (Math.abs(dx) >= 12 || Math.abs(dy) >= 12) fireSwipe(dx, dy);
    else { const t = performance.now(); if (t - lastTap < 320) { lastTap = 0; activatePower(); } else lastTap = t; }   // double-tap fires the power
  }
  swipe = null;
});
addEventListener('pointercancel', () => { swipe = null; });
canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === 'arrowleft' || k === 'a') handleSwipe('left');
  else if (k === 'arrowright' || k === 'd') handleSwipe('right');
  else if (k === 'arrowup' || k === 'w' || k === ' ') handleSwipe('up');
  else if (k === 'arrowdown' || k === 's') handleSwipe('down');
  else if (k === 'escape' || k === 'p') togglePause();
  else if (k === 'e' || k === 'shift') activatePower();
  else if (k === 'enter' && !(e.target.closest && e.target.closest('button')) && !overlayOpen()) {
    if (p.state === 'menu') ui.play.click(); else if (p.state === 'over') leaveResults(startRun);
  }
  if (k.startsWith('arrow') || k === ' ') e.preventDefault();
});

// ---------------------------------------------------------------- sound (synthesized with WebAudio)
// zone index -> music track (look.js ZONES order: Sunrise Ruins, Emerald Canopy, Ember Gorge, Moonlit Temple)
const ZONE_MUSIC = ['sunrise', 'canopy', 'ember', 'moon'];
const Sound = (() => {
  let ctx = null, master = null, noiseBuf = null;
  const now = () => (ctx ? ctx.currentTime : 0);
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); loadSamples(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = save.sound ? 0.8 : 0; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 1; musicBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    loadSamples();
  }
  function tone(f, dur, type = 'sine', vol = 0.3, to = null, when = 0, dest = master) {
    if (!ctx) return; const t = Math.max(ctx.currentTime, when || ctx.currentTime);
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type;
    o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(dur, vol = 0.3, freq = 1200, type = 'lowpass', when = 0, dest = master) {
    if (!ctx) return; const t = Math.max(ctx.currentTime, when || ctx.currentTime);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  // The tiger's voice: real big-cat recordings (0 A.D. / Wildfire Games, CC BY-SA 3.0, see CREDITS.txt),
  // decoded once; each call varies pitch and level a little so repeats don't sound copied.
  const SAMPLES = { roar: 'tiger-roar.mp3', snarl: 'tiger-snarl.mp3', growl: 'tiger-growl.mp3', growl2: 'tiger-growl2.mp3' };
  const buffers = {};
  let samplesLoading = false;
  function loadSamples() {
    if (samplesLoading || !ctx) return; samplesLoading = true;
    for (const [k, file] of Object.entries(SAMPLES)) {
      loadBinary(file)
        .then((ab) => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)))
        .then((b) => { buffers[k] = b; }).catch((e) => console.warn('sound', file, e));
    }
  }
  function sample(name, vol = 1, rate = 1, delay = 0) {
    if (!ctx || !buffers[name]) return;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = buffers[name]; s.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = vol;
    s.connect(g).connect(master); s.start(t);
  }
  // ---- music: looping tracks that crossfade — a menu theme, one per zone (calm at sunrise, drums in the
  // gorge, eerie by moonlight) and the Idol Rush overlay. On devices they stream from <audio> elements
  // through the mixer; hosts that ship assets base64-encoded decode them into buffers instead.
  const TRACKS = { menu: 'music-menu', sunrise: 'music-sunrise', canopy: 'music-canopy', ember: 'music-ember', moon: 'music-moon', idol: 'music-idol' };
  const LEVEL = { menu: 0.55, sunrise: 0.62, canopy: 0.62, ember: 0.6, moon: 0.62, idol: 0.7 };
  const useBuffers = ASSET_EXT.endsWith('.txt');
  const tr = {};
  let musicBus = null, mainTrack = null, idolOn = false, suspended = false, rate = 1;
  const rateFor = (name) => (name === 'menu' ? 1 : rate);
  function track(name) {
    if (tr[name] || !ctx) return tr[name];
    const g = ctx.createGain(); g.gain.value = 0; g.connect(musicBus);
    const t = tr[name] = { g, on: false, el: null, buf: null, src: null, name };
    if (!useBuffers) {
      try {
        const el = new Audio(ASSET_BASE + TRACKS[name] + '.ogg'); el.loop = true; el.preload = 'auto';
        el.preservesPitch = false; el.mozPreservesPitch = false; el.webkitPreservesPitch = false;   // arcade speed-up: pitch rises with the tempo
        ctx.createMediaElementSource(el).connect(g); t.el = el;
      } catch (e) { console.warn('music', e); }
    } else {
      loadBinary(TRACKS[name] + '.ogg').then((ab) => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)))
        .then((b) => { t.buf = b; if (t.on) startSrc(t); }).catch((e) => console.warn('music', name, e));
    }
    return t;
  }
  function startSrc(t) {
    if (suspended) return;
    if (t.el) { t.el.play().catch(() => {}); return; }
    if (t.src || !t.buf) return;
    const s = ctx.createBufferSource(); s.buffer = t.buf; s.loop = true; s.playbackRate.value = rateFor(t.name); s.connect(t.g); s.start(); t.src = s;
  }
  function stopSrc(t) { if (t.el) t.el.pause(); else if (t.src) { try { t.src.stop(); } catch { /* already stopped */ } t.src = null; } }
  function ramp(param, v, sec) { const n = ctx.currentTime; param.cancelScheduledValues(n); param.setValueAtTime(param.value, n); param.linearRampToValueAtTime(v, n + sec); }
  function fadeTo(t, lvl, sec) {
    if (lvl > 0) { t.on = true; startSrc(t); }
    else { t.on = false; setTimeout(() => { if (!t.on) stopSrc(t); }, sec * 1000 + 120); }
    ramp(t.g.gain, lvl, sec);
  }
  function mainLevel(name) { return (LEVEL[name] || 0.5) * (idolOn ? 0.18 : 1); }
  function music(name, sec = 1.6) {
    if (!ctx) return;
    if (name === mainTrack) { if (name) fadeTo(track(name), mainLevel(name), sec); return; }
    if (mainTrack && tr[mainTrack]) fadeTo(tr[mainTrack], 0, sec);
    mainTrack = name;
    if (name) fadeTo(track(name), mainLevel(name), sec);
  }
  return {
    init, music,
    current: () => mainTrack,
    /** music tempo follows the run: 1 at the start, a little faster (and higher, arcade style) as the runner speeds up */
    tempo(r) {
      if (Math.abs(r - rate) < 0.002 && r !== 1) return;
      rate = r;
      for (const t of Object.values(tr)) {
        const v = rateFor(t.name);
        if (t.el) { if (Math.abs(t.el.playbackRate - v) > 0.002) t.el.playbackRate = v; }
        else if (t.src) t.src.playbackRate.setTargetAtTime(v, ctx.currentTime, 0.4);
      }
    },
    running: () => !!ctx && ctx.state === 'running',
    /** after an unlock gesture: resume the context and (re)start every track that should be playing */
    kick() { if (!ctx) return; if (ctx.state !== 'running') ctx.resume().then(() => { for (const t of Object.values(tr)) if (t.on) startSrc(t); }).catch(() => {}); for (const t of Object.values(tr)) if (t.on) startSrc(t); },
    debugState() { return { rate: +rate.toFixed(3), main: mainTrack, idol: idolOn, bus: musicBus ? +musicBus.gain.value.toFixed(2) : null, ctx: ctx && ctx.state,
      tracks: Object.fromEntries(Object.entries(tr).map(([n, t]) => [n, { on: t.on, gain: +t.g.gain.value.toFixed(2), playing: t.el ? !t.el.paused : !!t.src, at: t.el ? +t.el.currentTime.toFixed(1) : null, ready: t.el ? t.el.readyState : !!t.buf }])) }; },
    /** Turn the current track down (crash, pause) or back up: 0..1 over `sec`. */
    duck(v, sec = 0.6) { if (musicBus) ramp(musicBus.gain, v, sec); },
    /** Idol Rush: its own driving loop on top, the zone music pushed right down. */
    idol(on) {
      if (!ctx || on === idolOn) return;
      idolOn = on;
      fadeTo(track('idol'), on ? LEVEL.idol : 0, on ? 0.25 : 1.2);
      if (mainTrack && tr[mainTrack]) ramp(tr[mainTrack].g.gain, mainLevel(mainTrack), on ? 0.3 : 1.4);
      if (on) { const t = tr.idol; if (t && t.el) t.el.currentTime = 0; }
    },
    set(on) { if (master) master.gain.value = on ? 0.8 : 0; },
    suspend() {
      suspended = true;
      for (const t of Object.values(tr)) if (t.el) t.el.pause();
      if (ctx && ctx.state === 'running') ctx.suspend();
    },
    resume() {
      suspended = false;
      if (ctx && ctx.state === 'suspended') ctx.resume();
      for (const t of Object.values(tr)) if (t.on) startSrc(t);
    },
    coin() { tone(1320, 0.07, 'triangle', 0.18); tone(1975, 0.12, 'triangle', 0.15, null, now() + 0.05); },
    gem() { [988, 1319, 1760, 2349].forEach((f, i) => tone(f, 0.14, 'triangle', 0.16, null, now() + i * 0.05)); },
    jump() { tone(290, 0.2, 'sine', 0.22, 640); },
    slide() { noise(0.28, 0.22, 900, 'bandpass'); },
    swish() { noise(0.1, 0.1, 2400, 'bandpass'); },
    turn() { tone(523, 0.08, 'square', 0.06); tone(784, 0.1, 'square', 0.05, null, now() + 0.05); },
    crash() { noise(0.55, 0.6, 380); tone(130, 0.45, 'sawtooth', 0.25, 40); },
    stumble() { noise(0.25, 0.4, 500); tone(200, 0.2, 'triangle', 0.2, 90); },
    // Idol Rush: a rising whoosh into a deep boom with a bright chime on top
    idolRush() {
      if (!ctx) return; const t = ctx.currentTime;
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
      f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(5200, t + 0.55);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + 0.95);
      tone(180, 0.55, 'sawtooth', 0.12, 1400, t);
      tone(70, 0.6, 'sine', 0.55, 32, t + 0.48);
      noise(0.5, 0.35, 260, 'lowpass', t + 0.48);
      [1568, 2093, 2637].forEach((fq, i) => tone(fq, 0.5, 'triangle', 0.1, null, t + 0.5 + i * 0.06));
    },
    coinRich() { tone(1568, 0.07, 'triangle', 0.17); tone(2349, 0.12, 'triangle', 0.14, null, now() + 0.04); tone(3136, 0.16, 'sine', 0.06, null, now() + 0.08); },
    growl(level = 0.6) { sample(Math.random() < 0.5 ? 'growl' : 'growl2', level * 0.9, 0.86 + Math.random() * 0.12); },
    roar(level = 1) { sample('roar', level, 0.9 + Math.random() * 0.06); },
    snarl(level = 1) { sample('snarl', level, 0.9 + Math.random() * 0.08); },
    // the tiger right behind you: a low double heartbeat thump under the music
    heartbeat(v = 0.5) { tone(58, 0.16, 'sine', 0.5 * v, 40); tone(52, 0.14, 'sine', 0.38 * v, 36, now() + 0.17); },
    thud() { noise(0.35, 0.55, 180, 'lowpass'); tone(70, 0.3, 'sine', 0.4, 38); },
    fall() { tone(620, 1.0, 'sine', 0.22, 80); },
    power() { tone(660, 0.25, 'sine', 0.2, 1320); },
    clack() { noise(0.05, 0.12, 1400 + Math.random() * 600, 'bandpass'); tone(95 + Math.random() * 20, 0.06, 'square', 0.04); },
    zip() { noise(1.2, 0.18, 2600, 'bandpass'); tone(1200, 1.1, 'sine', 0.05, 700); },
    meterFull() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.16, 'square', 0.07, null, now() + i * 0.07)); tone(2093, 0.4, 'triangle', 0.1, null, now() + 0.3); },
    shieldBreak() { noise(0.3, 0.35, 3000, 'highpass'); tone(880, 0.3, 'triangle', 0.15, 220); },
    click() { tone(880, 0.05, 'triangle', 0.12); },
    tick() { tone(660, 0.08, 'triangle', 0.15); },
  };
})();

// ---------------------------------------------------------------- UI
const $ = (id) => document.getElementById(id);
const ui = {
  menu: $('menu'), hud: $('hud'), pause: $('pause'), over: $('over'), revive: $('revive'), toast: $('toast'),
  dist: $('dist'), coins: $('coins'), coinsBox: $('coinsBox'), bestMenu: $('bestMenu'),
  play: $('playBtn'), skinName: $('skinName'), skinPrev: $('skinPrev'), skinNext: $('skinNext'),
  skinPrice: $('skinPrice'), shieldIco: $('shieldIco'), magnetIco: $('magnetIco'), mulIco: $('mulIco'),
  boosterTray: $('boosterTray'), dailyBtn: $('dailyBtn'),
  reviveAd: $('reviveAd'), reviveGems: $('reviveGems'), reviveCost: $('reviveCost'), reviveRing: $('reviveRing'), reviveNo: $('reviveNo'),
  doubleBtn: $('doubleBtn'), againBtn: $('againBtn'), menuBtn: $('menuBtn'),
  skinOutfit: $('skinOutfit'), levelChip: $('levelChip'), missionsBtn: $('missionsBtn'), chestBtn: $('chestBtn'), offerBtn: $('offerBtn'),
  huntMenu: $('huntMenu'), huntHud: $('huntHud'), banner: $('banner'), score: $('score'), multBadge: $('multBadge'),
  overMissions: $('overMissions'), levelUp: $('levelUp'),
};

let menuSkin = Math.max(0, HEROES.findIndex((h) => h.id === save.skin));
let libReady = false, heroLoading = false;
const priceTag = (st) => (st.cur === 'gems' ? `${ICONS.gem}${st.label}` : st.cur === 'gold' ? `${ICONS.coin}${st.label}` : st.label);
function renderMenu() {
  ui.bestMenu.textContent = save.best.toLocaleString('en');
  renderWallet(); renderBoosters(); renderHunt(); renderMeta();
  ui.dailyBtn.classList.toggle('ping', dailyReady());
  const h = HEROES[menuSkin], st = unlockState(h, prog.level, huntsCompleted());
  ui.skinName.textContent = h.name;
  ui.skinOutfit.textContent = `${h.outfit} · ${PERK_NAMES[h.perk]}`;
  if (!libReady || heroLoading || !hero) { ui.play.disabled = true; ui.play.textContent = libReady && !heroLoading ? 'Could not load' : 'Loading…'; ui.skinPrice.hidden = true; return; }
  ui.play.disabled = false;
  if (st.ok) { ui.play.textContent = 'Run!'; ui.skinPrice.hidden = true; return; }
  ui.skinPrice.hidden = false;
  ui.skinPrice.textContent = st.cur === 'lock' ? `Locked · ${h.unlock.type === 'level' ? `reach level ${h.unlock.level}` : `complete ${h.unlock.count} Relic Hunts`}`
    : st.cur === 'iap' ? 'Legend Pack exclusive' : st.note ? `Locked · ${st.note}` : 'Locked';
  ui.play.innerHTML = st.cur === 'free' ? 'Claim!' : st.cur === 'lock' ? 'Locked' : st.cur === 'iap' ? 'See Legend Pack' : `Unlock · ${priceTag(st)}`;
}
const PERK_NAMES = Object.fromEntries(Object.entries(PERKS).map(([k, v]) => [k, v.name]));
async function showSkin(i) {
  menuSkin = (i + HEROES.length) % HEROES.length;
  const want = HEROES[menuSkin];
  heroLoading = true; renderMenu();
  try { const h = await loadHero(want.model); if (HEROES[menuSkin].id === want.id) { setHero(h, want.tint); h.dropT = 0; h.landT = 0; h.cheerT = 0.2; heroRig.position.y = 3.2; } } catch (e) { console.warn('hero', e); }
  heroLoading = false; renderMenu();
}
ui.skinPrev.addEventListener('click', () => { Sound.click(); showSkin(menuSkin - 1); });
ui.skinNext.addEventListener('click', () => { Sound.click(); showSkin(menuSkin + 1); });
ui.play.addEventListener('click', () => {
  Sound.init();
  const h = HEROES[menuSkin], st = unlockState(h, prog.level, huntsCompleted());
  if (!st.ok) {
    if (st.cur === 'iap') openOffer('legend_pack');
    else if (st.can && unlock(h, prog.level, huntsCompleted())) { save.skin = h.id; persist(); Sound.gem(); banner(`${h.name} unlocked!`, h.outfit); renderMenu(); }
    else if (st.cur === 'gems' || st.cur === 'gold') openShop('gems');
    else openMissions();
    return;
  }
  save.skin = h.id; persist();
  startRun();
});

// level, missions, chests, offer — the "what's next" row on the menu
function renderMeta() {
  ui.levelChip.innerHTML = `<b>Lv ${prog.level}</b><span>×${multiplier()}</span>`;
  const done = prog.missions.filter((m) => m.done).length;
  ui.missionsBtn.querySelector('.count').textContent = `${done}/3`;
  ui.missionsBtn.classList.toggle('ping', levelReady());
  ui.chestBtn.querySelector('.count').textContent = save.chests;
  ui.chestBtn.classList.toggle('ping', save.chests > 0);
  const off = offerState();
  ui.offerBtn.hidden = !off.active;
  if (off.active) {
    const hrs = Math.floor(off.left / 3600e3), mins = Math.floor(off.left / 60e3) % 60;
    ui.offerBtn.querySelector('.left').textContent = `${hrs}h ${String(mins).padStart(2, '0')}m left`;
  }
}
function renderHunt() {
  const h = huntState();
  const html = h.word.split('').map((ch, i) => `<i class="${i < h.got.length ? 'got' : ''}">${ch}</i>`).join('');
  ui.huntMenu.innerHTML = html; ui.huntHud.innerHTML = html;
  ui.huntMenu.title = huntDoneToday() ? 'Relic Hunt complete — new letters tomorrow' : 'Relic Hunt: find one letter per run';
}
let bannerTimer = 0;
function banner(title, sub = '') {
  ui.banner.innerHTML = `<b>${title}</b>${sub ? `<small>${sub}</small>` : ''}`;
  ui.banner.hidden = false; ui.banner.classList.remove('show'); void ui.banner.offsetWidth; ui.banner.classList.add('show');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { ui.banner.hidden = true; }, 2300);
}
onMissionDone((m) => { if (p.state === 'run' || p.state === 'countdown') { banner('Mission complete!', missionText(m)); Sound.gem(); haptic(25); } });
ui.levelChip.addEventListener('click', () => { Sound.click(); openMissions(); });
ui.missionsBtn.addEventListener('click', () => { Sound.click(); openMissions(); });
ui.chestBtn.addEventListener('click', () => { Sound.click(); openChests(); });
ui.offerBtn.addEventListener('click', () => { Sound.click(); openOffer('starter_pack'); });
ui.huntMenu.addEventListener('click', () => { Sound.click(); openMissions(); });

// booster tray on the menu: tap to arm for the next run, or open the shop when empty
function renderBoosters() {
  save.equipped = save.equipped.filter((id) => (save.boosters[id] || 0) > 0);
  ui.boosterTray.innerHTML = Object.entries(BOOSTERS).map(([id, b]) => {
    const n = save.boosters[id] || 0, on = save.equipped.includes(id);
    return `<button class="boost${on ? ' on' : ''}" type="button" data-boost="${id}" aria-pressed="${on}" aria-label="${b.name}: ${n} owned">
      <span class="bi">${ICONS[id]}</span><span class="bn">${b.name}</span><span class="bc">${n > 0 ? '×' + n : '+'}</span></button>`;
  }).join('');
}
ui.boosterTray.addEventListener('click', (e) => {
  const b = e.target.closest('[data-boost]'); if (!b) return;
  const id = b.dataset.boost; Sound.click();
  if (!(save.boosters[id] > 0)) { openShop('boosters'); return; }
  save.equipped = save.equipped.includes(id) ? save.equipped.filter((x) => x !== id) : [...save.equipped, id];
  persist(); renderBoosters();
});
ui.dailyBtn.addEventListener('click', () => { Sound.click(); openDaily(); });
$('shopBtn').addEventListener('click', () => { Sound.click(); openShop('boosters'); });
$('settingsBtn').addEventListener('click', () => { Sound.click(); openSettings(); });

$('pauseBtn').addEventListener('click', () => togglePause());
$('resumeBtn').addEventListener('click', () => togglePause());
$('quitBtn').addEventListener('click', () => toMenu());

// after a run: optional interstitial at the natural break, then continue
let leaving = false;
async function leaveResults(next, skipAd = false) {
  if (leaving || Ads.busy) return; leaving = true;
  ui.againBtn.disabled = ui.menuBtn.disabled = true;
  try { if (!skipAd && interstitialDue() && Ads.enabled && (await Ads.showInterstitial('run_end'))) interstitialShown(); }
  finally { leaving = false; ui.againBtn.disabled = ui.menuBtn.disabled = false; }
  next();
}
ui.againBtn.addEventListener('click', () => { Sound.init(); leaveResults(startRun); });
ui.menuBtn.addEventListener('click', () => leaveResults(toMenu));
ui.doubleBtn.addEventListener('click', async () => {
  if (p.doubled || Ads.busy) return;
  ui.doubleBtn.disabled = true;
  const ok = await Ads.showRewarded('double_gold');
  ui.doubleBtn.disabled = false;
  if (!ok) { toastMsg('No reward this time.'); return; }
  p.doubled = true; markRewarded(); give({ gold: p.goldBanked }); Sound.gem();
  $('oCoins').textContent = (p.goldBanked * 2).toLocaleString('en');
  ui.doubleBtn.hidden = true; toastMsg(`+${p.goldBanked.toLocaleString('en')} gold`);
});

// revive card
ui.reviveAd.addEventListener('click', async () => {
  if (p.state !== 'reviveOffer' || Ads.busy) return;
  const ok = await Ads.showRewarded('revive');
  if (p.state !== 'reviveOffer') return;
  if (ok) { p.adRevived = true; markRewarded(); doRevive(); } else { toastMsg('Ad not finished.'); p.reviveTimer = Math.max(p.reviveTimer, 3); }
});
ui.reviveGems.addEventListener('click', () => {
  if (p.state !== 'reviveOffer' || Ads.busy) return;
  const cost = reviveCost(p.gemRevives);
  if (!spend('gems', cost)) { openShop('gems'); return; }
  p.gemRevives++; Sound.gem(); doRevive();
});
ui.reviveNo.addEventListener('click', () => { if (p.state === 'reviveOffer' && !Ads.busy) endRun(); });

let toastKey = null, toastAge = 0;
function showToast(text, key) { if (toastKey === key) return; toastKey = key; toastAge = 0; ui.toast.textContent = text; ui.toast.hidden = false; }
function hideToast() { toastKey = null; ui.toast.hidden = true; }
function show(layers) { for (const l of [ui.menu, ui.hud, ui.pause, ui.over, ui.revive]) l.hidden = !layers.includes(l); }

// ---------------------------------------------------------------- game flow
function newWorld() {
  rand = SEED ? mulberry32(+SEED) : Math.random;
  resetWorld();
  Object.assign(p, { segIdx: 0, d: 0, x: 0, lane: 0, y: 0, vy: 0, slide: 0, coyote: 0.2, jumpBuf: 0, speed: START_SPEED, T: 0, theta: 0,
    turnQueued: null, dist: 0, coins: 0, runTime: 0, deadTimer: 0, reason: '', pendingSlide: false, slideBuf: false, shield: false, magnet: 0,
    invuln: 0, stumble: 0, chase: 0, turns: 0, countdown: 0, landed: 0,
    boost: 0, coinMul: 1, gems: 0, power: 0, powerUses: 0, powerReady: false, powerFx: 0, powerLock: 0, adRevived: false, gemRevives: 0, deathD: 0, reviveTimer: 0, doubled: false,
    score: 0, x2: 0, mult: multiplier(), letter: null, levelUp: null, ride: null, cartLean: 0 });
  trail.length = 0;
  ensureSegments();
  camTheta = 0;
  if (tiger) { Object.assign(tiger, { dist: 30, prevDist: 30, mode: 'chase', t: 0, hold: 0, landed: false, attacking: false, done: false }); tiger.A.stopAction(); tiger.A.lookAt(null); showTiger(false); }
  look.setZone(0, true);
}
function startRun() {
  if (!libReady || !hero || p.state === 'run' || p.state === 'countdown') return;
  closeOverlays();
  const want = heroById(save.skin);
  if (HEROES[menuSkin].id !== want.id) {
    menuSkin = HEROES.indexOf(want);
    loadHero(want.model).then((h) => { setHero(h, want.tint); if (p.state === 'run' || p.state === 'countdown') playAnim('run', 0.1); }).catch((e) => console.warn('hero', e));
  }
  const ch = nextHuntLetter();
  huntSpawn = ch ? { seg: 1 + Math.floor(Math.random() * 3), ch } : null;
  newWorld();
  p.state = 'run'; p.chase = 2.2;   // the tiger bursts out of the ruins at the start, then falls back
  setTimeout(() => { if (p.state === 'run' && p.boost <= 0) Sound.roar(0.85); }, 250);
  // armed boosters are used up now
  setRunPerk(want.perk);
  // Iron Hide already starts with a shield, so a Shield Start booster stays in the bag
  const armed = save.equipped.filter((id) => (save.boosters[id] || 0) > 0 && !(id === 'shield' && want.perk === 'iron'));
  for (const id of armed) save.boosters[id]--;
  save.equipped = []; persist();
  if (armed.includes('shield') || perk() === 'iron') p.shield = true;
  p.nimble = perk() === 'nimble';
  if (armed.includes('doublegold')) p.coinMul = 2;
  newRunForAds();
  Progress.startRun(armed.length > 0);
  p.mult = multiplier() * scoreBonus();
  show([ui.hud]); hideToast();
  if (armed.includes('headstart')) { p.boost = HEADSTART_DIST; p.chase = 0; showToast('Head start!', 'boost'); }
  ui.dist.textContent = '0'; ui.coins.textContent = '0'; ui.score.textContent = '0'; ui.multBadge.textContent = `×${+p.mult.toFixed(1)}`;
  renderHunt(); ui.banner.hidden = true;
  renderPowerUI(); ui.shieldIco.hidden = !p.shield; bubble.visible = p.shield; ui.magnetIco.hidden = true; ui.mulIco.hidden = p.coinMul === 1;
  playAnim('run', 0.1);
  Sound.idol(false); Sound.music(ZONE_MUSIC[0], 1.2); Sound.duck(1, 0.4);
  snapCamera = true;
}
function toMenu() {
  setRunPerk(null);
  Sound.idol(false); Sound.music('menu', 1.5); Sound.duck(1, 0.8); huntSpawn = null; newWorld();
  p.state = 'menu'; show([ui.menu]); hideToast();
  showSkin(menuSkin); playAnim('idle', 0.2);
  snapCamera = true;
  if (offerState().fresh && !AUTOSTART) setTimeout(() => { if (p.state === 'menu' && !overlayOpen()) openOffer('starter_pack'); }, 500);
}
function togglePause() {
  if (p.state === 'run') { p.state = 'paused'; show([ui.hud, ui.pause]); Sound.duck(0.15, 0.3); }
  else if (p.state === 'paused') { p.state = 'countdown'; p.countdown = 2.4; show([ui.hud]); Sound.init(); }
}
// browsers only allow sound after a tap: the first one anywhere starts the menu theme
// Music from the very first frame. The Android app allows that straight away; a browser keeps audio locked
// until the first touch / click / key, so every gesture retries until sound is actually running.
const unlockAudio = () => {
  Sound.init();
  if (!Sound.current() && (p.state === 'menu' || p.state === 'over' || p.state === 'loading')) Sound.music('menu', 1.2);
  Sound.kick();
  if (Sound.running()) for (const ev of ['pointerdown', 'touchend', 'keydown', 'click']) removeEventListener(ev, unlockAudio, true);
};
for (const ev of ['pointerdown', 'touchend', 'keydown', 'click']) addEventListener(ev, unlockAudio, true);
function startMenuMusic() { Sound.init(); if (!Sound.current()) Sound.music('menu', 1.5); }
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (p.state === 'run' || p.state === 'countdown') { p.state = 'run'; togglePause(); } Sound.suspend(); }
  else if (!Ads.busy) Sound.resume();
});

function hitObstacle(ob) {
  if (p.invuln > 0 || p.boost > 0) return;
  if (p.shield) {
    p.shield = false; p.invuln = 1.0; ob.hit = true; ui.shieldIco.hidden = true; bubble.visible = false;
    Sound.shieldBreak(); haptic(40); shake = 0.25;
    return;
  }
  if (ob.type === 'low') {
    // Tripping over a log: the tiger closes in. Trip again while it is close and it catches you.
    if (p.chase > 0) { caught(); return; }
    ob.hit = true; p.stumble = STUMBLE_TIME; p.invuln = 0.5; Progress.ev('stumble');
    if (p.nimble) { p.nimble = false; banner('Light Feet', 'The tiger didn\'t notice'); } else { p.chase = CHASE_TIME; if (tiger) tiger.growlT = 0.35; }
    playAnim('hit', 0.06, (hero && hero.dur.hit ? hero.dur.hit : 0.5) / STUMBLE_TIME);
    Sound.stumble(); haptic(50); shake = 0.3;
    return;
  }
  p.state = 'crashed'; p.reason = 'crash'; p.deadTimer = 0; p.deathD = p.d;
  playAnim('death', 0.08);
  Sound.crash(); haptic([60, 40, 90]); shake = 0.55; Sound.idol(false); Sound.duck(0.3, 0.8);
}
function caught() {
  p.state = 'crashed'; p.reason = 'caught'; p.deadTimer = 0; p.chase = CHASE_TIME; p.deathD = p.d;
  playAnim('death', 0.08); Sound.snarl(1); haptic([80, 40, 120]); shake = 0.5; Sound.idol(false); Sound.duck(0.3, 0.8);
}
function fall() {
  p.state = 'falling'; p.reason = 'fall'; p.deadTimer = 0; p.deathD = p.d;
  playAnim('jumpLoop', 0.12, 1.2);
  Sound.fall(); haptic(80); Sound.idol(false); Sound.duck(0.3, 0.8);
}

// ---------------------------------------------------------------- revive
function offerRevive() {
  const canAd = !p.adRevived && Ads.rewardedAvailable();
  const cost = reviveCost(p.gemRevives);
  if (AUTOPILOT || (!canAd && save.gems < cost)) { endRun(); return; }
  p.state = 'reviveOffer'; p.reviveTimer = REVIVE_WINDOW;
  ui.reviveAd.hidden = !canAd;
  ui.reviveCost.textContent = cost;
  ui.reviveGems.classList.toggle('short', save.gems < cost);
  show([ui.hud, ui.revive]); hideToast();
}
function doRevive() {
  const seg = cur();
  if (p.reason === 'fall') {
    if (p.deathD > seg.length) {            // missed a turn: put the runner back on the corner and take it
      p.d = seg.length + J / 2; p.x = 0; p.lane = 0; p.y = 0; p.turnQueued = seg.turn; doTurn();
    } else {                                // fell into a gap: land on the far side
      const g = [...seg.gaps, ...seg.laneGaps].find((q) => p.deathD > q.d0 - 1.5 && p.deathD < q.d1 + 1.5);
      p.d = g ? g.d1 + 1 : p.deathD; p.x = p.lane * LANE;
    }
  } else p.d = p.deathD;
  const s = cur();
  for (const ob of s.obstacles) if (ob.d > p.d - 2 && ob.d < p.d + 4) ob.hit = true;
  const rd = s.ride;   // back in the cart if it happened down the mine
  p.ride = rd && rd.kind === 'cart' && p.d > rd.d0 && p.d < rd.d1 - 3 ? { kind: 'cart', rd, t: 1 } : null;
  Object.assign(p, { y: 0, vy: 0, slide: 0, stumble: 0, chase: 0, invuln: 3, pendingSlide: false, slideBuf: false, jumpBuf: 0, turnQueued: null,
    reason: '', deadTimer: 0, coyote: 0.2 });
  if (tiger) tiger.dist = 18;
  p.state = 'countdown'; p.countdown = 2.4;
  show([ui.hud]); playAnim('run', 0); snapCamera = true;
  haptic(30);
}
// The run is over. A runner who crashed or was caught gets the tiger's charge -> leap -> grab; nothing can
// catch a runner who fell into a gap or off the path, so that goes straight to the results.
function endRun() {
  if (p.state === 'pounce' || p.state === 'over') return;
  if (!tiger || p.reason === 'fall') { gameOver(); return; }
  p.state = 'pounce'; show([ui.hud]); hideToast(); ui.banner.hidden = true;
  const T = tiger, A = T.A;
  Object.assign(T, { mode: 'attack', t: 0, hold: 0, landed: false, attacking: false, done: false });
  if (!T.visible) {                         // bring it in from behind if it had dropped back
    trailAt(Math.min(T.dist, 6), tigerPos);
    const ahead = trailAt(Math.min(T.dist, 6) - 1, tmpTrail);
    A.motion.reset(tmpV.copy(tigerPos).divideScalar(TIGER_SCALE).setY(0), Math.atan2(tmpTrail.x - tigerPos.x, tmpTrail.z - tigerPos.z) || 0);
    if (ahead === null) A.motion.reset(tmpV.set(heroPos.x, 0, heroPos.z + 6).divideScalar(TIGER_SCALE), Math.PI);
    showTiger(true);
  }
  // aim the tiger's chest at the runner's chest: a fallen runner lies back toward the tiger, about 0.65 m
  // behind their feet, and the tiger's own chest is ~0.6 m ahead of its centre, so it lands short of the feet
  tmpV.set(T.pos.x - heroPos.x, 0, T.pos.z - heroPos.z);
  if (tmpV.lengthSq() < 0.25) tmpV.set(Math.sin(p.theta), 0, Math.cos(p.theta));
  tmpV.normalize();
  T.target.set(heroPos.x + tmpV.x * 1.25, 0, heroPos.z + tmpV.z * 1.25).divideScalar(TIGER_SCALE);
  T.look.set(heroPos.x + tmpV.x * 0.6, 0.3, heroPos.z + tmpV.z * 0.6).divideScalar(TIGER_SCALE);
  A.lookAt(T.look);
  // a burst and a leap timed to land on the runner, then the grab
  T.attacking = true;
  A.move({ speed: 0, heading: Math.atan2(T.target.x - A.position.x, T.target.z - A.position.z) });   // leave follow mode
  // the charge speed sets the leap length: full speed with a long run-up, a shorter, slower bound when it is
  // already close, so it always comes down on the runner (vendor lion behaviour, opts.chargeSpeed)
  const room = Math.hypot(T.target.x - A.position.x, T.target.z - A.position.z);   // tiger-space metres
  A.motion.speed = Math.max(A.motion.speed, 3.6 * (A.motion.cfg.sk || 1));
  const chargeSpeed = room > 5.2 ? undefined : Math.max(2, room);
  A.play('attack', { target: T.target, speed: 1.35, chargeSpeed }).then(() => { T.done = true; });
  Sound.roar(1); haptic([40, 30, 60]);
}
function updatePounce(dt) {
  const T = tiger, A = T.A;
  T.t += dt;
  A.update(dt); syncTigerPos();
  if (T.landed || T.done || T.t > 4.2) { T.hold += dt; if (T.hold > (T.landed ? 1.0 : 0.3) || T.t > 5.5) gameOver(); }
}
function gameOver() {
  p.state = 'over';
  Sound.idol(false); Sound.music('menu', 2.5); Sound.duck(0.8, 2);
  const dist = Math.floor(p.dist), score = Math.floor(p.score);
  const isBest = score > save.best;
  if (isBest) save.best = score;
  const gm = goldMultiplier(), gold = Math.round(p.coins * gm);
  save.bank += gold; save.gems += p.gems; save.runs++;
  persist();
  Progress.endRun({ dist, coins: p.coins, score });
  renderMissionList(ui.overMissions, { compact: true });   // show this run's missions (ticked) before new ones replace them
  p.levelUp = levelReady() ? Progress.levelUp() : null;
  p.goldBanked = gold;
  const copy = { fall: ['You fell!', 'Swipe toward the torches to turn.'], caught: ['Caught!', 'Trip twice and the tiger gets you.'], crash: ['Crashed!', 'The ruins win this time.'] }[p.reason] || ['Crashed!', ''];
  $('overTitle').textContent = copy[0]; $('overSub').textContent = copy[1];
  $('oDist').textContent = dist.toLocaleString('en') + ' m';
  $('oCoins').textContent = gold.toLocaleString('en') + (gm > 1 ? ` (×${+gm.toFixed(2)})` : '');
  $('oGemsRow').hidden = p.gems === 0; $('oGems').textContent = p.gems;
  $('oScore').textContent = score.toLocaleString('en');
  $('oMult').textContent = `×${+p.mult.toFixed(1)}`;
  $('oBest').textContent = save.best.toLocaleString('en');
  $('newBest').hidden = !isBest;
  if (p.levelUp) {
    const r = p.levelUp.reward;
    ui.levelUp.innerHTML = `<b>Level ${p.levelUp.level}!</b><span>Score multiplier ×${multiplier()} · +${r.gold} gold${r.gems ? ` · +${r.gems} gems` : ''} · +1 relic chest · 3 new missions</span>`;
    ui.levelUp.hidden = false; Sound.gem();
  } else ui.levelUp.hidden = true;
  renderNextUnlock();
  ui.doubleBtn.hidden = !(p.coins >= 20 && Ads.rewardedAvailable());
  ui.doubleBtn.disabled = false;
  show([ui.over]); hideToast(); ui.banner.hidden = true;
  window.__lastRun = { dist, coins: p.coins, gold, gems: p.gems, score, mult: p.mult, reason: p.reason, turns: p.turns, time: +p.runTime.toFixed(1), level: prog.level };
}

// "what's next" on the results card: the closest explorer you can earn by playing
function renderNextUnlock() {
  const el = $('nextUnlock'); let best = null;
  for (const h of HEROES) {
    if (save.owned.includes(h.id)) continue;
    const u = h.unlock; let have = 0, need = 0, text = '';
    if (u.type === 'level') { have = prog.level; need = u.level; text = `level ${u.level}`; }
    else if (u.type === 'gold') { have = save.bank; need = u.price; text = `${u.price.toLocaleString('en')} gold`; }
    else if (u.type === 'hunt') { have = huntsCompleted(); need = u.count; text = `${u.count} Relic Hunts`; }
    else continue;
    const f = Math.min(1, have / need);
    if (!best || f > best.f) best = { h, f, text };
  }
  el.hidden = !best;
  if (best) el.innerHTML = best.f >= 1 ? `<b>${best.h.name} · ${best.h.outfit}</b> is ready to unlock!`
    : `Next: <b>${best.h.name} · ${best.h.outfit}</b> at ${best.text} <i><span style="width:${(best.f * 100).toFixed(0)}%"></span></i>`;
}

// ---------------------------------------------------------------- simulation
function step(dt) {
  const seg = cur();
  p.runTime += dt;
  p.speed = p.boost > 0 ? BOOST_SPEED : speedAt(p.dist) * (p.stumble > 0 ? 0.6 : 1) * (p.ride ? (p.ride.kind === 'zip' ? 1.18 : 1.12) : 1);
  p.d += p.speed * dt; p.dist += p.speed * dt;
  p.score += p.speed * dt * p.mult;
  if (p.powerLock > 0) p.powerLock -= dt;
  if (p.x2 > 0) { p.x2 -= dt; if (p.x2 <= 0) ui.mulIco.hidden = p.coinMul === 1; }
  if (p.boost > 0) {
    // head start: centre lane, auto-turns, coins pulled in, nothing can hurt
    p.boost -= p.speed * dt; p.lane = 0; p.chase = 0;
    if (cornerOffset(seg) >= TURN_EXEC - 2 && !p.turnQueued) p.turnQueued = seg.turn;
    if (p.boost <= 0) {
      // never drop the runner just before a hole: fly on until the road ahead is solid
      let clear = true;
      for (let k = 0; k <= p.speed * 0.6 + 9; k += 0.5) if (p.d + k <= seg.length && !isGround(seg, p.d + k, 0)) { clear = false; break; }
      if (seg.length + J / 2 - p.d < p.speed * 1.3 + 6) clear = false;   // ...and never just before a corner
      if (!clear) p.boost = 4;
      else { p.boost = 0; p.invuln = 1.5; if (toastKey === 'boost') hideToast(); }
    }
  }
  const laneX = p.ride ? (p.ride.kind === 'zip' ? p.lane * ZIP_SWING : 0) : p.lane * LANE;
  p.x += (laneX - p.x) * Math.min(1, dt * (p.ride && p.ride.kind === 'zip' ? 5 : 13));
  if (p.invuln > 0) p.invuln -= dt;
  if (p.stumble > 0) p.stumble -= dt;
  if (p.chase > 0) p.chase -= dt;
  if (p.jumpBuf > 0) p.jumpBuf -= dt;
  if (p.magnet > 0) { p.magnet -= dt; if (p.magnet <= 0) ui.magnetIco.hidden = true; }
  const magnetOn = p.magnet > 0 || p.boost > 0;

  // turning: a queued press fires near the centre; a late press still counts until the runner drops
  let a = cornerOffset(seg);
  if (p.turnQueued && a >= TURN_EXEC) { if (a <= turnLate(p.speed)) doTurn(); else p.turnQueued = null; }
  const s = cur();

  // set pieces: grab the zipline / hop into the mine cart at the start, let go / hop out at the end
  const rd = s.ride;
  if (!p.ride && rd && p.boost <= 0 && p.d >= rd.d0 && p.d < rd.d0 + 4) startRide(rd);
  if (p.ride) {
    const R = p.ride; R.t += dt;
    if (R.kind === 'zip') {
      const target = zipRopeY(R.rd, p.d) - ZIP_HANG;
      p.y = R.t < 0.3 ? p.y + (target - p.y) * Math.min(1, dt * 14) : target; p.vy = 0; p.slide = 0; p.coyote = 0;
      p.chase = 0; if (tiger) tiger.dist = Math.max(tiger.dist, 30);
      if (p.d >= R.rd.d1 - 1.0) { p.ride = null; p.vy = 4.5; Sound.jump(); }
    } else {
      p.lane = 0; p.cartLean *= Math.exp(-dt * 5);
      if ((p.clack -= dt) <= 0) { p.clack = 0.2 + Math.random() * 0.06; Sound.clack(); }
      if (p.y <= 0.001) shake = Math.max(shake, 0.06);
      if (p.d >= R.rd.d1 - 0.4) { p.ride = null; if (s.cart) s.cart.position.set(0, 0, -(R.rd.d1 + 1.2)); doJump(); p.vy *= 0.8; }
    }
  }
  // vertical motion, coyote time, jump buffer
  const zipping = p.ride && p.ride.kind === 'zip';
  const ground = zipping || isGround(s, p.d, p.x) || (p.boost > 0 && p.d <= s.length);
  const wasAir = p.y > 0.001 || p.vy > 0;
  if (!zipping && (p.y > 0 || p.vy > 0 || !ground)) { p.vy += GRAVITY * dt; p.y += p.vy * dt; }
  if (zipping) { /* hanging from the rope */ }
  else if (ground && p.y <= 0 && p.y > -0.45) {
    if (wasAir && p.vy < -1) { p.landed = 1; if (p.pendingSlide) startSlide(); }
    p.pendingSlide = false; p.y = 0; p.vy = 0; p.coyote = 0.12;
    if (p.jumpBuf > 0) doJump();
  } else {
    p.coyote -= dt;
    if (p.y <= -0.45) { fall(); return; }
  }
  if (p.slide > 0) { p.slide -= dt; if (p.slide <= 0 && p.slideBuf && p.y <= 0.05) startSlide(); }

  // obstacles
  const h = p.slide > 0 ? H_SLIDE : H_RUN;
  for (const ob of s.obstacles) {
    if (ob.hit) continue;
    const dd = ob.d - p.d; if (dd < -1.4 || dd > 1.4) continue;
    let hit = false;
    if (ob.type === 'low') hit = Math.abs(dd) < 0.45 + PD && p.y < 0.8;
    else if (ob.type === 'high') hit = Math.abs(dd) < 0.5 + PD && p.y + h > 1.05;
    else if (ob.type === 'block') hit = Math.abs(dd) < 0.62 + PD && p.y < 2.5 && ob.lanes.some((ln) => Math.abs(p.x - ln * LANE) < 0.85 + PW);
    if (hit) { hitObstacle(ob); if (p.state !== 'run') return; }
  }

  // pickups (the magnet pulls nearby coins in first)
  const py = p.y + 0.9;
  if (magnetOn) {
    const k = Math.min(1, dt * (p.boost > 0 ? 30 : 9));
    for (const c of s.coins) if (!c.taken && c.d - p.d > -1 && c.d - p.d < (p.boost > 0 ? 30 : 12)) { c.d += (p.d + 0.3 - c.d) * k; c.x += (p.x - c.x) * k; c.y += (py - c.y) * k; }
  }
  for (const c of s.coins) {
    if (c.taken || Math.abs(c.d - p.d) > 1.0) continue;
    if (Math.abs(c.x - p.x) < 1.0 && Math.abs(c.y - py) < 1.3) { const amt = (c.v || 1) * p.coinMul * (p.x2 > 0 ? 2 : 1); c.taken = true; p.coins += amt; addPower(c.v || 1); p.score += 5 * p.mult; Progress.ev('coin', amt); if (amt > 1) Sound.coinRich(); else Sound.coin(); sparkleAt(s, c.d, c.x, c.y); bumpCoins(); }
  }
  for (const g of s.gems) {
    if (g.taken || Math.abs(g.d - p.d) > 1.0) continue;
    if (Math.abs(g.lane * LANE - p.x) < 1.0 && py < 2.2) { g.taken = true; g.mesh.visible = false; p.gems++; p.score += 250 * p.mult; Progress.ev('gem'); Sound.gem(); showToast('+1 gem', 'gem' + g.d); haptic(20); sparkleAt(s, g.d, g.lane * LANE, 1.0, 6); bumpCoins(); }
  }
  for (const pu of s.powerups) {
    if (pu.taken || Math.abs(pu.d - p.d) > 1.0) continue;
    if (Math.abs(pu.lane * LANE - p.x) < 1.1 && py < 2.6) {
      pu.taken = true; pu.mesh.visible = false; pu.halo.visible = false; Sound.power(); haptic(20); sparkleAt(s, pu.d, pu.lane * LANE, 1.2, 5);
      Progress.ev('powerup');
      if (pu.kind === 'shield') { p.shield = true; bubble.visible = true; ui.shieldIco.hidden = false; }
      else if (pu.kind === 'magnet') { p.magnet = magnetTime(); ui.magnetIco.hidden = false; }
      else if (pu.kind === 'x2') { p.x2 = 12; ui.mulIco.hidden = false; banner('2× gold!', '12 seconds'); }
      else { p.boost = Math.max(p.boost, dashDistance()); p.chase = 0; banner('Idol Dash!', `${Math.round(dashDistance())} m of flight`); }
    }
  }
  // Relic Hunt letter
  const L0 = s.letter;
  if (L0 && !L0.taken && Math.abs(L0.d - p.d) < 1.2 && (p.boost > 0 || Math.abs(L0.lane * LANE - p.x) < 1.2) && py < 2.8 + p.hover) {
    L0.taken = true; L0.mesh.visible = false; L0.halo.visible = false; sparkleAt(s, L0.d, L0.lane * LANE, 1.3, 8);
    const got = collectHuntLetter();
    if (got) {
      Progress.ev('letter'); Sound.gem(); haptic(30); renderHunt();
      banner(got.complete ? 'Relic Hunt complete!' : `Letter ${got.letter} found`, got.complete ? '+3 gems & a relic chest' : `${huntState().got.length}/5 for today's hunt`);
    }
  }
  // zones
  const z = zoneOf(p.dist);
  if (z !== look.zone) { look.setZone(z); Sound.music(ZONE_MUSIC[z], 3); 
    const lap = lapOf(p.dist);
    banner(ZONES[z].name, z === 0 && lap > 0 ? `Lap ${lap + 1} · faster than ever` : `Zone ${Math.floor(p.dist / ZONE_LEN) + 1}${lap > 0 ? ` · Lap ${lap + 1}` : ''}`);
  }
  Progress.ev('dist', p.dist);
}
function startRide(rd) {
  p.ride = { kind: rd.kind, rd, t: 0 }; p.slide = 0; p.slideBuf = false; p.pendingSlide = false; p.jumpBuf = 0;
  if (rd.kind === 'zip') { Sound.jump(); Sound.zip(); p.lane = clamp(p.lane, -1, 1); Progress.ev('zip'); if ((save.zipHints || 0) < 2) { save.zipHints = (save.zipHints || 0) + 1; persist(); showToast('Swing ← → for the gold!', 'zip'); } }
  else { Sound.thud(); p.lane = 0; p.clack = 0; Progress.ev('cart'); if ((save.cartHints || 0) < 2) { save.cartHints = (save.cartHints || 0) + 1; persist(); showToast('Mine cart! ↑ jump the gaps · ↓ duck', 'cart'); } }
}
// ---------------------------------------------------------------- power meter (fills with coins; double-tap to fire)
const POWERS = {
  boost: { name: 'Boost', sub: 'Dash ahead, invincible', icon: '<path d="M13 2L4 14h6l-1 8 9-12h-6z" fill="#ffd34d"/>' },
  shield: { name: 'Shield', sub: 'Shrugs off one hit', icon: '<path d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5z" fill="#8fd3ff"/>' },
  magnet: { name: 'Magnet', sub: 'Pulls in every coin', icon: '<path d="M5 3h4v8a3 3 0 0 0 6 0V3h4v8a7 7 0 0 1-14 0z" fill="#ff7a6b"/><path d="M5 3h4v3H5zM15 3h4v3h-4z" fill="#e8eef2"/>' },
  bonus: { name: 'Coin Bonus', sub: 'A burst of gold', icon: '<circle cx="12" cy="12" r="8" fill="#ffc93c"/><circle cx="12" cy="12" r="5" fill="none" stroke="#b97a12" stroke-width="1.6"/>' },
};
const POWER_KEYS = Object.keys(POWERS);
const powerKind = () => (POWERS[save.power] ? save.power : 'boost');
const powerCap = () => Math.min(400, 100 + 60 * p.powerUses);   // ~100 coins for the first, then slower each time
const powerBtn = document.getElementById('powerBtn'), powerChip = document.getElementById('powerChip');
function renderPowerUI() {
  const P = POWERS[powerKind()];
  if (powerBtn) { powerBtn.querySelector('svg').innerHTML = P.icon; powerBtn.setAttribute('aria-label', `Use ${P.name}`); }
  if (powerChip) powerChip.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${P.icon}</svg><span>${P.name}</span>`;
  updatePowerHud();
}
function updatePowerHud() {
  if (!powerBtn) return;
  powerBtn.style.setProperty('--f', Math.min(1, p.power / powerCap()).toFixed(3));
  powerBtn.classList.toggle('ready', p.powerReady);
}
function addPower(n) {
  // nothing fills the meter while a power (or any boost / magnet) is running: no instant refills
  if (p.powerReady || p.state !== 'run' || p.boost > 0 || p.magnet > 0 || p.powerLock > 0) return;
  p.power += n;
  if (p.power >= powerCap()) {
    p.power = powerCap(); p.powerReady = true; Sound.meterFull(); haptic(20);
    if ((save.powerHints || 0) < 3) { save.powerHints = (save.powerHints || 0) + 1; persist(); showToast(`Double-tap: ${POWERS[powerKind()].name}!`, 'power'); }
  }
  updatePowerHud();
}
function activatePower() {
  if (!p.powerReady || p.state !== 'run') return false;
  const kind = powerKind(), P = POWERS[kind];
  p.powerReady = false; p.power = 0; p.powerUses++; p.powerFx = 0.6; p.powerLock = 6;
  if (kind === 'boost') { p.boost = Math.max(p.boost, 110 + 15 * Math.min(4, p.powerUses)); p.chase = 0; banner('Boost!', `${Math.round(p.boost)} m`); }
  else if (kind === 'shield') { p.shield = true; bubble.visible = true; ui.shieldIco.hidden = false; Sound.power(); banner('Shield!', 'one free hit'); }
  else if (kind === 'magnet') { p.magnet = magnetTime() + 3; ui.magnetIco.hidden = false; Sound.power(); banner('Magnet!', `${Math.round(p.magnet)} seconds`); }
  else { const n = 25 + 15 * Math.min(5, p.powerUses); p.coins += n; Progress.ev('coin', n); Sound.gem(); bumpCoins(); banner(`+${n} coins!`, 'Coin Bonus'); }
  if (toastKey === 'power') hideToast();
  haptic([20, 30, 40]); Progress.ev('power');
  updatePowerHud();
  return true;
}
if (powerBtn) powerBtn.addEventListener('click', () => activatePower());
if (powerChip) powerChip.addEventListener('click', () => {
  save.power = POWER_KEYS[(POWER_KEYS.indexOf(powerKind()) + 1) % POWER_KEYS.length]; persist(); Sound.click(); renderPowerUI();
  showToast(`Power: ${POWERS[save.power].name} — ${POWERS[save.power].sub}`, 'powerpick');
});
function bumpCoins() { ui.coins.textContent = p.coins; ui.coinsBox.classList.remove('pop'); void ui.coinsBox.offsetWidth; ui.coinsBox.classList.add('pop'); }
function deathStep(dt) {
  p.deadTimer += dt;
  if (p.state === 'crashed') { p.d += Math.max(0, 4 - p.deadTimer * 10) * dt; if (p.y > 0) { p.vy += GRAVITY * dt; p.y = Math.max(0, p.y + p.vy * dt); } }
  else { p.d += p.speed * 0.45 * dt; p.vy += GRAVITY * dt; p.y += p.vy * dt; }
  if (p.deadTimer > 1.3) offerRevive();
}

// ---------------------------------------------------------------- autopilot (testing / screenshots)
function autopilot() {
  if (p.boost > 0) return;
  const seg = cur(); const a = cornerOffset(seg);
  if (a > -8 && a < -2 && !p.turnQueued) handleSwipe(seg.turn === 'L' ? 'left' : 'right');
  const look = p.speed * 0.33 + 0.9;
  let best = null;
  for (const ob of seg.obstacles) { const dd = ob.d - p.d; if (!ob.hit && dd > -0.6 && dd < look + 9 && (!best || ob.d < best.d)) best = ob; }
  if (!best) return;
  const dd = best.d - p.d;
  if (best.type === 'block' || best.type === 'lanegap') {
    if (best.lanes.includes(p.lane)) {
      const free = [-1, 0, 1].filter((l) => !best.lanes.includes(l)).sort((x, y) => Math.abs(x - p.lane) - Math.abs(y - p.lane))[0];
      if (free !== undefined) handleSwipe(free < p.lane ? 'left' : 'right');
    }
  } else if (dd < look) {
    if ((best.type === 'low' || best.type === 'gap') && p.y <= 0.001) handleSwipe('up');
    if (best.type === 'high' && (p.y > 0.05 || p.slide <= 0.15)) handleSwipe('down');
  }
}

// ---------------------------------------------------------------- tutorial hints
function updateTutorial() {
  if (p.boost > 0) { if (toastKey && toastKey !== 'boost' && toastAge > 1) hideToast(); return; }
  if (toastKey === 'boost' || (toastKey && toastKey.startsWith('gem') && toastAge < 1)) return;
  const seg = cur(); const a = cornerOffset(seg);
  if (save.tutorial < 3 && a > -28 && a < J / 2) { showToast(seg.turn === 'L' ? '← Swipe left to turn' : 'Swipe right to turn →', 'turn' + seg.idx); return; }
  if (seg.idx === 0 && save.runs === 0) {
    const next = seg.obstacles.find((o) => o.d > p.d - 1);
    if (next && next.d - p.d < 16) {
      showToast(next.type === 'low' || next.type === 'gap' ? 'Swipe ↑ to jump' : next.type === 'high' ? 'Swipe ↓ to slide' : 'Swipe ← → to dodge', 'ob' + next.d);
      return;
    }
  }
  if (toastKey) hideToast();
}

// ---------------------------------------------------------------- effects
const sparkles = [];
for (let i = 0; i < 48; i++) { const s = new THREE.Sprite(M.sparkle.clone()); s.visible = false; scene.add(s); sparkles.push({ s, t: 1 }); }
let sparkIdx = 0;
const SPARK_GOLD = new THREE.Color(0xffe08a);
function sparkleAt(seg, d, x, y, n = 1, color = SPARK_GOLD, life = 0.35) {
  for (let k = 0; k < n; k++) {
    const sp = sparkles[sparkIdx++ % sparkles.length];
    worldAt(seg, d, x + (k ? (Math.random() - 0.5) * 1.2 : 0), y + (k ? Math.random() - 0.4 : 0), sp.s.position);
    sp.t = 0; sp.life = life; sp.s.visible = true; sp.s.material.color.copy(color);
  }
}
const trailColor = new THREE.Color(), camFwd = new THREE.Vector3();
let trailTick = 0; const trailCache = { id: null, t: null };
const DUST = 140, dustPos = new Float32Array(DUST * 3);
for (let i = 0; i < DUST; i++) { dustPos[i * 3] = (Math.random() - 0.5) * 40; dustPos[i * 3 + 1] = Math.random() * 14 - 3; dustPos[i * 3 + 2] = (Math.random() - 0.5) * 40; }
const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ map: glowTex, color: 0xffe2a8, size: 0.16, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
dust.frustumCulled = false; scene.add(dust);

// The tiger follows the runner's own trail, so it rounds corners exactly where the runner did.
const trail = [];
function recordTrail(pos, yaw) {
  const lastT = trail[trail.length - 1];
  if (lastT && lastT.pos.distanceToSquared(pos) < 0.09) return;
  trail.push({ pos: pos.clone(), yaw, s: p.dist });
  if (trail.length > 400) trail.shift();
}
function trailAt(sBack, outPos) {
  const target = p.dist - sBack;
  for (let i = trail.length - 1; i > 0; i--) {
    if (trail[i - 1].s <= target) { const a = trail[i - 1], b = trail[i]; const t = clamp((target - a.s) / Math.max(1e-6, b.s - a.s), 0, 1); outPos.lerpVectors(a.pos, b.pos, t); return lerp(a.yaw, b.yaw, t); }
  }
  if (trail.length) { outPos.copy(trail[0].pos); return trail[0].yaw; }
  return null;
}

// ---------------------------------------------------------------- camera & visuals
let camTheta = 0, camRoll = 0, camDip = 0, shake = 0, snapCamera = true, time = 0;
const tmpTrail = new THREE.Vector3();
const heroPos = new THREE.Vector3(), camTarget = new THREE.Vector3(), lookTarget = new THREE.Vector3(), lookCur = new THREE.Vector3();
const coinQ = new THREE.Quaternion(), coinS = new THREE.Vector3(1, 1, 1), coinZero = new THREE.Vector3(0, 0, 0), tigerPos = new THREE.Vector3();

let lookMats = null;
const tmpCol = new THREE.Color();
const SHAFT_OP = [0.16, 0.2, 0.12, 0.035], SHAFT_COL = [0xffe2a8, 0xf4ffd0, 0xffb27a, 0x9fb8ff];
let heartT = 0, tempoT = 0;
function updateVisuals(dt) {
  SC.update(dt); PR.update(dt);
  if ((tempoT -= dt) <= 0) {   // music speeds up with the runner: up to +14% at top speed
    tempoT = 0.25;
    const k = p.state === 'run' || p.state === 'paused' || p.state === 'countdown' ? clamp((speedAt(p.dist) - START_SPEED) / (40 - START_SPEED), 0, 1) : 0;
    Sound.tempo(1 + 0.14 * k);
  }
  // danger pulse: the closer the tiger, the faster and louder the heartbeat
  if (p.state === 'run' && tiger && tiger.visible && tiger.dist < 9) {
    if ((heartT -= dt) <= 0) { const k = clamp(1 - (tiger.dist - 2) / 7, 0, 1); Sound.heartbeat(0.45 + 0.55 * k); heartT = 0.62 - 0.22 * k; }
  } else heartT = 0;
  { const z = look.zone || 0, m = SC.M.shaft; m.opacity += (SHAFT_OP[z] - m.opacity) * damp(0.6, dt); m.color.lerp(tmpCol.setHex(SHAFT_COL[z]), damp(0.6, dt)); }
  lookMats ||= { path: M.path, wall: M.wall, canopy: M.canopy, dust: dust.material, renderer, forward: null };
  const seg = cur(); if (!seg) return;
  worldAt(seg, p.d, p.x, p.y, heroPos);
  const targetTheta = p.T * Math.PI / 2;
  p.theta += (targetTheta - p.theta) * damp(16, dt);
  heroRoot.position.copy(heroPos);
  // lean: forward with speed, into lane changes (bank + a glance the way it is going)
  let bank = 0, glance = 0;
  if (hero) {
    const vx = p.state === 'run' && dt > 0 ? (p.x - hero.lastX) / dt : 0; hero.lastX = p.x;
    hero.leanZ += (clamp(-vx * 0.035, -0.26, 0.26) - hero.leanZ) * damp(12, dt);
    hero.yawLean += (clamp(-vx * 0.03, -0.3, 0.3) - hero.yawLean) * damp(10, dt);
    bank = hero.leanZ; glance = hero.yawLean;
  }
  heroRoot.rotation.set(p.state === 'run' ? -(0.05 + (p.speed - START_SPEED) * 0.006) : 0, -p.theta + glance, (p.stumble > 0 ? Math.sin(time * 30) * 0.12 : 0) + bank);
  if (p.state === 'run' || p.state === 'countdown') recordTrail(tmpTrail.copy(heroPos).setY(0), p.theta);

  if (hero) {
    if (p.state === 'run') {
      const air = p.y > 0.05 && !p.pendingSlide;
      if (hero.wasAir && !air) hero.landT = 0.24;            // touch-down: a quick landing crouch, then running again
      hero.wasAir = air; hero.landT -= dt;
      if (p.stumble > 0 && hero.actions.hit) { /* hit clip already playing */ }
      else if (p.ride && p.ride.kind === 'zip') playAnim('jumpLoop', 0.15, 0.6, 0.2);   // hanging from the grip
      else if (p.ride) playAnim('idle', 0.15);                                           // riding the cart
      else if (air) {
        // KayKit: take-off clip while rising, then the airborne loop; UAL: its airborne loop the whole way
        if (hero.kk && p.vy > 2) playAnim('jumpStart', 0.06, (hero.dur.jumpStart || 0.6) / (AIRTIME * 0.5), 0.15);
        else playAnim('jumpLoop', hero.kk ? 0.12 : 0.08, 1.15, hero.kk ? 0 : 0.1);
      }
      else if (p.slide > 0 || p.pendingSlide) {
        // every new slide plays the roll from the start, even when swiped again mid-roll
        const again = hero.rollSeq !== p.slideSeq; hero.rollSeq = p.slideSeq;
        playAnim('roll', 0.06, (hero.dur.roll || 1) / SLIDE_TIME, 0, again && p.slide > 0);
      }
      else if (hero.landT > 0) playAnim('jumpLand', 0.05, (hero.dur.jumpLand || 0.6) / 0.42);
      else playAnim('run', 0.12, (Math.min(p.speed, 28) / hero.stride) * (hero.dur.run || 0.8));
    } else if (p.state === 'menu') {
      // menu: a newly picked explorer drops in from above (falling pose -> landing crouch -> idle);
      // the KayKit heroes then cheer now and then
      const DROP = 0.42;
      if (hero.dropT < DROP) {
        hero.dropT += dt; const k = Math.min(1, hero.dropT / DROP);
        heroRig.position.y = 3.2 * (1 - k * k);
        if (k < 1) playAnim('jumpLoop', 0.0, 1, 0.35);
        else { heroRig.position.y = 0; hero.landT = 0.62; p.landed = 1; playAnim('jumpLand', 0.1, hero.kk ? 1.4 : 1.6, 0); }
      } else if (hero.landT > 0) hero.landT -= dt;
      else if (hero.kk) {
        hero.cheerT -= dt;
        if (hero.cheerT > 0) playAnim('cheer', 0.3); else playAnim('idle', 0.4);
        if (hero.cheerT < -7) hero.cheerT = (hero.dur.cheer || 1.6) - 0.05;
      } else playAnim('idle', 0.45);
    }
    hero.mixer.update(p.state === 'paused' || p.state === 'countdown' ? 0 : dt);
    hero.pivot.visible = !(p.invuln > 0 && !p.shield && Math.floor(time * 16) % 2 === 0 && p.state === 'run');
  }
  if (p.boost > 0 && p.state === 'run') {   // head start / idol dash trail
    const s0 = cur(); sparkleAt(s0, p.d - 0.6, p.x + (Math.random() - 0.5) * 0.9, 0.3 + Math.random() * 1.5 + p.hover);
  } else if (p.state === 'run' && save.trail !== 'none' && (trailTick += dt) > 0.03) {   // cosmetic trail
    trailTick = 0;
    const tr = trailCache.id === save.trail ? trailCache.t : (trailCache.id = save.trail, trailCache.t = TRAILS.find((t) => t.id === save.trail));
    if (tr && tr.color) {
      if (tr.color === 'rainbow') trailColor.setHSL((time * 0.6) % 1, 0.9, 0.6); else trailColor.setHex(tr.color);
      sparkleAt(cur(), p.d - 0.5, p.x + (Math.random() - 0.5) * 0.5, 0.25 + p.y + Math.random() * 0.6, 1, trailColor, 0.5);
    }
  }
  p.hover += ((p.boost > 0 ? 0.8 : 0) - p.hover) * damp(5, dt);
  heroRoot.position.y += p.hover + (p.boost > 0 ? Math.sin(time * 9) * 0.08 : 0);
  p.landed *= Math.exp(-dt * 10);
  heroRig.scale.set(1 + 0.1 * p.landed, 1 - 0.14 * p.landed, 1 + 0.1 * p.landed);
  if (p.state !== 'menu') heroRig.position.y = 0;
  // set pieces: the cart under the runner, the zipline grip over them
  const R = p.ride, rs = cur();
  hero && (hero.sink = (hero.sink || 0) + (((R && R.kind === 'cart' && p.slide > 0) ? 0.85 : 0) - (hero.sink || 0)) * damp(18, dt));
  if (R && R.kind === 'cart' && rs && rs.cart) {
    rs.cart.position.set(p.x, p.y, -p.d); rs.cart.rotation.set(0, 0, p.cartLean * 0.14 + Math.sin(time * 37) * 0.012);
    heroRig.position.y = 0.38 - (hero ? hero.sink : 0);
    heroRoot.rotation.z += p.cartLean * 0.16;
  }
  zipGear.visible = !!(R && R.kind === 'zip') && p.state === 'run';
  if (zipGear.visible) {
    const sw = Math.asin(clamp(p.x / ZIP_HANG, -0.6, 0.6));
    heroRoot.rotation.z = sw + Math.sin(time * 5) * 0.03;
    heroRoot.position.y += ZIP_HANG * (1 - Math.cos(sw));
    worldAt(rs, p.d, 0, zipRopeY(R.rd, p.d) + 0.27, zipGear.position);
    zipGear.rotation.set(0, -p.theta, sw, 'YXZ');
    if (hero) raiseArms(hero);
  }
  if (p.landed > 0.9) camDip = 0.35;

  const onGround = isGround(seg, p.d, p.x) && p.state !== 'falling';
  blob.visible = onGround && !hiQ;
  if (hiQ) { sun.target.position.copy(heroPos).setY(0); sun.position.copy(sun.target.position).add(SUN_OFF); }
  if (onGround) { worldAt(seg, p.d, p.x, 0.03, blob.position); blob.scale.setScalar(clamp(1 - p.y * 0.2, 0.45, 1)); }
  bubble.scale.setScalar(1 + Math.sin(time * 6) * 0.03);

  if (tiger) updateTiger(dt);

  // camera: behind and above, swings round corners, dips on landing, shakes on hits
  if (p.state === 'menu') {
    const ang = time * 0.22;
    camTarget.set(heroPos.x + Math.sin(ang) * 6.5, 2.5, heroPos.z + Math.cos(ang) * 6.5);
    lookTarget.set(heroPos.x, 1.2, heroPos.z);
  } else {
    camTheta += (targetTheta - camTheta) * damp(6.5, dt);
    const fx = Math.sin(camTheta), fz = -Math.cos(camTheta);
    const fallCam = (p.state === 'falling' || ((p.state === 'pounce' || p.state === 'over' || p.state === 'reviveOffer') && p.reason === 'fall'));
    const endCam = !fallCam && (p.state === 'crashed' || p.state === 'reviveOffer' || p.state === 'pounce' || p.state === 'over') && tiger;
    const yRef = fallCam ? 0 : Math.max(p.y * 0.4, -1);
    if (endCam) {
      // swing out to the side so the runner and the tiger are both in view
      const rx = Math.cos(camTheta), rz = Math.sin(camTheta);
      camTarget.set(heroPos.x + rx * 5.6 - fx * 4.2, 3.2, heroPos.z + rz * 5.6 - fz * 4.2);
      const tp = tiger.visible ? tiger.pos : heroPos;
      lookTarget.set((heroPos.x + tp.x) / 2, 0.8, (heroPos.z + tp.z) / 2);
    } else if (p.ride && p.ride.kind === 'zip' && p.state === 'run') {
      // on the zipline the camera rides just under the rope, so the line runs overhead instead of across the runner
      camTarget.set(heroPos.x - fx * 6.4, p.y + 1.75, heroPos.z - fz * 6.4);
      lookTarget.set(heroPos.x + fx * 6, p.y + 1.5, heroPos.z + fz * 6);
    } else if (!fallCam || p.deadTimer < 0.05) {
      camTarget.set(heroPos.x - fx * 7.6 - Math.cos(camTheta) * p.x * 0.25, yRef + 4.1 - camDip, heroPos.z - fz * 7.6 - Math.sin(camTheta) * p.x * 0.25);
      lookTarget.set(heroPos.x + fx * 6, yRef + 1.2, heroPos.z + fz * 6);
    } else lookTarget.copy(heroPos);
  }
  camRoll *= Math.exp(-4 * dt); camDip *= Math.exp(-6 * dt);
  if (snapCamera) { camera.position.copy(camTarget); lookCur.copy(lookTarget); snapCamera = false; }
  else {
    const slow = p.state === 'menu' || p.state === 'reviveOffer' || p.state === 'pounce' || p.state === 'over' || p.state === 'crashed';
    camera.position.lerp(camTarget, damp(slow ? 2.6 : 10, dt)); lookCur.lerp(lookTarget, damp(slow ? 4 : 12, dt));
  }
  if (shake > 0) { shake = Math.max(0, shake - dt * 1.6); camera.position.x += (Math.random() - 0.5) * shake * 0.6; camera.position.y += (Math.random() - 0.5) * shake * 0.6; }
  camera.lookAt(lookCur); camera.rotateZ(camRoll);
  const ca = window.__camAt; if (ca && cur()) { const s0 = cur(); worldAt(s0, ca[2], ca[0], ca[1], camera.position); worldAt(s0, ca[5], ca[3], ca[4], tmpV); camera.lookAt(tmpV); }
  const co = window.__camOverride; if (co && tiger) { const c = co[3] ? heroPos : tiger.pos; camera.position.set(c.x + co[0], co[1] + (co[3] ? c.y : 0), c.z + co[2]); camera.lookAt(c.x, (co[3] ? c.y : 0) + 0.9, c.z); }
  const aspect = innerWidth / innerHeight;
  const fov = (aspect < 0.8 ? 70 : 58) + (p.state === 'run' ? Math.min(16, (p.speed - START_SPEED) * 0.35) : 0);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * damp(4, dt); camera.updateProjectionMatrix(); }

  // live content in nearby segments
  coinQ.setFromAxisAngle(UP, time * 3.2);
  for (const s of segMap.values()) {
    if (s.idx < p.segIdx - 1 || s.idx > p.segIdx + 2) continue;
    if (s.coinMeshes && s.idx <= p.segIdx + 1) for (const { mesh, list } of s.coinMeshes) {
      list.forEach((c, i) => { tmpV.set(c.x, c.y + Math.sin(time * 3 + c.d) * 0.06, -c.d); tmpM.compose(tmpV, coinQ, c.taken ? coinZero : coinS); mesh.setMatrixAt(i, tmpM); });
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const t of s.torches) { const k = 1 + Math.sin(time * 18 + t.seed) * 0.08 + Math.sin(time * 7.3 + t.seed) * 0.06; t.flame.scale.set(t.fs[0], t.fs[1] * k, 1); t.glow.scale.setScalar(t.base * k * (0.6 + 0.4 * look.torch)); }
    for (const g of s.gems) if (!g.taken) { g.mesh.rotation.y = time * 2.4; g.mesh.position.y = 0.75 + Math.sin(time * 3) * 0.12; }
    if (s.letter && !s.letter.taken && s.letter.mesh) s.letter.mesh.rotation.y = Math.sin(time * 1.8) * 0.55;
    for (const pu of s.powerups) if (!pu.taken) { pu.mesh.rotation.y = time * 2; pu.mesh.position.y = 1.25 + Math.sin(time * 3) * 0.12; pu.halo.position.y = pu.mesh.position.y; }
  }
  for (const sp of sparkles) {
    if (!sp.s.visible) continue;
    sp.t += dt / (sp.life || 0.35);
    if (sp.t >= 1) { sp.s.visible = false; continue; }
    sp.s.scale.setScalar(0.5 + sp.t * 1.6); sp.s.material.opacity = 1 - sp.t; sp.s.position.y += dt * 1.2;
  }
  dust.position.set(Math.round(camera.position.x / 40) * 40, 0, Math.round(camera.position.z / 40) * 40);
  camera.getWorldDirection(camFwd);
  lookMats.forward = camFwd;
  look.update(dt, camera.position, false, lookMats);
  canopy.position.x = heroPos.x; canopy.position.z = heroPos.z;
}

// ---------------------------------------------------------------- tiger behaviour
// chase: gallops on the runner's trail (close behind after a stumble, far back otherwise) · down: walks up
// to a crashed runner and stands over them growling while the revive card is up; after a fall it stops well
// back from the edge · attack: see endRun()
const tigerVel = new THREE.Vector3(), tigerFollow = new THREE.Vector3();
function updateTiger(dt) {
  const T = tiger, A = T.A;
  if (p.state === 'menu') { showTiger(false); T.dist = T.prevDist = 30; return; }
  if (p.state === 'pounce') return;               // updatePounce drives it
  if (p.state === 'over') { if (T.visible) { A.update(dt); syncTigerPos(); } return; }
  const down = p.state === 'crashed' || p.state === 'falling' || p.state === 'reviveOffer';
  let near = (p.chase > 0 || p.reason === 'caught') ? (p.reason === 'caught' ? 2.2 : 4.2) : 18;
  if (down) near = Math.min(T.dist, p.reason === 'fall' ? 9 : 6.2);   // it never backs off from a fallen runner
  T.prevDist = T.dist;
  T.dist += (near - T.dist) * damp(down ? 1.1 : 2.2, dt);
  const yaw = trailAt(T.dist, tigerPos);
  const show = yaw !== null && T.dist < 16;
  if (!show) { showTiger(false); return; }
  // its own speed along the trail decides the gait; it faces along the trail (or at the runner once stopped)
  const runnerV = p.state === 'run' ? p.speed : 0;
  const v = Math.max(0, runnerV + (T.prevDist - T.dist) / Math.max(dt, 1e-3));
  trailAt(Math.max(0, T.dist - 1.2), tmpTrail);
  let dx = tmpTrail.x - tigerPos.x, dz = tmpTrail.z - tigerPos.z;
  if (dx * dx + dz * dz < 0.04) { dx = heroPos.x - tigerPos.x; dz = heroPos.z - tigerPos.z; }
  const heading = Math.atan2(dx, dz);
  const k = v / Math.max(1e-4, Math.hypot(dx, dz));
  tigerVel.set(dx * k, 0, dz * k).divideScalar(TIGER_SCALE);
  tigerFollow.copy(tigerPos).divideScalar(TIGER_SCALE).setY(0);
  if (!T.visible) { A.stopAction(); A.motion.reset(tigerFollow, heading); showTiger(true); }
  A.follow(tigerFollow, tigerVel, { heading });
  if (down && T.dist < 9) A.lookAt(T.look.set(heroPos.x, 0.5, heroPos.z).divideScalar(TIGER_SCALE)); else A.lookAt(null);
  A.update(dt); syncTigerPos();
  // growls: a snarl as it closes in after a stumble, low rumbles while it stands over a fallen runner
  T.growlT -= dt;
  if (T.growlT <= 0) {
    if (down && p.reason !== 'fall' && p.state !== 'falling' && !Ads.busy && T.dist < 8) { Sound.growl(0.75); T.growlT = 2.0 + Math.random() * 1.2; }
    else if (p.state === 'run' && p.chase > 0 && T.dist < 7) { Sound.growl(0.9); T.growlT = 2.4 + Math.random(); }
  }
}

// ---------------------------------------------------------------- main loop
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
applyQuality();
// 'auto' quality: watch the first seconds of play once and drop to low on slow phones
const perf = { t: 0, frames: 0 };
function measurePerf(dt) {
  if (save.quality !== 'auto' || save.autoQ || p.state !== 'run') return;
  perf.t += dt; perf.frames++;
  if (perf.t < 6) return;
  const fps = perf.frames / perf.t;
  save.autoQ = fps < 40 ? 'low' : 'high'; persist();
  if (save.autoQ === 'low') applyQuality();
}

let last = performance.now(), wasBoosting = false;
const hudCache = { d: -1, s: -1 };
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000) * (window.__ts ?? 1); last = now; time += dt;
  if (p.state === 'run') {
    if (!AUTOPILOT) measurePerf(dt);
    let rem = dt;
    while (rem > 1e-6 && p.state === 'run') { const h = Math.min(rem, 1 / 90); if (AUTOPILOT) autopilot(); step(h); rem -= h; }
    if (p.state === 'run') {
      const di = Math.floor(p.dist), sc = Math.floor(p.score);
      if (di !== hudCache.d) { hudCache.d = di; ui.dist.textContent = di; }
      if (sc !== hudCache.s) { hudCache.s = sc; ui.score.textContent = sc; Progress.ev('score', p.score); }
      toastAge += dt; updateTutorial();
    }
  } else if (p.state === 'countdown') {
    const before = Math.ceil(p.countdown / 0.8);
    p.countdown -= dt;
    const n = Math.ceil(p.countdown / 0.8);
    if (p.countdown <= 0) { p.state = 'run'; hideToast(); Sound.music(ZONE_MUSIC[zoneOf(p.dist)]); Sound.duck(1, 0.6); }
    else { showToast(String(n), 'cd' + n); if (n !== before) Sound.tick(); }
  } else if (p.state === 'crashed' || p.state === 'falling') deathStep(dt);
  else if (p.state === 'pounce' && tiger) updatePounce(dt);
  else if (p.state === 'reviveOffer') {
    if (!Ads.busy && !overlayOpen()) p.reviveTimer -= dt;
    ui.reviveRing.style.setProperty('--t', clamp(p.reviveTimer / REVIVE_WINDOW, 0, 1).toFixed(3));
    if (p.reviveTimer <= 0) endRun();
  }
  const boosting = p.boost > 0 && p.state === 'run';
  if (boosting !== wasBoosting) { wasBoosting = boosting; document.body.classList.toggle('boosting', boosting); Sound.idol(boosting); if (boosting) Sound.idolRush(); }
  updateVisuals(dt);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- boot
renderPowerUI();
window.__look = look;
window.__game = {
  get p() { return p; }, get segs() { return segMap.size; }, get last() { return window.__lastRun; },
  start: () => startRun(), swipe: handleSwipe, hit: (type) => hitObstacle({ type }), fall: () => fall(), endRun: () => endRun(), get ready() { return libReady && !!hero; }, get anim() { return hero && hero.current; },
  get T() { return tiger; },
  // test gallery: props laid out ahead of the runner, in this segment's frame
  gallery(items, d0) {
    const s0 = cur(), seg = { group: new THREE.Group(), sc: {}, disposables: [], torches: s0.torches, inst: {}, bridges: [], gaps: [] };
    seg.group.position.copy(s0.group.position); seg.group.rotation.copy(s0.group.rotation);
    for (const [kind, x, dd] of items) {
      const z = -(d0 + dd);
      if (kind === 'log') sc(seg, 'log0', PR.G.logs[0], LOG_MATS, compose(x, 0, z, 0, 1), true, true);
      if (kind === 'gate') sc(seg, 'gate', PR.G.gate, PR.M.stone, compose(x, 0, z, 0, 1), true, true);
      if (kind === 'idol') sc(seg, 'idolHead', PR.G.idolHead, PR.M.stone, compose(x, 0, z, 0, 1.05), true, true);
      if (kind === 'totem') sc(seg, 'totem', PR.G.totem, PR.M.stone, compose(x, 0, z, 0, 1), true, true);
      if (kind === 'spire') sc(seg, 'rs', PR.G.rockSpire[0], PR.M.rock, compose(x, 0, z, 0, 1), true, true);
      if (kind === 'column') sc(seg, 'c2', SC.G.columns[2], M.wall, compose(x, 0, z, 0, 1.45, 0.62, 1.45), true, true);
      if (kind === 'obelisk') sc(seg, 'ob', PR.G.obelisk, PR.M.stone, compose(x, 0, z, 0, 1), true, true);
      if (kind === 'urn') sc(seg, 'urn', PR.G.urn, PR.M.terracotta, compose(x, 0, z, 0, 1.2), true, true);
      if (kind === 'rubble') for (let v = 0; v < 3; v++) sc(seg, 'rub' + v, PR.G.rubble[v], v === 2 ? PR.M.stone : PR.M.rock, compose(x + v * 0.8, 0.05, z, v, 0.8), true, true);
      if (kind === 'torch') addTorch(seg, x, z);
      if (kind === 'fire') {
        sc(seg, 'trough', PR.G.trough, PR.M.stone, compose(x, 0, z, 0, 1), true, true);
        const bed = new THREE.Mesh(PR.G.coalBed, PR.M.coals); bed.position.set(x, 0, z); seg.group.add(bed);
        for (let fx = -3.15; fx <= 3.16; fx += 0.9) { const f = new THREE.Mesh(PR.G.flameQuad, PR.M.fire); f.position.set(x + fx, 0.38, z); f.scale.set(1, 1.1, 1); seg.group.add(f); }
      }
      if (kind === 'coin' || kind === 'red' || kind === 'blue') { const m = new THREE.Mesh(G.coin, kind === 'coin' ? M.gold : kind === 'red' ? M.coinRed : M.coinBlue); m.position.set(x, 1, z); m.scale.setScalar(1.6); m.rotation.y = 0.5; seg.group.add(m); }
      if (kind === 'gem') { const m = new THREE.Mesh(PR.G.gem, PR.M.gem); m.position.set(x, 1, z); m.scale.setScalar(1.6); seg.group.add(m); }
      if (kind === 'shield') { const m = PR.makeShield(); m.position.set(x, 1.2, z); seg.group.add(m); }
      if (kind === 'magnet') { const m = makeMagnet(); m.position.set(x, 1.2, z); seg.group.add(m); }
      if (kind === 'idolpu') { const m = makeIdol(); m.position.set(x, 1.0, z); seg.group.add(m); }
      if (kind === 'x2') { const m = makeX2(); m.position.set(x, 1.2, z); seg.group.add(m); }
      if (kind === 'letter') { const m = new THREE.Mesh(G.coin, PR.M.letter('R')); m.position.set(x, 1.3, z); m.scale.setScalar(1.9); seg.group.add(m); }
    }
    flushScenery(seg); scene.add(seg.group); return true;
  },
  skin: (id) => showSkin(HEROES.findIndex((h) => h.id === id)),
  noShield() { p.shield = false; bubble.visible = false; ui.shieldIco.hidden = true; },
  get triStats() {
    const out = {};
    scene.traverse((o) => { if (!o.isMesh || !o.visible) return; const gg = o.geometry; const t = (gg.index ? gg.index.count : gg.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
      const k = (o.isInstancedMesh ? 'I:' : '') + (o.isSkinnedMesh ? 'S:' : '') + (gg.type || '') + ':' + (Array.isArray(o.material) ? 'multi' : o.material.type) + ':' + Math.round((gg.index ? gg.index.count : gg.attributes.position.count) / 3); out[k] = (out[k] || 0) + t; });
    return Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => k + ' ' + Math.round(v));
  },
  get arms() { return hero && armChain(hero).map((a) => a.segs.map((s) => s[0].name + '>' + (s[1] && s[1].name))); },
  settle(n = 20, h = 1 / 30) { for (let i = 0; i < n; i++) { time += h; updateVisuals(h); } },
  get ride() { const s = cur(); return { cur: s && s.ride && { kind: s.ride.kind, d0: Math.round(s.ride.d0), d1: Math.round(s.ride.d1) }, d: +p.d.toFixed(1), y: +p.y.toFixed(2), riding: p.ride && p.ride.kind, all: [...segMap.values()].filter((q) => q.ride).map((q) => q.idx + ':' + q.ride.kind) }; },
  addPower: (n) => addPower(n), activatePower: () => activatePower(),
  get info() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures }; },
  get sound() { return Sound.debugState(); },
  get hero() { return hero; },
  get tiger() { return tiger && { visible: tiger.visible, dist: +tiger.dist.toFixed(1) }; },
  get tigerState() { return tiger && { mode: tiger.mode, vis: tiger.visible, t: +tiger.t.toFixed(2), dist: +tiger.dist.toFixed(1), speed: +tiger.A.speed.toFixed(1), gait: tiger.A.state.gait, act: tiger.attacking, done: tiger.done, landed: tiger.landed, pos: tiger.pos.toArray().map((v) => +v.toFixed(2)), hero: heroPos.toArray().map((v) => +v.toFixed(2)) }; },
  sim(sec) { let t = 0; while (t < sec && p.state === 'run') { if (AUTOPILOT) autopilot(); step(1 / 90); t += 1 / 90; } snapCamera = true; return { state: p.state, dist: Math.round(p.dist), reason: p.reason }; },
  get letters() { return [...segMap.values()].filter((s) => s.letter).map((s) => ({ idx: s.idx, d: Math.round(s.letter.d), lane: s.letter.lane, taken: s.letter.taken })); },
  get obs() { return [...segMap.values()].flatMap((s) => s.obstacles.map((o) => ({ i: s.idx, t: o.type, d: Math.round(o.d), lanes: o.lanes, fire: !!o.fire, m: o.models, mine: !!o.mine }))); },
  get pos() { return { seg: p.segIdx, d: p.d }; },
  get powerups() { return [...segMap.values()].flatMap((s) => s.powerups.map((u) => u.kind)); },
  get heroInfo() { if (!hero) return null; const b = new THREE.Box3().setFromObject(hero.pivot); return { min: b.min.toArray().map(v=>+v.toFixed(2)), max: b.max.toArray().map(v=>+v.toFixed(2)), root: heroRoot.position.toArray().map(v=>+v.toFixed(2)), cam: camera.position.toArray().map(v=>+v.toFixed(2)), vis: hero.pivot.visible, scale: hero.pivot.children[0].scale.x }; },
};
// Android back button: close overlays, pause, or leave the app from the menu
async function hookBackButton() {
  if (!Ads.native) return;
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', () => {
      if (overlayOpen()) closeOverlays();
      else if (p.state === 'run') togglePause();
      else if (p.state === 'paused') togglePause();
      else if (p.state === 'reviveOffer') { if (!Ads.busy) endRun(); }
      else if (p.state === 'over') leaveResults(toMenu, true);
      else if (p.state === 'menu') App.minimizeApp();
    });
  } catch (e) { console.warn('back button', e); }
}

initShop({
  onChange: () => renderMenu(),
  onSound: (on) => { save.sound = on; persist(); Sound.init(); Sound.set(on); },
  onQuality: () => applyQuality(),
  onSkin: (id) => { if (p.state === 'menu') showSkin(HEROES.findIndex((h) => h.id === id)); },   // mid-run picks apply next run
  sfx: Sound,
});
document.querySelectorAll('[data-open-shop]').forEach((b) => b.addEventListener('click', () => { Sound.click(); openShop(b.dataset.openShop); }));
Ads.setAudioHook((on) => { if (on) Sound.resume(); else Sound.suspend(); });
(async () => {
  p.state = 'menu';
  renderMenu();
  if (!AUTOSTART) startMenuMusic();   // plays at once where autoplay is allowed (the app); otherwise on the first touch
  requestAnimationFrame(frame);
  hookBackButton();
  Ads.init().then(() => renderMenu());
  IAP.init((id, tx) => { if (grantProduct(id, tx)) { Sound.gem(); toastMsg('Thanks! Purchase added.'); } }, () => renderMenu());
  await loadLibrary((f) => { ui.play.textContent = `Loading ${Math.round(f * 100)}%`; });
  libReady = true;
  loadTiger().catch((e) => console.warn('tiger', e));
  newWorld();
  await showSkin(menuSkin);
  if (AUTOSTART) startRun();
  else if (dailyReady()) setTimeout(() => { if (p.state === 'menu' && !overlayOpen()) openDaily(); }, 600);
})();
