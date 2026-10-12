// The look of the world: sky dome, distant ranges, low mist and four zones whose light and colour
// change as the run goes on (Sunrise Ruins → Emerald Canopy → Ember Gorge → Moonlit Temple, then around again).
import * as THREE from 'three';

export const ZONE_LEN = 900;
export const ZONES = [
  { name: 'Sunrise Ruins', sky: ['#d8683e', '#f4c48c', '#e9c99a'], fog: '#e9c99a', fogNear: 36, fogFar: 150, hemiSky: '#ffe6c4', hemiGround: '#3a5a30', hemi: 1.35,
    sun: '#ffe2b8', sunI: 2.1, rim: '#9fbfff', rimI: 0.45, mist: '#f3d6ad', far: '#d39c72', near: '#9a6446', dust: '#ffd9a0', dustSize: 0.13,
    torch: 1.0, path: '#ffffff', wall: '#ffffff', canopy: '#a9cc92', exposure: 1.0, sunDir: [-0.35, 0.22, -1] },
  { name: 'Emerald Canopy', sky: ['#4f8f7c', '#d3e6b6', '#b4cf9e'], fog: '#bcd5a8', fogNear: 30, fogFar: 135, hemiSky: '#efffdc', hemiGround: '#2c4a26', hemi: 1.4,
    sun: '#fff2c8', sunI: 1.8, rim: '#c4ecff', rimI: 0.5, mist: '#dcefd2', far: '#86b192', near: '#4f7a5a', dust: '#eaffb4', dustSize: 0.12,
    torch: 0.9, path: '#e7f1dc', wall: '#dfe9d2', canopy: '#8cba7c', exposure: 1.02, sunDir: [0.3, 0.35, -1] },
  { name: 'Ember Gorge', sky: ['#4a2246', '#ff8a4a', '#d4654a'], fog: '#e88a5c', fogNear: 30, fogFar: 140, hemiSky: '#ffc49a', hemiGround: '#4a2a20', hemi: 1.2,
    sun: '#ff9a58', sunI: 2.4, rim: '#a48bff', rimI: 0.75, mist: '#f4a27c', far: '#a85272', near: '#5e2a40', dust: '#ffb070', dustSize: 0.14,
    torch: 1.4, path: '#f3cfba', wall: '#f0c6b0', canopy: '#c0a874', exposure: 1.0, sunDir: [-0.6, 0.08, -1] },
  { name: 'Moonlit Temple', sky: ['#070d24', '#2c4677', '#18284a'], fog: '#1d2d4e', fogNear: 24, fogFar: 125, hemiSky: '#9cb8ff', hemiGround: '#0f1c26', hemi: 0.95,
    sun: '#c4d4ff', sunI: 1.1, rim: '#6f9dff', rimI: 0.9, mist: '#3a5488', far: '#2c4170', near: '#152340', dust: '#d9ff7a', dustSize: 0.24,
    torch: 2.4, path: '#a9b8d6', wall: '#9aa9c9', canopy: '#4f7470', exposure: 1.12, sunDir: [0.45, 0.3, -1] },
];
const FWD = new THREE.Vector3(0, 0, -1);
export const zoneOf = (dist) => Math.floor(Math.max(0, dist) / ZONE_LEN) % ZONES.length;

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// deterministic noise so the ranges look the same every launch
function prng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

