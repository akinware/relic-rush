// Scenery kit for the temple road: PBR surface materials (textures from tools/gen-textures.py), procedural
// rock spires, tree crowns, foliage cards, carved curbs, rope-bridge parts and an animated waterfall.
// Everything here is shared between segments; game.js places instances of it.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// small deterministic 3D value noise (geometry only, so speed doesn't matter much)
function hash3(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; h ^= h >>> 16; return (h >>> 0) / 4294967295; }
function vnoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t), u = s(xf), v = s(yf), w = s(zf);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
export const fbm3 = (x, y, z, o = 4) => { let a = 0, f = 1, amp = 0.5, t = 0; for (let i = 0; i < o; i++) { a += amp * vnoise3(x * f, y * f, z * f); t += amp; f *= 2.03; amp *= 0.5; } return a / t; };

// box UVs at a fixed world scale (metres per texture repeat)
export function scaleBoxUV(g, w, h, d, per) {
  const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  if (g.groups.length === 6) {
    for (let f = 0; f < 6; f++) { const gr = g.groups[f]; for (let i = gr.start; i < gr.start + gr.count; i++) { const k = g.index ? g.index.getX(i) : i; uv.setXY(k, uv.getX(k) * dims[f][0] / per, uv.getY(k) * dims[f][1] / per); } }
  }
  return g;
}

