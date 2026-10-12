// Props kit: everything the runner meets on the road, built procedurally so it matches the PBR scenery.
// Obstacles (fallen trunks, fire troughs, carved gates, idol heads, totems, rock spires, broken columns),
// torches with shader flames, rubble, urns and bushes, and the pickups (coins, gems, power-ups, hunt medallions).
// game.js places them; nothing here knows about gameplay.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm3, scaleBoxUV } from './scenery.js';

const KEEP = ['position', 'normal', 'uv', 'color'];
function clean(g, color) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (color !== undefined || !g.attributes.color) {
    const c = new THREE.Color(color ?? 0xffffff), a = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  return g;
}
const merge = (parts, groups = false) => mergeGeometries(parts, groups);
const flat = (g, hex) => { g = clean(g, hex); g.computeVertexNormals(); return g; };
const rbox = (w, h, d, x, y, z, per = 2, r = 0.06) => scaleBoxUV(new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 3, h / 3, d / 3)), w, h, d, per).translate(x, y, z);
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// noise-displace a geometry outward along its normals (welded first so it stays closed)
function roughen(g, amp, freq, seed) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g = mergeVertices(g, 1e-4); g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = amp * (fbm3(x * freq + seed, y * freq, z * freq, 4) - 0.5);
    p.setXYZ(i, x + n.getX(i) * k, y + n.getY(i) * k, z + n.getZ(i) * k);
  }
  g.computeVertexNormals(); return clean(g.toNonIndexed());
}
// box-projected UVs per triangle (for noisy rock shapes)
function boxUV(g, per) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < p.count; t += 3) {
    a.fromBufferAttribute(p, t); b.fromBufferAttribute(p, t + 1); c.fromBufferAttribute(p, t + 2);
    const fn = b.clone().sub(a).cross(c.clone().sub(a)), ax = Math.abs(fn.x), ay = Math.abs(fn.y), az = Math.abs(fn.z);
    for (let k = 0; k < 3; k++) {
      const x = p.getX(t + k), y = p.getY(t + k), z = p.getZ(t + k);
      const [u, v] = ay >= ax && ay >= az ? [x, z] : ax >= az ? [z, y] : [x, y];
      uv[(t + k) * 2] = u / per; uv[(t + k) * 2 + 1] = v / per;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}
function shade(g, fn) {   // vertex colours from a function of position / normal
  const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color, col = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(col.setRGB(c.getX(i), c.getY(i), c.getZ(i)), p.getX(i), p.getY(i), p.getZ(i), n.getY(i)); c.setXYZ(i, col.r, col.g, col.b); }
  return g;
}