function rangeTexture(seed, peaks, minH, maxH, temple) {
  const r = prng(seed);
  const t = canvasTex(2048, 256, (g, w, h) => {
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(0, h);
    let x = 0; const pts = [];
    while (x <= w) { pts.push([x, h - (minH + r() * (maxH - minH)) * h]); x += w / peaks * (0.5 + r()); }
    pts.push([w, pts[0][1]]);
    for (let i = 0; i < pts.length; i++) {
      const [px, py] = pts[i];
      if (i === 0) g.lineTo(px, py);
      else { const [qx, qy] = pts[i - 1]; const mx = (px + qx) / 2; g.quadraticCurveTo(qx + (mx - qx) * 0.5, Math.min(py, qy) - 6, px, py); }
    }
    g.lineTo(w, h); g.closePath(); g.fill();
    if (temple) {   // a few stepped temple silhouettes on the near range
      for (let k = 0; k < 5; k++) {
        const cx = (k + 0.3 + r() * 0.4) * w / 5, base = h * (0.55 + r() * 0.15), tiers = 3 + Math.floor(r() * 3), tw = 40 + r() * 40;
        for (let s = 0; s < tiers; s++) g.fillRect(cx - tw * (1 - s / tiers) / 2, base - (s + 1) * 12, tw * (1 - s / tiers), 13);
        g.fillRect(cx - 3, base - tiers * 12 - 14, 6, 14);
      }
    }
  });
  t.wrapS = THREE.RepeatWrapping; t.repeat.set(2, 1);
  return t;
}
const mistTex = (() => {
  const t = canvasTex(256, 256, (g, w) => {
    const r = prng(7);
    for (let i = 0; i < 60; i++) {
      const x = r() * w, y = r() * w, rad = 20 + r() * 60;
      for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, w], [0, -w]]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        gr.addColorStop(0, `rgba(255,255,255,${0.10 + r() * 0.12})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 5);
  return t;
})();

const SKY_VS = `varying vec3 vDir; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vDir = wp.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const SKY_FS = `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunColor; uniform vec3 sunDir; varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir); float h = d.y;
  vec3 c = mix(bottom, horizon, smoothstep(-0.30, 0.02, h));
  c = mix(c, top, smoothstep(0.02, 0.75, h));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  c += sunColor * (pow(s, 1400.0) * 1.6 + pow(s, 40.0) * 0.16 + pow(s, 6.0) * 0.05);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

export function createLook(scene, { hemi, sun }) {
  const C = (hex) => new THREE.Color(hex);
  const COLS = ['fog', 'hemiSky', 'hemiGround', 'sun', 'rim', 'mist', 'far', 'near', 'dust', 'path', 'wall', 'canopy'];
  const P = ZONES.map((z) => {
    const o = { ...z, top: C(z.sky[0]), horizon: C(z.sky[1]), bottom: C(z.sky[2]), dir: new THREE.Vector3(...z.sunDir).normalize() };
    for (const key of COLS) o[key + 'C'] = C(z[key]);
    return o;
  });
  // current (animated) values
  const cur = {
    top: C(P[0].sky[0]), horizon: C(P[0].sky[1]), bottom: C(P[0].sky[2]), fog: C(P[0].fog), hemiSky: C(P[0].hemiSky), hemiGround: C(P[0].hemiGround),
    sun: C(P[0].sun), rim: C(P[0].rim), mist: C(P[0].mist), far: C(P[0].far), near: C(P[0].near), dust: C(P[0].dust), path: C(P[0].path),
    wall: C(P[0].wall), canopy: C(P[0].canopy),
    hemi: P[0].hemi, sunI: P[0].sunI, rimI: P[0].rimI, fogNear: P[0].fogNear, fogFar: P[0].fogFar, dustSize: P[0].dustSize, torch: P[0].torch,
    exposure: P[0].exposure, sunDir: new THREE.Vector3(...P[0].sunDir).normalize(),
  };
  const tgt = { zone: 0 };

  const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), new THREE.ShaderMaterial({
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { top: { value: cur.top }, horizon: { value: cur.horizon }, bottom: { value: cur.bottom }, sunColor: { value: cur.sun }, sunDir: { value: cur.sunDir } },
  }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

  const ring = (radius, y0, height, tex, opacity) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 72, 1, true),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false }));
    m.position.y = y0 + height / 2; m.renderOrder = -9; m.frustumCulled = false; scene.add(m); return m;
  };
  const farRange = ring(360, -60, 120, rangeTexture(11, 18, 0.48, 0.7, false), 0.9);
  const nearRange = ring(300, -55, 100, rangeTexture(29, 26, 0.42, 0.58, true), 1);
  nearRange.rotation.y = 1.3;

  const mist = new THREE.Mesh(new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, opacity: 0.9, depthWrite: false, color: cur.mist, toneMapped: false }));
  mist.position.y = -4.5; mist.renderOrder = 2; scene.add(mist);

  const rim = new THREE.DirectionalLight(cur.rim, cur.rimI);
  scene.add(rim);

  let t = 0, snap = true;
  return {
    sky, farRange, nearRange, mist,
    zone: 0,
    get torch() { return cur.torch; },
    get dustSize() { return cur.dustSize; },
    colors: cur,
    setZone(i, instant = false) { this.zone = i; tgt.zone = i; if (instant) snap = true; },
    /** Eases every value toward the target zone; keeps sky, ranges and mist centred on the camera. */
    update(dt, camPos, instant = false, mats = {}) {
      t += dt;
      const z = P[tgt.zone], k = instant || snap ? 1 : 1 - Math.exp(-dt * 1.4); snap = false;
      cur.top.lerp(z.top, k); cur.horizon.lerp(z.horizon, k); cur.bottom.lerp(z.bottom, k);
      for (const key of COLS) cur[key].lerp(z[key + 'C'], k);
      for (const key of ['hemi', 'sunI', 'rimI', 'fogNear', 'fogFar', 'dustSize', 'torch', 'exposure']) cur[key] += (z[key] - cur[key]) * k;
      cur.sunDir.lerp(z.dir, k).normalize();

      scene.fog.color.copy(cur.fog); scene.fog.near = cur.fogNear; scene.fog.far = cur.fogFar;
      hemi.color.copy(cur.hemiSky); hemi.groundColor.copy(cur.hemiGround); hemi.intensity = cur.hemi;
      sun.color.copy(cur.sun); sun.intensity = cur.sunI;
      rim.color.copy(cur.rim); rim.intensity = cur.rimI;
      farRange.material.color.copy(cur.far); nearRange.material.color.copy(cur.near); mist.material.color.copy(cur.mist);
      if (mats.path) mats.path.color.copy(cur.path);
      if (mats.wall) mats.wall.color.copy(cur.wall);
      if (mats.canopy) mats.canopy.color.copy(cur.canopy);
      if (mats.dust) { mats.dust.color.copy(cur.dust); mats.dust.size = cur.dustSize; }
      if (mats.renderer) mats.renderer.toneMappingExposure = cur.exposure;

      sky.position.copy(camPos);
      farRange.position.x = nearRange.position.x = camPos.x; farRange.position.z = nearRange.position.z = camPos.z;
      mist.position.x = Math.round(camPos.x / 50) * 50; mist.position.z = Math.round(camPos.z / 50) * 50;
      mistTex.offset.set(t * 0.004, t * 0.002);
      // a cool fill light from behind and above the camera lifts the runner off the road
      const f = mats.forward || FWD;
      rim.position.set(camPos.x - f.x * 30, camPos.y + 25, camPos.z - f.z * 30);
      rim.target.position.set(camPos.x + f.x * 10, 0, camPos.z + f.z * 10); rim.target.updateMatrixWorld();
    },
  };
}
