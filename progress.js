// Player progression: three missions at a time, explorer level (= score multiplier), and the daily Relic Hunt.
// The game reports what happens with Progress.ev(...); this module decides what counts.
import { save, persist, give, today } from './economy.js';

const S = {
  get(k, d) { try { const v = localStorage.getItem('relicdash:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('relicdash:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

export const MAX_LEVEL = 30;
export const HUNT_WORD = 'RELIC';

// Mission templates. `run` missions count inside a single run; the others add up across runs.
// target(level) grows slowly so early levels take a few runs and later ones need real skill.
const POOL = [
  { k: 'dist_run', run: true, text: (n) => `Run ${n} m in one run`, target: (l) => 300 + 170 * l, round: 50 },
  { k: 'coins_run', run: true, text: (n) => `Collect ${n} gold in one run`, target: (l) => 25 + 14 * l, round: 5 },
  { k: 'jumps_run', run: true, text: (n) => `Jump ${n} times in one run`, target: (l) => 8 + 3 * l, round: 1 },
  { k: 'slides_run', run: true, text: (n) => `Slide ${n} times in one run`, target: (l) => 5 + 2 * l, round: 1 },
  { k: 'turns_run', run: true, text: (n) => `Take ${n} turns in one run`, target: (l) => 4 + 1.4 * l, round: 1 },
  { k: 'powerups_run', run: true, text: (n) => `Grab ${n} power-ups in one run`, target: (l) => 1 + 0.35 * l, round: 1 },
  { k: 'score_run', run: true, text: (n) => `Score ${n.toLocaleString('en')} in one run`, target: (l) => 600 * l + 400 * l * l, round: 500 },
  { k: 'nocoin_run', run: true, text: (n) => `Run ${n} m without touching gold`, target: (l) => 120 + 40 * l, round: 10 },
  { k: 'clean_run', run: true, text: (n) => `Run ${n} m without stumbling`, target: (l) => 350 + 120 * l, round: 50 },
  { k: 'power_run', run: true, text: (n) => `Fire your power ${n} time${n > 1 ? 's' : ''} in one run`, target: (l) => 1 + 0.2 * l, round: 1 },
  { k: 'zip_total', text: (n) => `Ride ${n} zipline${n > 1 ? 's' : ''}`, target: (l) => 1 + 0.3 * l, round: 1 },
  { k: 'cart_total', text: (n) => `Ride the mine cart ${n} time${n > 1 ? 's' : ''}`, target: (l) => 1 + 0.25 * l, round: 1 },
  { k: 'coins_total', text: (n) => `Collect ${n.toLocaleString('en')} gold`, target: (l) => 150 + 90 * l, round: 50 },
  { k: 'dist_total', text: (n) => `Run ${n.toLocaleString('en')} m in total`, target: (l) => 1500 + 700 * l, round: 100 },
  { k: 'gems_total', text: (n) => `Find ${n} gem${n > 1 ? 's' : ''} on the road`, target: (l) => 1 + 0.3 * l, round: 1 },
  { k: 'runs_total', text: (n) => `Play ${n} runs`, target: (l) => 3 + 0.5 * l, round: 1 },
  { k: 'boosters_total', text: (n) => `Start ${n} run${n > 1 ? 's' : ''} with a booster`, target: (l) => 1 + 0.15 * l, round: 1 },
  { k: 'letters_total', text: (n) => `Find ${n} Relic Hunt letter${n > 1 ? 's' : ''}`, target: (l) => 1 + 0.25 * l, round: 1 },
];
const tpl = (k) => POOL.find((p) => p.k === k);
const roundTo = (v, r) => Math.max(r, Math.round(v / r) * r);

export const prog = {
  level: S.get('level', 1),
  missions: S.get('missions', null),
  hunt: { date: '', got: [], done: 0, total: 0, ...S.get('hunt', {}) },
  stats: S.get('stats', { dist: 0, coins: 0, runs: 0, best: 0 }),
};
function persistProg() { for (const k of Object.keys(prog)) S.set(k, prog[k]); }

function newMission(exclude) {
  const options = POOL.filter((p) => !exclude.includes(p.k) && !(p.k === 'letters_total' && huntDoneToday()));
  const p = options[Math.floor(Math.random() * options.length)];
  return { k: p.k, target: roundTo(p.target(prog.level), p.round), progress: 0, done: false };
}
function fillMissions() {
  if (!Array.isArray(prog.missions)) prog.missions = [];
  prog.missions = prog.missions.filter((m) => m && tpl(m.k) && m.target > 0);   // drop missions from older versions
  while (prog.missions.length < 3) prog.missions.push(newMission(prog.missions.map((m) => m.k)));
}
fillMissions(); persistProg();

export const multiplier = () => Math.min(MAX_LEVEL, prog.level);
export const missionText = (m) => tpl(m.k).text(m.target);
export const levelReady = () => prog.missions.every((m) => m.done);

// ---------------------------------------------------------------- run tracking
const run = { dist: 0, coins: 0, jumps: 0, slides: 0, turns: 0, powerups: 0, score: 0, noCoinStart: 0, cleanStart: 0, letters: 0, power: 0 };
let listener = () => {};
export function onMissionDone(fn) { listener = fn; }

function bump(m, value, absolute) {
  if (m.done) return;
  m.progress = absolute ? Math.max(m.progress, value) : m.progress + value;
  if (m.progress >= m.target) { m.progress = m.target; m.done = true; listener(m); persistProg(); }
}
function apply(k, value, absolute) { for (const m of prog.missions) if (m.k === k) bump(m, value, absolute); }

export const Progress = {
  startRun(usedBooster) {
    Object.assign(run, { dist: 0, coins: 0, jumps: 0, slides: 0, turns: 0, powerups: 0, score: 0, noCoinStart: 0, cleanStart: 0, letters: 0, power: 0 });
    if (usedBooster) apply('boosters_total', 1);
    // run-only missions restart their counter each run (they keep the best attempt for display)
    for (const m of prog.missions) if (!m.done && tpl(m.k).run) m.best = Math.max(m.best || 0, m.progress), m.progress = 0;
  },
  /** dist and score are absolute values for the current run; the rest are increments. */
  ev(type, v = 1) {
    switch (type) {
      case 'dist': {
        const d = v - run.dist; if (d <= 0) return; run.dist = v;
        apply('dist_run', v, true); apply('dist_total', d);
        apply('nocoin_run', v - run.noCoinStart, true); apply('clean_run', v - run.cleanStart, true);
        break;
      }
      case 'score': run.score = v; apply('score_run', Math.floor(v), true); break;
      case 'coin': run.coins += v; apply('coins_run', run.coins, true); apply('coins_total', v); run.noCoinStart = run.dist; break;
      case 'jump': run.jumps++; apply('jumps_run', run.jumps, true); break;
      case 'slide': run.slides++; apply('slides_run', run.slides, true); break;
      case 'turn': run.turns++; apply('turns_run', run.turns, true); break;
      case 'powerup': run.powerups++; apply('powerups_run', run.powerups, true); break;
      case 'gem': apply('gems_total', v); break;
      case 'power': run.power++; apply('power_run', run.power, true); break;
      case 'zip': apply('zip_total', 1); break;
      case 'cart': apply('cart_total', 1); break;
      case 'stumble': run.cleanStart = run.dist; break;
      case 'letter': run.letters++; apply('letters_total', 1); break;
      default: break;
    }
  },
  /** Called once per run at the results screen. Returns what changed so the UI can celebrate it. */
  endRun({ dist, coins, score }) {
    apply('runs_total', 1);
    prog.stats.dist += Math.floor(dist); prog.stats.coins += coins; prog.stats.runs++; prog.stats.best = Math.max(prog.stats.best, Math.floor(score));
    for (const m of prog.missions) if (!m.done && tpl(m.k).run) m.best = Math.max(m.best || 0, m.progress);
    persistProg();
    return { levelReady: levelReady() };
  },
  /** All three missions complete → level up, reward chest, fresh missions. */
  levelUp() {
    if (!levelReady()) return null;
    prog.level = Math.min(prog.level + 1, 999);
    const reward = { chest: 1, gems: prog.level % 5 === 0 ? 5 : 0, gold: 100 * prog.level };
    give(reward);
    prog.missions = []; fillMissions(); persistProg();
    return { level: prog.level, reward };
  },
  /** Pay to skip one mission (gems or a rewarded ad). */
  skip(i) {
    const m = prog.missions[i]; if (!m || m.done) return false;
    m.progress = m.target; m.done = true; persistProg(); return true;
  },
  displayProgress(m) { return tpl(m.k).run && !m.done ? Math.max(m.progress, m.best || 0) : m.progress; },
};

// ---------------------------------------------------------------- daily Relic Hunt: find R-E-L-I-C, one letter per run
function huntToday() { if (!Array.isArray(prog.hunt.got)) prog.hunt.got = []; if (prog.hunt.date !== today()) { prog.hunt.date = today(); prog.hunt.got = []; prog.hunt.done = 0; } return prog.hunt; }
export function huntDoneToday() { return huntToday().got.length >= HUNT_WORD.length; }
export const huntState = () => ({ ...huntToday(), word: HUNT_WORD });
export function nextHuntLetter() { const h = huntToday(); return h.got.length < HUNT_WORD.length ? HUNT_WORD[h.got.length] : null; }
/** Returns { letter, complete, reward } */
export function collectHuntLetter() {
  const h = huntToday(); const letter = nextHuntLetter(); if (!letter) return null;
  h.got.push(letter);
  let reward = null;
  if (h.got.length === HUNT_WORD.length) { h.done = 1; h.total = (h.total || 0) + 1; reward = { gems: 3, chest: 1 }; give(reward); }
  persistProg();
  return { letter, complete: !!reward, reward };
}
export const huntsCompleted = () => prog.hunt.total || 0;
export { persist };