export function createProps({ renderer, SC }) {
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
  const M = {}, G = {};

  // ---------------------------------------------------------------- materials
  // carved stone with per-vertex tint (dark eye sockets, mossy tops); shares the wall textures once loaded
  M.stone = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  M.rock = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  M.bark = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  M.terracotta = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xc77a4a, roughness: 0.8, metalness: 0 });
  M.leaves = SC.M.leaves;
  const ringTex = canvasTex(256, 256, (g) => {
    g.fillStyle = '#c9a06a'; g.fillRect(0, 0, 256, 256);
    for (let r = 120; r > 4; r -= 5 + Math.random() * 6) {
      g.strokeStyle = `rgba(${110 + Math.random() * 30},${70 + Math.random() * 20},${35},${0.35 + Math.random() * 0.35})`; g.lineWidth = 1.5 + Math.random() * 2;
      g.beginPath(); g.ellipse(128 + Math.random() * 3, 128 + Math.random() * 3, r, r * (0.95 + Math.random() * 0.08), Math.random(), 0, Math.PI * 2); g.stroke();
    }
    g.strokeStyle = 'rgba(60,35,15,.8)'; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 123, 0, Math.PI * 2); g.stroke();
    for (let k = 0; k < 5; k++) { const a = Math.random() * 6.28; g.strokeStyle = 'rgba(70,40,20,.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * 118, 128 + Math.sin(a) * 118); g.stroke(); }
  });
  M.rings = new THREE.MeshStandardMaterial({ map: ringTex, roughness: 0.9, metalness: 0 });

  // coins: a raised rim and a relief idol on the face (bump map), real metal reflections
  const coinBump = canvasTex(256, 256, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
    const rg = g.createRadialGradient(128, 128, 96, 128, 128, 128); rg.addColorStop(0, '#000'); rg.addColorStop(0.3, '#fff'); rg.addColorStop(0.75, '#fff'); rg.addColorStop(1, '#000');
    g.fillStyle = rg; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#000'; g.beginPath(); g.arc(128, 128, 96, 0, Math.PI * 2); g.fill();
    // a little idol face: head, eyes, mouth
    g.fillStyle = '#bbb'; g.beginPath(); g.moveTo(128, 50); g.lineTo(184, 92); g.lineTo(176, 182); g.lineTo(80, 182); g.lineTo(72, 92); g.closePath(); g.fill();
    g.fillStyle = '#333'; g.fillRect(96, 108, 22, 14); g.fillRect(138, 108, 22, 14); g.fillRect(104, 150, 48, 10);
    g.fillStyle = '#fff'; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; g.beginPath(); g.arc(128 + Math.cos(a) * 110, 128 + Math.sin(a) * 110, 4, 0, Math.PI * 2); g.fill(); }
  }, false);
  const metal = (color, emissive, ei) => new THREE.MeshStandardMaterial({ color, metalness: 0.9, roughness: 0.26, emissive, emissiveIntensity: ei, envMap: env, envMapIntensity: 1.1, bumpMap: coinBump, bumpScale: 2.2 });
  M.gold = metal(0xffc23a, 0x6a3c00, 0.42);
  M.coinRed = metal(0xff4f3a, 0x6a0c00, 0.5);
  M.coinBlue = metal(0x4fb8ff, 0x003a70, 0.55);
  M.goldPlain = new THREE.MeshStandardMaterial({ color: 0xffc23a, metalness: 0.9, roughness: 0.3, emissive: 0x4a2a00, emissiveIntensity: 0.3, envMap: env, envMapIntensity: 1.0 });
  M.silver = new THREE.MeshStandardMaterial({ color: 0xdfe6ea, metalness: 0.95, roughness: 0.22, envMap: env, envMapIntensity: 1.0 });
  M.enamelRed = new THREE.MeshStandardMaterial({ color: 0xd8382c, metalness: 0.2, roughness: 0.25, envMap: env, envMapIntensity: 0.8 });
  M.enamelBlue = new THREE.MeshStandardMaterial({ color: 0x2f7fd8, metalness: 0.25, roughness: 0.22, envMap: env, envMapIntensity: 0.9, emissive: 0x0a2a5a, emissiveIntensity: 0.4 });
  M.jade = new THREE.MeshStandardMaterial({ color: 0x3fd8a8, metalness: 0.15, roughness: 0.18, envMap: env, envMapIntensity: 1.1, emissive: 0x0d6b50, emissiveIntensity: 0.55, flatShading: true });
  M.gem = new THREE.MeshStandardMaterial({ color: 0x55d6ff, metalness: 0.2, roughness: 0.04, envMap: env, envMapIntensity: 2.2, emissive: 0x0a5a9a, emissiveIntensity: 0.6, flatShading: true });
  M.ruby = new THREE.MeshStandardMaterial({ color: 0xff3a5a, metalness: 0.2, roughness: 0.05, envMap: env, envMapIntensity: 2, emissive: 0x6a0018, emissiveIntensity: 0.6, flatShading: true });

  // ---------------------------------------------------------------- shader fire
  const uTime = { value: 0 };
  const NOISE = `
    float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p){ float a = 0.0, w = 0.5; for (int i = 0; i < 4; i++) { a += w * vn(p); p *= 2.03; w *= 0.5; } return a; }`;
  // a camera-facing quad (origin at the base) drawn additively; the flame shape and its flicker are procedural
  M.fire = new THREE.ShaderMaterial({
    uniforms: { uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `varying vec2 vUv; varying float vSeed;
      void main(){ vUv = uv; vec4 o = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0); vSeed = o.x * 1.7 + o.z * 1.3;
        vec2 s = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
        vec4 mv = viewMatrix * o; mv.xy += position.xy * s; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vSeed; ${NOISE}
      void main(){
        float t = uTime + vSeed;
        float n = fbm(vec2(vUv.x * 3.0 + vSeed, vUv.y * 2.2 - t * 2.6));
        float n2 = fbm(vec2(vUv.x * 7.0 - vSeed, vUv.y * 5.0 - t * 4.2));
        vec2 p = vUv - vec2(0.5, 0.0);
        p.x += (n - 0.5) * 0.32 * vUv.y;
        float w = (1.0 - vUv.y) * 0.4 + 0.03;
        float body = 1.0 - smoothstep(w * 0.35, w, abs(p.x));
        body *= smoothstep(0.0, 0.07, vUv.y) * (1.0 - smoothstep(0.45, 0.95, vUv.y + (n2 - 0.5) * 0.45));
        float heat = body * (1.15 - vUv.y);
        vec3 col = mix(vec3(0.85, 0.12, 0.02), vec3(1.0, 0.5, 0.06), smoothstep(0.1, 0.45, heat));
        col = mix(col, vec3(1.0, 0.92, 0.62), smoothstep(0.55, 0.95, heat));
        gl_FragColor = vec4(col * body * 1.35, 1.0);
      }`,
  });
  // glowing coal bed with slow pulsing hot spots
  M.coals = new THREE.ShaderMaterial({
    uniforms: { uTime },
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying vec3 vW; ${NOISE}
      void main(){
        vec2 q = vW.xz * 2.6;
        float c = fbm(q + vec2(0.0, uTime * 0.15)), cr = fbm(q * 2.3 - uTime * 0.25);
        float hot = smoothstep(0.45, 0.8, c) * (0.65 + 0.35 * sin(uTime * 3.0 + cr * 9.0));
        float crack = smoothstep(0.03, 0.0, abs(fbm(q * 1.4) - 0.5));
        vec3 col = mix(vec3(0.06, 0.03, 0.02), vec3(0.9, 0.22, 0.03), hot) + vec3(1.0, 0.55, 0.1) * crack * 0.8;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  G.flameQuad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);

  // ---------------------------------------------------------------- obstacles
  // fallen trunk lying across the road (for 'low'): bark with moss on top, sawn ends with growth rings, stubs
  G.logs = [0, 1].map((v) => {
    const len = 8.2, r = 0.42;
    let body = new THREE.CylinderGeometry(r, r * 1.08, len, 18, 10, true).rotateZ(Math.PI / 2);
    const p = body.attributes.position, uv = body.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, y);
      const k = 1 + 0.08 * (fbm3(x * 0.8 + v * 9, Math.cos(a) * 1.5, Math.sin(a) * 1.5, 4) - 0.5) + 0.05 * Math.exp(-((x - 1.7 + v * 3) ** 2) * 6);
      p.setXYZ(i, x, y * k, z * k);
      uv.setXY(i, (a / (Math.PI * 2) + 0.5) * 2, x / 2.4);
    }
    body.computeVertexNormals(); body = clean(body, 0xffe0c0); shade(body, (c) => c.multiplyScalar(1.45));
    shade(body, (c, x, y, z, ny) => { const m = Math.max(0, ny - 0.35) * 1.6 * (0.55 + fbm3(x * 1.3 + 5, y, z, 3)); c.lerp(new THREE.Color(0x5f8a3a), Math.min(0.85, m)); });
    const parts = [body];
    for (const [sx, a, l] of [[-2.2 + v, 0.6, 0.6], [1.1 - v * 0.6, -0.9, 0.45], [2.9, 2.4, 0.4]]) {
      const b = clean(new THREE.CylinderGeometry(0.07, 0.11, l, 7).translate(0, l / 2, 0).rotateZ(-0.3).rotateX(a).translate(sx, 0, 0));
      const bp = b.attributes.position; for (let i = 0; i < bp.count; i++) { const y = bp.getY(i), z = bp.getZ(i), d = Math.hypot(y, z); if (d < r) { const s = r * 0.9 / Math.max(d, 1e-3); bp.setXYZ(i, bp.getX(i), y * s, z * s); } }
      parts.push(b);
    }
    const ends = [];
    for (const s of [-1, 1]) {
      const cap = clean(new THREE.CircleGeometry(r * (s < 0 ? 1 : 1.08) * 0.99, 18).rotateY(s * Math.PI / 2).translate(s * len / 2, 0, 0));
      ends.push(cap);
    }
    const g = merge([merge(parts), merge(ends)], true);
    g.translate(0, r * 1.02, 0);
    return g;
  });

  // carved stone pieces share one material: tint per piece with vertex colours
  const tinted = (g, hex) => clean(g, hex);
  const STONE = 0xffffff, DARK = 0x4a3f36, MOSS = 0x93a86a, GOLDV = 0xe8b860;
  const moss = (g, amt = 0.6) => shade(g, (c, x, y, z, ny) => { const m = Math.max(0, ny - 0.4) * amt * (0.4 + fbm3(x * 2 + 3, y * 2, z * 2, 3)); c.lerp(new THREE.Color(0x6f8f45), Math.min(0.75, m)); });

  // stone gate over the road (for 'high'): two pillars, a carved lintel whose underside sits at 1.25 m
  G.gate = (() => {
    const W = 7.2 + 2.6, parts = [];
    for (const s of [-1, 1]) {
      const x = s * (3.6 + 0.55);
      parts.push(tinted(rbox(1.2, 0.35, 1.2, x, 0.175, 0), STONE), tinted(rbox(0.9, 1.0, 0.9, x, 0.85, 0, 2), STONE));
      parts.push(tinted(rbox(1.05, 0.12, 1.05, x, 1.0, 0), 0xd8c8a8));
    }
    parts.push(tinted(rbox(W, 0.82, 1.0, 0, 1.25 + 0.41, 0, 2.2, 0.08), STONE));
    parts.push(tinted(rbox(W + 0.3, 0.2, 1.15, 0, 2.18, 0, 2), 0xe0d0b0));
    for (let k = -3; k <= 3; k++) parts.push(tinted(rbox(0.5, 0.42, 0.12, k * 1.2, 1.66, 0.52, 1), k === 0 ? GOLDV : 0xb0a088));   // carved panels, gold idol in the middle
    parts.push(tinted(rbox(0.8, 0.5, 0.28, 0, 2.5, 0, 1), STONE), tinted(rbox(0.22, 0.1, 0.06, -0.17, 2.55, 0.15, 1), DARK), tinted(rbox(0.22, 0.1, 0.06, 0.17, 2.55, 0.15, 1), DARK));
    return moss(merge(parts));
  })();

  // big stone idol head on a plinth (a lane block)
  G.idolHead = (() => {
    const P = [];
    P.push(tinted(rbox(1.75, 0.45, 1.6, 0, 0.225, 0), STONE));
    P.push(tinted(rbox(1.55, 1.8, 1.4, 0, 1.35, 0, 2, 0.18), STONE));
    P.push(tinted(rbox(1.7, 0.36, 1.52, 0, 2.3, 0, 2, 0.1), 0xd9c9a9));                         // headband
    P.push(tinted(rbox(1.2, 0.28, 0.5, 0, 2.6, -0.1, 2, 0.08), STONE));                          // crown ridge
    P.push(tinted(rbox(1.25, 0.16, 0.26, 0, 1.86, 0.7, 1), 0xe0d2b8));                          // brow
    for (const s of [-1, 1]) {
      P.push(tinted(rbox(0.36, 0.17, 0.08, s * 0.33, 1.66, 0.7, 1), DARK));                     // eyes
      P.push(tinted(rbox(0.12, 0.08, 0.06, s * 0.33, 1.66, 0.74, 1), GOLDV));                    // gold pupils
      P.push(tinted(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 12).rotateZ(Math.PI / 2).translate(s * 0.84, 1.45, 0.1), 0xd0c0a0));   // ear spools
    }
    P.push(flat(new THREE.CylinderGeometry(0.12, 0.2, 0.55, 4).rotateY(Math.PI / 4).translate(0, 1.38, 0.74), STONE));   // nose
    P.push(tinted(rbox(0.72, 0.16, 0.1, 0, 0.98, 0.7, 1), DARK));                              // mouth
    P.push(tinted(rbox(0.82, 0.08, 0.12, 0, 1.08, 0.71, 1), 0xe0d2b8));
    return moss(merge(P), 0.8);
  })();
  // a carved totem of stacked blocks (a lane block)
  G.totem = (() => {
    const P = [];
    P.push(tinted(rbox(1.6, 0.4, 1.5, 0, 0.2, 0), STONE));
    P.push(tinted(rbox(1.35, 1.05, 1.25, 0, 0.92, 0, 1.6, 0.1), STONE));
    P.push(tinted(rbox(1.45, 0.14, 1.35, 0, 1.5, 0), 0xd0c0a0));
    P.push(tinted(rbox(1.28, 1.0, 1.2, 0, 2.08, 0, 1.6, 0.12), STONE));
    for (const s of [-1, 1]) { P.push(tinted(rbox(0.3, 0.3, 0.08, s * 0.3, 2.2, 0.6, 1), DARK)); P.push(tinted(rbox(0.1, 0.1, 0.05, s * 0.3, 2.2, 0.64, 1), GOLDV)); }
    P.push(tinted(rbox(0.6, 0.12, 0.08, 0, 1.85, 0.6, 1), DARK));
    for (let k = -1; k <= 1; k++) P.push(tinted(rbox(0.3, 0.6, 0.08, k * 0.42, 0.95, 0.63, 1), 0xb8a888));
    P.push(tinted(rbox(1.55, 0.3, 1.45, 0, 2.73, 0, 1.6, 0.06), 0xd8c8a8));
    P.push(flat(new THREE.ConeGeometry(0.55, 0.55, 4).rotateY(Math.PI / 4).translate(0, 3.15, 0), STONE));
    return moss(merge(P), 0.9);
  })();
  // a tall rock standing in a lane
  G.rockSpire = [0, 1].map((v) => {
    // a weathered standing rock: a tapering, leaning column with ledges, cracks and a broken top
    let g = new THREE.CylinderGeometry(0.62, 0.95, 3.0, 10, 10, false).translate(0, 1.5, 0);
    g = g.toNonIndexed(); for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    g = mergeVertices(g, 1e-4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x), r = Math.hypot(x, z);
      const ledge = 0.12 * Math.sin(y * 4.2 + v * 2) + 0.1 * (fbm3(Math.cos(a) * 2 + v * 5, y * 1.6, Math.sin(a) * 2, 4) - 0.5) * 4;
      const crack = -0.12 * Math.pow(Math.abs(Math.sin(a * 2.5 + v + y * 0.6)), 14);
      const k = r > 1e-3 ? (r + (ledge + crack) * r) / r : 1;
      x *= k; z *= k;
      if (y > 2.95) y = 2.95 + 0.55 * fbm3(x * 2 + v, 3, z * 2, 3) - 0.25 * Math.max(0, x * (v ? 1 : -1));   // broken top
      x += (y / 3) * (y / 3) * 0.25 * (v ? -1 : 1);                                                              // a slight lean
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals(); g = clean(g.toNonIndexed(), 0xffffff); boxUV(g, 2.0);
    shade(g, (c, x, y) => c.multiplyScalar(0.78 + 0.3 * Math.min(1, y / 3)));
    return moss(g, 1.1);
  });
  // rubble at broken floor and gap edges
  G.rubble = [0, 1, 2].map((v) => {
    let g = v === 2 ? new RoundedBoxGeometry(0.7, 0.45, 0.55, 1, 0.08) : new THREE.DodecahedronGeometry(0.4, 1);
    g = roughen(g, v === 2 ? 0.12 : 0.3, 3, v * 5); boxUV(g, 1.5); return moss(g, 0.5);
  });
  // obelisk at the junction: tapered shaft, gold pyramidion
  G.obelisk = (() => {
    const P = [tinted(rbox(1.0, 0.3, 1.0, 0, 0.15, 0), STONE), tinted(rbox(0.82, 0.18, 0.82, 0, 0.39, 0), 0xd8c8a8)];
    const shaft = new THREE.CylinderGeometry(0.29, 0.4, 2.3, 4, 1).rotateY(Math.PI / 4).translate(0, 0.48 + 1.15, 0);
    P.push(boxUV(flat(shaft, STONE), 1.4));
    P.push(flat(new THREE.ConeGeometry(0.42, 0.42, 4).rotateY(Math.PI / 4).translate(0, 2.99, 0), GOLDV));
    return moss(merge(P), 0.5);
  })();
  // stone brazier for torches: base, fluted stem, flared bowl (lathe), coals on top
  G.brazier = (() => {
    const pts = [[0, 0], [0.32, 0], [0.32, 0.12], [0.22, 0.2], [0.13, 0.28], [0.1, 0.5], [0.12, 1.2], [0.15, 1.32], [0.2, 1.4], [0.36, 1.56], [0.42, 1.7], [0.36, 1.74], [0.3, 1.66], [0, 1.66]].map(([r, y]) => new THREE.Vector2(r, y));
    const g = clean(new THREE.LatheGeometry(pts, 14));
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.5, uv.getY(i) * 0.6);
    return shade(g, (c, x, y) => { if (y > 1.36) c.setHex(0xd0c0a0); });
  })();
  // stone fire trough for burning traps: carved box with a lip
  G.trough = (() => {
    const P = [tinted(rbox(7.7, 0.32, 1.15, 0, 0.16, 0, 2), STONE), tinted(rbox(7.9, 0.12, 1.3, 0, 0.38, 0, 2), 0xd8c8a8)];
    for (let k = -3; k <= 3; k++) P.push(tinted(rbox(0.5, 0.2, 0.06, k * 1.1, 0.18, 0.58, 1), 0xb0a088));
    return merge(P);
  })();
  G.coalBed = new THREE.PlaneGeometry(7.6, 0.95).rotateX(-Math.PI / 2).translate(0, 0.45, 0);

  // urns and bushes along the curbs
  G.urn = (() => {
    const pts = [[0, 0], [0.2, 0], [0.24, 0.05], [0.3, 0.25], [0.33, 0.42], [0.27, 0.6], [0.16, 0.7], [0.15, 0.78], [0.22, 0.84], [0.2, 0.86], [0.13, 0.8], [0, 0.78]].map(([r, y]) => new THREE.Vector2(r, y));
    const g = clean(new THREE.LatheGeometry(pts, 14));
    return shade(g, (c, x, y) => { const b = Math.abs(y - 0.42) < 0.05 || Math.abs(y - 0.25) < 0.025; if (b) c.setHex(0x3a2418); else c.multiplyScalar(0.85 + 0.15 * fbm3(x * 6, y * 6, 1, 2)); });
  })();

  // ---------------------------------------------------------------- pickups
  // coin: bevelled rim + two faces with planar UVs (the relief lives in the bump map)
  G.coin = (() => {
    const R = 0.42, T = 0.1;
    const rim = clean(new THREE.LatheGeometry([[R * 0.86, -T / 2], [R, -T * 0.32], [R, T * 0.32], [R * 0.86, T / 2]].map(([r, y]) => new THREE.Vector2(r, y)), 28));
    const uvr = rim.attributes.uv; for (let i = 0; i < uvr.count; i++) uvr.setXY(i, 0.5, 0.5);
    const faces = [-1, 1].map((s) => { const f = clean(new THREE.CircleGeometry(R * 0.87, 28)); if (s < 0) f.rotateY(Math.PI); f.rotateX(-Math.PI / 2).translate(0, s * T / 2, 0); return f; });
    const g = merge([rim, ...faces]);
    // stand the coin up: its faces look along z (towards the runner)
    g.rotateX(Math.PI / 2); return g;
  })();
  // brilliant-cut gem
  G.gem = (() => {
    const pts = [[0, -0.42], [0.38, 0.0], [0.4, 0.05], [0.27, 0.2], [0, 0.2]].map(([r, y]) => new THREE.Vector2(r, y));
    return clean(new THREE.LatheGeometry(pts, 8));
  })();
  // hunt medallion: a big coin carrying the letter
  const letterMats = {};
  M.letter = (ch) => letterMats[ch] ||= new THREE.MeshStandardMaterial({
    metalness: 0.75, roughness: 0.3, envMap: env, envMapIntensity: 0.9, emissive: 0x3a2000, emissiveIntensity: 0.4,
    map: canvasTex(256, 256, (g) => {
      const gr = g.createRadialGradient(128, 110, 10, 128, 128, 128); gr.addColorStop(0, '#ffe9a0'); gr.addColorStop(0.7, '#f2b234'); gr.addColorStop(1, '#a8650c');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = '#7a4300'; g.lineWidth = 12; g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#5a2d00'; g.font = 'bold 150px "Lilita One", Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 128, 140);
    }),
  });

  function makeShield() {
    const g = new THREE.Group();
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.62, 28, 12, 0, Math.PI * 2, 0, 0.6), M.enamelBlue); face.rotation.x = Math.PI / 2; face.position.z = -0.32; g.add(face);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.055, 10, 32), M.goldPlain); rim.position.z = 0.19; g.add(rim);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 10), M.goldPlain); boss.position.z = 0.32; g.add(boss);
    for (let k = 0; k < 8; k++) { const r = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), M.silver); const a = k / 8 * Math.PI * 2; r.position.set(Math.cos(a) * 0.27, Math.sin(a) * 0.27, 0.25); g.add(r); }
    g.scale.setScalar(1.25); return g;
  }
  function makeMagnet() {
    const g = new THREE.Group();
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.16, 14, 28, Math.PI), M.enamelRed); arc.rotation.z = Math.PI; g.add(arc);
    for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.24, 16), M.silver); t.position.set(s * 0.42, 0.1, 0); g.add(t); }
    g.scale.setScalar(1.25); return g;
  }
  function makeIdol() {   // jade idol with gold eyes on a gold stand
    const g = new THREE.Group();
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 1), M.jade); head.scale.set(1, 1.2, 0.9); head.position.y = 0.42; g.add(head);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), M.goldPlain); e.position.set(s * 0.13, 0.48, 0.3); g.add(e); }
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.3, 6), M.goldPlain); crown.position.y = 0.88; g.add(crown);
    const base = new THREE.Mesh(new THREE.LatheGeometry([[0, -0.36], [0.32, -0.36], [0.3, -0.26], [0.18, -0.18], [0.22, 0.02], [0, 0.04]].map(([r, y]) => new THREE.Vector2(r, y)), 16), M.goldPlain); g.add(base);
    g.scale.setScalar(1.3); return g;
  }
  function makeX2(faceMat) {
    const g = new THREE.Group();
    const coin = new THREE.Mesh(G.coin, M.gold); coin.scale.setScalar(1.6); g.add(coin);
    for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), faceMat); f.position.z = s * 0.086; if (s < 0) f.rotation.y = Math.PI; g.add(f); }
    return g;
  }

  // after the scenery textures have loaded: share them
  function link() {
    const W = SC.M.wall, R = SC.M.rock, B = SC.M.bark;
    Object.assign(M.stone, { map: W.map, normalMap: W.normalMap, normalScale: new THREE.Vector2(1.1, 1.1) });
    Object.assign(M.rock, { map: R.map, normalMap: R.normalMap, normalScale: new THREE.Vector2(1.3, 1.3) });
    Object.assign(M.bark, { map: B.map, normalMap: B.normalMap, normalScale: new THREE.Vector2(1.4, 1.4) });
    Object.assign(M.terracotta, { map: W.map });
    for (const m of [M.stone, M.rock, M.bark, M.terracotta]) m.needsUpdate = true;
  }

  return {
    M, G, env, link, makeShield, makeMagnet, makeIdol, makeX2,
    update(dt) { uTime.value += dt; },
  };
}
