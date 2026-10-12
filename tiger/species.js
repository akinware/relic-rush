// Bengal tiger for Relic Rush, built on the procedural-animals lion (MIT, Majid Manzarpour): the lion's
// skeleton, sculpt, IK gaits and actions (stalk / charge / pounce, roar) with a tiger's coat painted
// over it: deep orange ground, white belly, cheeks and eye spots, black transverse stripes that
// taper and fork down the flanks, barred thighs, a ringed tail with a black tip and no tuft.
import lion from '../vendor/procedural-animals/src/species/lion/index.js';
import { sculptLion } from '../vendor/procedural-animals/src/species/lion/sculpt.js';
import { HEAD_O, HS } from '../vendor/procedural-animals/src/species/lion/rig.js';
import { MAT, srgb, mix3 } from '../vendor/procedural-animals/src/core/build/coatKit.js';
import { fbm3, vnoise3, smoothstep, clamp } from '../vendor/procedural-animals/src/core/math/vec.js';

const ORANGE_D = srgb(0xb4561a); // back
const ORANGE = srgb(0xcf6d22);   // flanks
const ORANGE_L = srgb(0xe0954a); // lower flank, legs
const WHITE = srgb(0xf1ebe0);
const STRIPE = srgb(0x0d0907);

const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const sat = (c) => { const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]); return mx > 1e-4 ? (mx - mn) / mx : 0; };