export function createScenery({ renderer, loadBinary, canopy = null }) {
  const ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  // ---------------------------------------------------------------- materials
  const M = {
    path: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0 }),
    wall: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 }),
    rock: new THREE.MeshStandardMaterial({ color: 0xb0a492, roughness: 0.95, metalness: 0 }),
    plank: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 }),
    rope: new THREE.MeshLambertMaterial({ color: 0x9b7b4f }),
    mineFloor: new THREE.MeshStandardMaterial({ color: 0x6e5a46, roughness: 1, metalness: 0 }),
    crown: new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x8fb070, roughness: 0.85, metalness: 0 }),
    leaves: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 }),
    bark: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
    frond: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, alphaTest: 0.5, side: THREE.DoubleSide, visible: false }),
    fern: new THREE.MeshLambertMaterial({ alphaTest: 0.5, side: THREE.DoubleSide, visible: false }),
    vine: new THREE.MeshLambertMaterial({ alphaTest: 0.5, side: THREE.DoubleSide, visible: false }),
    water: null, foam: null, shaft: null,
  };
  // gentle wind on the fern and vine cards (vertex shader), stronger at the tips
  const wind = { value: 0 };
  for (const m of [M.fern, M.vine]) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uWind = wind;
      sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        float tip = clamp(abs(position.y) / 2.0, 0.0, 1.0);
        vec4 wp0 = instanceMatrix * vec4(position, 1.0);
        float ph = uWind * 1.7 + wp0.x * 0.37 + wp0.z * 0.29;
        transformed.x += sin(ph) * 0.09 * tip;
        transformed.z += cos(ph * 0.8) * 0.06 * tip;`);
    };
    m.customProgramCacheKey = () => 'wind-card';
  }
  // palm fronds sway from the crown out to the tips (tip = uv.y)
  M.frond.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = wind;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position);
      float tip = uv.y * uv.y;
      vec4 wp0 = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float ph = uWind * 1.3 + wp0.x * 0.21 + wp0.z * 0.17;
      transformed.y += sin(ph + position.x) * 0.22 * tip;
      transformed.x += cos(ph * 0.7) * 0.12 * tip;`);
  };
  M.frond.customProgramCacheKey = () => 'wind-frond';

  // waterfall: streaky white-blue water scrolling down, brighter at the edges of the fall
  const waterTex = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#7fb6c9'; g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * 128, w = 1 + Math.random() * 3, y = Math.random() * 256, h = 20 + Math.random() * 90;
      g.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.45})`; g.fillRect(x, y, w, h); g.fillRect(x, y - 256, w, h);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  })();
  M.water = new THREE.MeshBasicMaterial({ map: waterTex, transparent: true, opacity: 0.88, depthWrite: false, side: THREE.DoubleSide });
  const foamTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,.85)'); r.addColorStop(0.5, 'rgba(235,245,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  M.foam = new THREE.SpriteMaterial({ map: foamTex, transparent: true, depthWrite: false, opacity: 0.8 });
  // sun shafts through the jungle: soft additive beams
  const shaftTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
    const gx = g.createLinearGradient(0, 0, 64, 0); gx.addColorStop(0, 'rgba(255,255,255,0)'); gx.addColorStop(0.5, 'rgba(255,255,255,1)'); gx.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gx; g.fillRect(0, 0, 64, 256);
    g.globalCompositeOperation = 'destination-in';
    const gy = g.createLinearGradient(0, 0, 0, 256); gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.25, 'rgba(0,0,0,.9)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gy; g.fillRect(0, 0, 64, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  M.shaft = new THREE.MeshBasicMaterial({ map: shaftTex, color: 0xffe2a8, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });

  async function tex(file, srgb, wrap = true) {
    const buf = await loadBinary(file);
    const bmp = await createImageBitmap(new Blob([buf]), { imageOrientation: 'flipY' });
    const t = new THREE.Texture(bmp); t.flipY = false;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = ANISO; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true;
    return t;
  }
  async function load() {
    const [road, roadN, roadArm, wall, wallN, wallArm, rock, rockN, wood, woodN, fol, lv, lvN, bk, bkN, fr] = await Promise.all([
      tex('tex-road.jpg', true), tex('tex-road-n.jpg', false), tex('tex-road-arm.jpg', false),
      tex('tex-wall.jpg', true), tex('tex-wall-n.jpg', false), tex('tex-wall-arm.jpg', false),
      tex('tex-rock.jpg', true), tex('tex-rock-n.jpg', false), tex('tex-wood.jpg', true), tex('tex-wood-n.jpg', false),
      tex('tex-foliage.png', true, false),
      tex('tex-leaves.jpg', true), tex('tex-leaves-n.jpg', false), tex('tex-bark.jpg', true), tex('tex-bark-n.jpg', false),
      tex('tex-frond.png', true, false),
    ]);
    Object.assign(M.frond, { map: fr, visible: true });
    Object.assign(M.leaves, { map: lv, normalMap: lvN, normalScale: new THREE.Vector2(1.3, 1.3) });
    Object.assign(M.crown, { map: lv, normalMap: lvN, color: new THREE.Color(0xffffff) });
    Object.assign(M.bark, { map: bk, normalMap: bkN });
    if (canopy) { const c = lv.clone(); c.repeat.set(900 / 9, 900 / 9); c.needsUpdate = true; Object.assign(canopy, { map: c, color: new THREE.Color(0x6f8f5a) }); canopy.needsUpdate = true; }
    Object.assign(M.path, { map: road, normalMap: roadN, roughnessMap: roadArm, aoMap: roadArm, aoMapIntensity: 0.9, roughness: 1, normalScale: new THREE.Vector2(1.1, 1.1) });
    Object.assign(M.wall, { map: wall, normalMap: wallN, roughnessMap: wallArm, aoMap: wallArm, aoMapIntensity: 0.9, roughness: 1, normalScale: new THREE.Vector2(1.2, 1.2) });
    Object.assign(M.rock, { map: rock, normalMap: rockN, normalScale: new THREE.Vector2(1.4, 1.4) });
    Object.assign(M.mineFloor, { map: rock, normalMap: rockN });
    Object.assign(M.plank, { map: wood, normalMap: woodN });
    roadArm.channel = 0; wallArm.channel = 0;
    M.fern.map = fol; M.vine.map = fol; M.fern.visible = M.vine.visible = true;
    for (const m of [M.path, M.wall, M.rock, M.mineFloor, M.plank, M.fern, M.vine, M.leaves, M.bark, M.crown, M.frond]) m.needsUpdate = true;
  }

  // ---------------------------------------------------------------- geometry
  const G = {};
  // carved curb blocks along the road edge and taller posts with a cap every few metres
  G.curb = scaleBoxUV(new RoundedBoxGeometry(1.75, 0.6, 0.66, 1, 0.06), 1.75, 0.6, 0.66, 4);
  G.post = scaleBoxUV(new RoundedBoxGeometry(0.86, 1.25, 0.86, 1, 0.07), 0.86, 1.25, 0.86, 4).translate(0, 0.62, 0);
  G.cap = scaleBoxUV(new RoundedBoxGeometry(1.08, 0.22, 1.08, 1, 0.05), 1.08, 0.22, 1.08, 4).translate(0, 1.36, 0);
  G.ball = new THREE.SphereGeometry(0.3, 12, 8).translate(0, 1.72, 0);
  // buttresses under the road: tall piers that drop into the jungle below
  G.pier = scaleBoxUV(new THREE.BoxGeometry(1.3, 30, 1.0), 1.3, 30, 1.0, 4).translate(0, -15, 0);
  G.pierCap = scaleBoxUV(new RoundedBoxGeometry(1.6, 0.5, 1.3, 1, 0.06), 1.6, 0.5, 1.3, 4);
  // rope bridge: a plank (0.32 m wide, full road width), posts, rope
  G.plank = scaleBoxUV(new THREE.BoxGeometry(1, 0.16, 0.3), 1, 0.16, 0.3, 2);
  G.bridgePost = new THREE.CylinderGeometry(0.11, 0.14, 1.5, 7).translate(0, 0.75, 0);
  G.rope = new THREE.CylinderGeometry(0.035, 0.035, 1, 5).rotateX(Math.PI / 2);
  G.bridgeBeam = new THREE.BoxGeometry(0.28, 0.28, 1);

  // rock spires: noisy, stretched, flat-bottomed; cylindrical UVs so the strata run around them
  G.spires = [0, 1, 2].map((v) => {
    const g = new THREE.IcosahedronGeometry(1, 5), pos = g.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const n = fbm3(x * 1.6 + v * 7, y * 1.6, z * 1.6, 4), m = fbm3(x * 5 + v, y * 5, z * 5, 3);
      const r = 0.75 + 0.55 * n + 0.12 * m;
      // taper to a ragged top, bulge near the bottom
      const t = (y + 1) / 2;
      const w = (0.55 + 0.45 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.95)) * (1.1 - 0.35 * t);
      x *= r * w; z *= r * w; y = y * (1 + 0.25 * (n - 0.5));
      // terraces: snap heights a little
      y = y * 0.85 + Math.round(y * 6) / 6 * 0.15;
      pos.setXYZ(i, x, y, z);
      uv[i * 2] = (Math.atan2(z, x) / (Math.PI * 2) + 0.5) * 3; uv[i * 2 + 1] = y * 3.2;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  });
  // ---- foliage blobs: noise-displaced spheres, spherical UVs (the leaf texture hides the seams),
  // vertex colours carry the shading: dark underneath and deep inside, a little hue drift per blob
  function blob(seed, cx, cy, cz, rx, ry, rz, tint, detail = 2, uvPer = 2.2) {
    let g = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('uv'); g.deleteAttribute('normal');
    const pos = g.attributes.position, colr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const n = fbm3(x * 1.8 + seed * 3.1, y * 1.8, z * 1.8, 4), m = fbm3(x * 6 + seed, y * 6, z * 6, 2);
      const r = 0.72 + 0.5 * n + 0.1 * m;
      pos.setXYZ(i, cx + x * r * rx, cy + y * r * ry * (y < 0 ? 0.7 : 1), cz + z * r * rz);
      const k = Math.max(0.28, Math.min(1.1, 0.55 + 0.45 * y + 0.5 * (n - 0.5) + 0.2 * (r - 0.9)));
      colr[i * 3] = tint[0] * k; colr[i * 3 + 1] = tint[1] * k; colr[i * 3 + 2] = tint[2] * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    // smooth normals (weld), then back to separate triangles for box-projected UVs
    g = mergeVertices(g, 1e-4); g.computeVertexNormals(); g = g.toNonIndexed();
    const p = g.attributes.position, nr = g.attributes.normal, uv = new Float32Array(p.count * 2);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let t = 0; t < p.count; t += 3) {
      a.fromBufferAttribute(p, t); b.fromBufferAttribute(p, t + 1); c.fromBufferAttribute(p, t + 2);
      const fn = b.clone().sub(a).cross(c.clone().sub(a)); const ax = Math.abs(fn.x), ay = Math.abs(fn.y), az = Math.abs(fn.z);
      for (let k = 0; k < 3; k++) {
        const x = p.getX(t + k), y = p.getY(t + k), z = p.getZ(t + k);
        const [u, v] = ay >= ax && ay >= az ? [x, z] : ax >= az ? [z, y] : [x, y];
        uv[(t + k) * 2] = u / uvPer + seed * 0.37; uv[(t + k) * 2 + 1] = v / uvPer;
      }
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    // bias the normals toward "up and out" so the clump reads as a mass of leaves, not a ball
    for (let i = 0; i < nr.count; i++) { const v = new THREE.Vector3(nr.getX(i), nr.getY(i) + 0.6, nr.getZ(i)).normalize(); nr.setXYZ(i, v.x, v.y, v.z); }
    return g;
  }
  const TINTS = [[0.85, 1, 0.75], [1, 1, 0.8], [0.75, 0.95, 0.8], [1.05, 1.05, 0.7], [0.8, 0.9, 0.7]];
  // tree sea crowns (below the road): two or three blobs each
  G.crowns = [0, 1].map((v) => {
    const parts = [blob(v * 11 + 1, 0, 0.1, 0, 1, 0.75, 1, TINTS[v], 1, 0.3)];
    for (let k = 0; k < 2 + v; k++) { const a = k * 2.4 + v; parts.push(blob(v * 11 + k + 2, Math.cos(a) * 0.65, -0.05 + 0.15 * k, Math.sin(a) * 0.65, 0.6, 0.5, 0.6, TINTS[(v + k + 1) % 5], 1, 0.3)); }
    return mergeGeometries(parts);
  });
  // ---- jungle trees: a leaning, tapering trunk with branches and several leaf clumps, ~14 m tall.
  // Two material groups: 0 bark, 1 leaves.
  function trunk(pts, r0, r1, seg = 8, len = 7) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    const g = new THREE.TubeGeometry(curve, len, 1, seg, false), pos = g.attributes.position, nr = g.attributes.normal, uv = g.attributes.uv;
    // taper: the tube is built with radius 1; pull each ring toward its centre
    const rings = len + 1;
    for (let i = 0; i < pos.count; i++) {
      const ring = Math.floor(i / (seg + 1)), t = ring / (rings - 1), c = curve.getPointAt(t);
      const rr = r0 + (r1 - r0) * t, flare = 1 + 0.9 * Math.max(0, 0.12 - t) / 0.12;
      pos.setXYZ(i, c.x + nr.getX(i) * rr * flare, c.y + nr.getY(i) * rr * flare, c.z + nr.getZ(i) * rr * flare);
      uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * curve.getLength() / 2.5);
    }
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const t = Math.floor(i / (seg + 1)) / (rings - 1); const k = 0.55 + 0.45 * t; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g.toNonIndexed();
  }
  G.trees = [0, 1, 2].map((v) => {
    const R = (k) => vnoise3(v * 13.7 + k * 3.3, k * 1.7, v);   // deterministic 0..1
    const lean = (R(1) - 0.5) * 2.2, top = [lean, 10 + R(2) * 2, (R(3) - 0.5) * 1.5];
    const bark = [trunk([[0, 0, 0], [lean * 0.2, 4, 0.2], [lean * 0.6, 7.5, top[2] * 0.5], top], 0.55, 0.22)];
    const leaves = [];
    const crownN = v === 2 ? 6 : 5;
    for (let k = 0; k < crownN; k++) {
      const a = k / crownN * Math.PI * 2 + R(k + 5) * 0.8, h = 8.2 + R(k + 9) * 3.2, d = 1.4 + R(k + 13) * 1.6;
      const end = [top[0] + Math.cos(a) * d * 1.3, h + 0.6, top[2] + Math.sin(a) * d * 1.3];
      bark.push(trunk([[top[0] * (h / 12), h - 2.2, top[2] * (h / 12)], [(top[0] + end[0]) / 2, h - 0.6, (top[2] + end[2]) / 2], end], 0.18, 0.08, 5, 3));
      const s = 2.1 + R(k + 17) * 1.2;
      leaves.push(blob(v * 31 + k, end[0], end[1] + 0.5, end[2], s, s * 0.62, s, TINTS[(k + v) % 5], k % 2 ? 1 : 2));
    }
    leaves.push(blob(v * 31 + 9, top[0], top[1] + 1.3, top[2], 2.6, 1.6, 2.6, TINTS[v], 2));
    if (v === 1) leaves.push(blob(77, lean * 0.45, 6.2, 0.3, 1.5, 0.9, 1.5, TINTS[2], 1));   // a low side clump
    const gb = mergeGeometries(bark), gl = mergeGeometries(leaves);
    for (const g of [gb, gl]) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    const g = mergeGeometries([gb, gl], true);
    g.computeBoundingBox(); g.userData.h = g.boundingBox.max.y;
    { const p = g.attributes.position; let r = 0; for (let i = 0; i < p.count; i++) r = Math.max(r, Math.hypot(p.getX(i), p.getZ(i))); g.userData.r = r; }
    return g;
  });
  // ---- palms: a leaning, ringed trunk and a crown of drooping pinnate fronds (groups: 0 bark, 1 fronds)
  function frond(top, a, L, W, droop, lift) {
    const g = new THREE.PlaneGeometry(1, 1, 2, 7), pos = g.attributes.position, uv = g.attributes.uv;
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), u = pos.getY(i) + 0.5;
      const along = u * L, h = L * (lift * u - droop * u * u), across = x * W * (1 - 0.55 * u * u);
      pos.setXYZ(i, top[0] + ca * along - sa * across, top[1] + h - Math.abs(x) * W * 0.28, top[2] + sa * along + ca * across);
      uv.setXY(i, x + 0.5, u);
    }
    g.computeVertexNormals();
    const col = new Float32Array(pos.count * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g.toNonIndexed();
  }
  G.palms = [0, 1].map((v) => {
    const R = (k) => vnoise3(v * 9.1 + k * 2.7, k * 1.3, 5 + v);
    const bend = 1.2 + R(1) * 1.6, top = [bend, 11 + R(2) * 1.5, (R(3) - 0.5) * 0.8];
    const tr = trunk([[0, 0, 0], [bend * 0.15, 4, 0], [bend * 0.55, 8, top[2] * 0.5], top], 0.34, 0.2, 8, 8);
    // trunk rings: darken every ~0.4 m
    const p = tr.attributes.position, c = tr.attributes.color;
    for (let i = 0; i < p.count; i++) { const k = 0.8 + 0.2 * Math.abs(Math.sin(p.getY(i) * 7.5)); c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k); }
    const fr = [];
    const n = 10;
    for (let k = 0; k < n; k++) fr.push(frond(top, k / n * Math.PI * 2 + R(k + 4) * 0.5, 4.2 + R(k + 7) * 1.2, 1.5, 0.55 + R(k + 11) * 0.35, 0.45));
    for (let k = 0; k < 3; k++) fr.push(frond(top, k * 2.1 + 0.4, 2.8, 1.1, 0.1, 0.9));   // young fronds standing up
    for (const g of [tr, ...fr]) for (const key of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(key)) g.deleteAttribute(key);
    const g = mergeGeometries([tr, mergeGeometries(fr)], true);
    g.computeBoundingBox(); g.userData.h = g.boundingBox.max.y;
    { const p = g.attributes.position; let r = 0; for (let i = 0; i < p.count; i++) r = Math.max(r, Math.hypot(p.getX(i), p.getZ(i))); g.userData.r = r; }
    return g;
  });
  // ---- carved stone columns beside the road (wall material): plinth, fluted shaft, capital; some broken
  function lathe(rad, y0, y1, flutes, seg, per, broken) {
    const g = new THREE.CylinderGeometry(rad, rad * 1.06, y1 - y0, seg, broken ? 4 : 1, false).translate(0, (y0 + y1) / 2, 0);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), a = Math.atan2(z, x), r = Math.hypot(x, z);
      if (r < 1e-4) continue;
      const f = flutes ? 1 - 0.06 * Math.max(0, Math.cos(a * flutes)) ** 2 : 1;
      let yy = y;
      if (broken && y > y1 - 0.01) yy = y1 - 0.9 * fbm3(Math.cos(a) * 2 + broken, Math.sin(a) * 2, broken, 3) - 0.4 * Math.max(0, Math.cos(a - broken));
      pos.setXYZ(i, x * f, yy, z * f);
      uv.setXY(i, (a / (Math.PI * 2) + 0.5) * Math.PI * 2 * rad / per, yy / per);
    }
    g.computeVertexNormals();
    return g;
  }
  function slabUV(w, h, d, y) { return scaleBoxUV(new RoundedBoxGeometry(w, h, d, 1, 0.05), w, h, d, 4).translate(0, y, 0); }
  G.columns = [0, 1, 2].map((v) => {
    const broken = v === 2 ? 1.7 : 0, H = 6;
    const parts = [slabUV(1.5, 0.5, 1.5, 0.25), slabUV(1.25, 0.25, 1.25, 0.62), lathe(0.48, 0.74, broken ? H - 1.2 : H - 0.55, v === 1 ? 0 : 12, 24, 4, broken)];
    if (!broken) { parts.push(slabUV(1.2, 0.22, 1.2, H - 0.44)); parts.push(slabUV(1.45, 0.34, 1.45, H - 0.17)); }
    if (v === 1) for (let k = 1; k < 4; k++) parts.push(lathe(0.53, 0.74 + k * 1.2, 0.74 + k * 1.2 + 0.14, 0, 16, 4, 0));   // banded drum joints
    const g = mergeGeometries(parts.map((p) => { const q = p.index ? p.toNonIndexed() : p; for (const k of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(k)) q.deleteAttribute(k); return q; }));
    g.userData.h = H;
    return g;
  });
  // fern: two crossed cards using the left half of the foliage atlas; vine: one card, right half
  G.fern = (() => {
    const a = new THREE.PlaneGeometry(1.6, 1.6, 1, 2).translate(0, 0.8, 0), uv = a.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5);
    const b = a.clone().rotateY(Math.PI / 2);
    const g = new THREE.BufferGeometry();
    const merge = (ga, gb) => { const p = [...ga.attributes.position.array, ...gb.attributes.position.array], n = [...ga.attributes.normal.array, ...gb.attributes.normal.array], u = [...ga.attributes.uv.array, ...gb.attributes.uv.array];
      const ia = [...ga.index.array], ib = [...gb.index.array].map((x) => x + ga.attributes.position.count);
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); g.setIndex([...ia, ...ib]); };
    merge(a, b); g.attributes.normal.array.fill(0); for (let i = 1; i < g.attributes.normal.count * 3; i += 3) g.attributes.normal.array[i] = 1;   // lit like the ground
    return g;
  })();
  G.vine = (() => {
    const g = new THREE.PlaneGeometry(1.3, 3.6, 1, 3).translate(0, -1.8, 0), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) { uv.setX(i, 0.5 + uv.getX(i) * 0.5); uv.setY(i, 1 - uv.getY(i)); }   // tips at the bottom sway
    return g;
  })();
  // rough rock wall block for the mine cutting (box with noisy faces, ~4 x 1 x 6 m before scaling)
  G.rockWall = (() => {
    const g = new THREE.BoxGeometry(2.4, 1, 6, 6, 6, 12), pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const n = fbm3(x * 0.9 + 3, y * 4, z * 0.7, 4) - 0.5, m = fbm3(x * 3, y * 12, z * 3, 2) - 0.5;
      pos.setXYZ(i, x * (1 + 0.6 * n) + 0.25 * m, y + (y > 0.45 ? n * 0.25 : 0), z * (1 + 0.1 * n));
    }
    scaleBoxUV(g, 2.4, 6, 6, 4); g.translate(0, 0.5, 0); g.computeVertexNormals(); return g;
  })();
  G.fall = new THREE.PlaneGeometry(1, 1, 1, 8).translate(0, -0.5, 0);
  G.shaft = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);

  let tt = 0;
  return {
    M, G, load,
    update(dt) { tt += dt; wind.value = tt; waterTex.offset.y = (tt * 1.6) % 1; },
  };
}