function tigerCoat(ctx) {
  const out = lion.coat(ctx);
  const { pos, nrm, nV, weights, rig } = ctx;
  const { tint, pattern, patternColor, region, ventral, tailT, furLen } = out;
  const { BONES } = rig;
  const { axialS, skinIndex, skinWeight, limbMember } = weights;
  const isLimb = BONES.map((b) => /^(scapula|humerus|radius|metacarpus|fpaw|femur|tibia|metatarsus|hpaw)/.test(b.name));
  const isFront = BONES.map((b) => /^(scapula|humerus|radius|metacarpus|fpaw)/.test(b.name));
  const isPaw = BONES.map((b) => /^(fpaw|hpaw)/.test(b.name));
  const AX = weights.axialLengths;
  const sTailBase = AX[8], tailLen = AX[AX.length - 1] - sTailBase;
  const seed = (ctx.params.coatSeed || 0) % 991;
  const n2 = (a, b) => vnoise3(a + seed, b, 0.37 * seed);
  const P = 0.085; // stripe period along the spine (m)

  for (let v = 0; v < nV; v++) {
    const mat = tint[v * 4 + 3];
    if (mat !== MAT.FUR) continue;
    const p = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
    const n = [nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]];
    const r = region[v];
    const old = [tint[v * 4], tint[v * 4 + 1], tint[v * 4 + 2]];
    let lb = -1, lw = 0;
    for (let k = 0; k < 4; k++) { const b = skinIndex[v * 4 + k], w = skinWeight[v * 4 + k]; if (isLimb[b] && w > lw) { lw = w; lb = b; } }
    const L = lb >= 0 && r < 2 ? smoothstep(0.15, 0.85, limbMember[v]) : 0;
    const nz = fbm3(p[0] * 6 + seed, p[1] * 6, p[2] * 6, 3) - 0.5;

    // ---------------- ground colour
    let col;
    const lu = lum(old), st = sat(old);
    if (lu < 0.035) col = old; // ear backs, lip line, tail tip: keep the lion's blacks
    else {
      // white where the lion is pale and unsaturated (belly, chin, muzzle, eye crescents)
      let white = smoothstep(0.32, 0.14, st) * smoothstep(0.25, 0.45, lu);
      if (r <= 1) white = Math.max(white, smoothstep(0.35, 0.75, ventral[v] + 0.15 * nz));
      const up = n[1];
      let orange = mix3(ORANGE_L, ORANGE, smoothstep(-0.4, 0.25, up + 0.2 * nz));
      orange = mix3(orange, ORANGE_D, smoothstep(0.4, 0.95, up + 0.2 * nz) * 0.8);
      if (L > 0) orange = mix3(orange, ORANGE_L, L * 0.6);
      if (lb >= 0 && isPaw[lb] && r < 2) white *= 0.5;
      // keep the lion's local shading (darker crown, brow), toned to the orange
      const shade = clamp(lu / 0.3, 0.6, 1.35);
      orange = orange.map((x) => x * (0.75 + 0.25 * shade) * (1 + 0.08 * nz));
      col = mix3(orange, WHITE, clamp(white, 0, 1));
      if (r === 2) {
        // tiger face: white patches over the eyes and on the cheeks / whisker pads
        const h = [(p[0] - HEAD_O[0]) / HS, (p[1] - HEAD_O[1]) / HS, (p[2] - HEAD_O[2]) / HS];
        const ax = Math.abs(h[0]);
        const brow = Math.exp(-(((ax - 0.055) / 0.03) ** 2) - (((h[1] - 0.105) / 0.022) ** 2) - (((h[2] - 0.09) / 0.05) ** 2));
        const cheek = smoothstep(0.03, -0.035, h[1]) * smoothstep(0.04, 0.09, ax) * smoothstep(-0.03, 0.06, h[2]);
        col = mix3(col, WHITE, clamp(Math.max(brow, cheek * 0.95), 0, 1));
      }
    }

    // ---------------- stripes (signed distance in metres, < 0 inside)
    let d = 1;
    if (r === 0 || r === 1) {
      const s = axialS[v];
      const down = clamp((1 - n[1]) / 2, 0, 1); // 0 on the spine .. 1 under the belly
      const side = p[0] >= 0 ? 1 : -1;
      const wob = 0.32 * (fbm3(s * 4 + side * 3.1 + seed, down * 4, 0.5, 2) - 0.5) + 0.06 * (n2(s * 40, down * 25) - 0.5);
      // stripes lean back toward the rump as they run down the flank, forward on the shoulder
      const lean = (p[2] > -0.1 ? -0.35 : 0.45) * down;
      const ph = s / P + lean + wob + side * 0.21;
      const k = Math.round(ph), fi = ph - k;
      const rnd = n2(k * 7.13 + side * 1.7, 2.2);
      // widest over the back, tapering to a point low on the flank; some stop short
      const reach = 0.68 + 0.25 * rnd;
      const taper = 1 - smoothstep(0.3, reach, down);
      const hw = (0.013 + 0.007 * rnd) * (0.35 + 0.65 * taper) * (0.85 + 0.3 * n2(k * 3.3, down * 6)) - 0.02 * smoothstep(reach - 0.05, reach + 0.05, down);
      d = Math.abs(fi) * P - hw;
      // forks: a thinner companion stripe beside some of them on the flank
      if (rnd > 0.55) {
        const fk = Math.abs(fi - 0.33) * P - 0.006 * taper * smoothstep(0.15, 0.4, down);
        d = Math.min(d, fk);
      }
      d += smoothstep(0.55, 0.85, ventral[v]) * 0.03; // the white belly is plain
      if (r === 1) d += 0.004; // finer on the neck
      // legs: horizontal bars on the outside of the upper legs (bold on the thighs), plain feet
      if (L > 0) {
        const front = lb >= 0 && isFront[lb];
        const lp = front ? 0.07 : 0.06;
        const lph = p[1] / lp + 0.6 * (n2(p[1] * 30, p[2] * 30 + side) - 0.5) + 0.3 * side;
        const outer = smoothstep(-0.4, 0.3, n[0] * side + 0.3 * n[2]);
        let dl = Math.abs(lph - Math.round(lph)) * lp - (front ? 0.007 : 0.011) * (0.7 + 0.6 * n2(Math.round(lph) * 2.7, side));
        dl += (1 - outer) * 0.02 + smoothstep(front ? 0.42 : 0.3, front ? 0.25 : 0.16, p[1]) * 0.04;
        d = d * (1 - L) + dl * L;
      }
    } else if (r === 4) {
      // tail: dark rings closing up toward a black tip
      const t = tailT[v], sT = t * tailLen;
      const ph = sT / 0.085 + 0.2 * (n2(sT * 30, 1.3) - 0.5);
      d = Math.abs(ph - Math.round(ph)) * 0.085 - (0.012 + 0.008 * t);
      if (sT < 0.06) d = Math.max(d, 0.06 - sT);
      d = Math.min(d, (0.88 - t) * 0.5);
    } else if (r === 2) {
      // head: arcs over the forehead and crown, and stripes swept back across the cheeks
      const h = [(p[0] - HEAD_O[0]) / HS, (p[1] - HEAD_O[1]) / HS, (p[2] - HEAD_O[2]) / HS];
      const ax = Math.abs(h[0]);
      if (h[1] > 0.06 && n[1] > 0.1) {
        const fp = (h[2] * 1.6 + ax * ax * 9) / 0.045 + 0.4 * (n2(ax * 40, h[2] * 40) - 0.5);
        d = (Math.abs(fp - Math.round(fp)) * 0.045 - 0.006 * smoothstep(0.12, 0.02, ax)) * HS;
        d += smoothstep(0.13, 0.17, h[2]) * 0.02; // not down the bridge of the nose
      }
      if (ax > 0.07 && Math.abs(n[0]) > 0.35 && h[2] < 0.06) {
        const cp = (h[2] + 0.6 * (h[1] - 0.02)) / 0.04 + 0.3 * (n2(h[1] * 50, h[2] * 50) - 0.5);
        const dc = (Math.abs(cp - Math.round(cp)) * 0.04 - 0.0055) * HS + smoothstep(0.02, -0.09, h[1]) * 0.03;
        d = Math.min(d, dc);
      }
    }
    if (r <= 4 && d < pattern[v]) {
      pattern[v] = Math.max(-0.03, Math.min(d, 0.05));
      patternColor[v * 4] = STRIPE[0]; patternColor[v * 4 + 1] = STRIPE[1]; patternColor[v * 4 + 2] = STRIPE[2];
      patternColor[v * 4 + 3] = 0.96;
    }
    tint[v * 4] = col[0]; tint[v * 4 + 1] = col[1]; tint[v * 4 + 2] = col[2];
    // a tiger's coat is short and sleek
    furLen[v] = Math.min(furLen[v], r === 4 ? 0.016 : 0.02);
  }
  return out;
}

export default {
  ...lion,
  id: 'tiger',
  name: 'Bengal tiger',
  latin: 'Panthera tigris tigris',
  variants: ['bengal'],
  variation(R, o) {
    const p = lion.variation(R, { ...o, sex: 'female', age: 'adult', variant: 'tawny' });
    p.variant = 'bengal';
    p.mane = 0; p.maneDark = 0; p.legSpots = 0;
    p.size *= 1.12; // a big male tiger: longer and heavier than a lioness
    p.warps = [...p.warps, { type: 'length', k: 1.1, z0: -0.55, z1: 0.4 }];
    p.belly = 0.5;
    return p;
  },
  // the lion's sculpt without the tail tuft
  sculpt: (m, rig, params) => {
    const out = sculptLion(m, rig, params) || m;
    out.prims = out.prims.filter((pr) => pr.tag !== 'tuft');
    return out;
  },
  coat: tigerCoat,
  motion: { ...lion.motion, turnRate: 4, latAccelMax: 40 },
};
