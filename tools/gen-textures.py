"""Procedural PBR textures for Relic Rush (all original, generated here; tileable).
   python3 tools/gen-textures.py  ->  tex-*.jpg / tex-*.png in the project root."""
import numpy as np, cv2
from scipy import ndimage
rng = np.random.default_rng(7)
OUT = '.'

def tile_noise(n, cells, seed=0):
    """Tileable value noise: random grid on a torus, cubic-upsampled."""
    r = np.random.default_rng(seed).random((cells, cells))
    big = np.tile(r, (3, 3))
    z = ndimage.zoom(big, n / cells, order=3, mode='grid-wrap')
    return z[n:2 * n, n:2 * n]

def fbm(n, base=4, octaves=6, seed=0, gain=0.5):
    acc = np.zeros((n, n)); amp = 1; tot = 0
    for o in range(octaves):
        cells = base * 2 ** o
        if cells > n: break
        acc += amp * tile_noise(n, cells, seed + o * 31); tot += amp; amp *= gain
    a = acc / tot
    return (a - a.min()) / (a.max() - a.min() + 1e-9)

def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength
    nz = np.ones_like(h)
    l = np.sqrt(dx * dx + dy * dy + nz * nz)
    n = np.stack([-dx / l, dy / l, nz / l], -1)   # OpenGL convention (+Y up)
    return ((n * 0.5 + 0.5) * 255).astype(np.uint8)

def save_rgb(name, rgb, q=88):
    cv2.imwrite(f'{OUT}/{name}', cv2.cvtColor(np.clip(rgb * 255, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, q])
def save_u8(name, img, q=90):
    if img.ndim == 3: img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
    cv2.imwrite(f'{OUT}/{name}', img, [cv2.IMWRITE_JPEG_QUALITY, q])

def lerp(a, b, t): return a + (b - a) * t
def col(hexs): return np.array([int(hexs[i:i + 2], 16) / 255 for i in (1, 3, 5)])

# ---------------------------------------------------------------- stone flagstones (the road)
def stones(n, rows, seed, wide=(0.7, 1.5)):
    """Rows of rectangular stones in a running bond. Returns id map and distance-to-edge map (px)."""
    r = np.random.default_rng(seed)
    ids = np.zeros((n, n), np.int32); k = 1
    ys = np.linspace(0, n, rows + 1).astype(int)
    for i in range(rows):
        x = int(r.random() * n); start = x; w0 = n / rows
        widths = []
        total = 0
        while total < n:
            w = int(w0 * r.uniform(*wide)); widths.append(w); total += w
        widths[-1] -= total - n
        for w in widths:
            xs = (np.arange(x, x + w)) % n
            ids[ys[i]:ys[i + 1], xs] = k; k += 1; x += w
    # distance to the stone edge, on a torus
    edge = np.zeros((n, n), bool)
    edge |= ids != np.roll(ids, 1, 0); edge |= ids != np.roll(ids, 1, 1)
    big = np.tile(~edge, (3, 3))
    d = ndimage.distance_transform_edt(big)[n:2 * n, n:2 * n]
    return ids, d, k

def road(n=1024):
    ids, d, k = stones(n, 7, 3)
    r = np.random.default_rng(11)
    tone = r.uniform(-1, 1, k)[ids]; hue = r.uniform(-1, 1, k)[ids]; tilt = r.uniform(-1, 1, (k, 2))[ids]
    f1 = fbm(n, 8, 7, 1); f2 = fbm(n, 32, 5, 2); f3 = fbm(n, 4, 4, 3)
    mortar = 7.0
    bevel = np.clip(d / mortar, 0, 1); bevel = bevel * bevel * (3 - 2 * bevel)
    # chipped edges: noise eats into the bevel
    chip = np.clip((d - mortar * 0.6 - (f2 - 0.5) * 14) / mortar, 0, 1)
    face = np.clip(bevel * chip, 0, 1)
    yy, xx = np.mgrid[0:n, 0:n] / n
    height = face * (0.6 + 0.25 * f1 + 0.04 * tilt[..., 0] * np.sin(xx * 6.28) ) + (1 - face) * 0.05 * f2
    # cracks: thresholded ridged noise on some stones
    ridge = 1 - np.abs(fbm(n, 6, 5, 9) * 2 - 1)
    crack = np.clip((ridge - 0.955) * 22, 0, 1) * (r.random(k)[ids] < 0.22) * face
    height -= crack * 0.25
    # colours: warm sandstone with darker, greyer stones mixed in
    c_light, c_dark, c_grey = col('#c9a77a'), col('#8a6a48'), col('#9a9384')
    base = lerp(c_dark, c_light, np.clip(0.55 + 0.35 * tone[..., None] * 0.6 + (f1[..., None] - 0.5) * 0.6, 0, 1))
    base = lerp(base, c_grey, np.clip(0.25 + 0.3 * hue[..., None], 0, 0.6))
    base *= (0.85 + 0.3 * f2[..., None])
    # wear: lighter on the stone tops, darker grime in the joints
    base *= (0.75 + 0.3 * face[..., None])
    grime = 1 - face
    patch = np.clip((f3 - 0.58) * 3.0, 0, 1)                       # moss only where it's damp
    moss_amt = np.clip(grime * 1.4 * patch + np.clip((f3 - 0.8) * 3, 0, 0.4) * face * 0.5, 0, 0.85)
    speck = fbm(n, 128, 3, 8)
    base *= (0.9 + 0.2 * speck[..., None])
    moss = lerp(col('#3d5a22'), col('#7a9440'), f2[..., None])
    alb = lerp(base, moss, moss_amt[..., None])
    alb = lerp(alb, col('#2a1e14'), crack[..., None] * 0.8)
    alb = lerp(alb, col('#33261a'), np.clip(grime * 0.9 - moss_amt * 0.6, 0, 1)[..., None] * 0.8)
    save_rgb('tex-road.jpg', alb)
    save_u8('tex-road-n.jpg', normal_from_height(height * 255, 0.055))
    rough = np.clip(0.78 + 0.18 * (1 - face) - 0.12 * f2 + 0.1 * moss_amt, 0, 1)
    ao = np.clip(0.55 + 0.45 * face, 0, 1) * (1 - crack * 0.5)
    # ARM: R = ambient occlusion, G = roughness, B = metalness (0)
    arm = np.stack([ao, rough, np.zeros_like(ao)], -1)
    save_rgb('tex-road-arm.jpg', arm)

# ---------------------------------------------------------------- temple wall masonry with carved bands
def wall(n=1024):
    ids, d, k = stones(n, 4, 21, (1.0, 2.2))
    r = np.random.default_rng(5)
    tone = r.uniform(-1, 1, k)[ids]
    f1 = fbm(n, 6, 7, 11); f2 = fbm(n, 24, 5, 12); f3 = fbm(n, 3, 5, 13)
    mortar = 9.0
    face = np.clip(d / mortar, 0, 1); face = face * face * (3 - 2 * face)
    height = face * (0.65 + 0.3 * f1) + (1 - face) * 0.04
    # carved glyph band on one row of blocks: stepped meanders and circles
    yy, xx = np.mgrid[0:n, 0:n]
    band = (yy // (n // 4)) == 1
    gx = (xx % 128) - 64; gy = (yy % (n // 4)) - (n // 8)
    meander = ((np.abs(gx) < 40) & (np.abs(gy) < 40)) & ~((np.abs(gx) < 28) & (np.abs(gy) < 28))
    meander |= (np.abs(gx) < 16) & (np.abs(gy) < 16) & ~((np.abs(gx) < 6) & (np.abs(gy) < 6))
    meander |= (np.abs(gx - 34) < 6) & (gy > -28) & (gy < 34)
    carve = band & meander & (d > 12)
    carve = ndimage.gaussian_filter(carve.astype(float), 1.2)
    height -= carve * 0.28
    stain = np.clip((fbm(n, 2, 4, 14) - 0.45) * 2, 0, 1) * np.clip(1 - (yy / n) * 1.2, 0, 1)
    base = lerp(col('#7c6046'), col('#b89a74'), np.clip(0.5 + 0.3 * tone[..., None] + (f1[..., None] - 0.5) * 0.7, 0, 1))
    base *= (0.8 + 0.35 * f2[..., None]) * (0.72 + 0.32 * face[..., None]) * (0.9 + 0.2 * fbm(n, 128, 3, 15)[..., None])
    base = lerp(base, col('#4a3a2a'), stain[..., None] * 0.45)
    moss_amt = np.clip((1 - face) * 1.2 * np.clip((f3 - 0.5) * 3, 0, 1) + np.clip((f3 - 0.7) * 2, 0, 1) * 0.6, 0, 0.85)
    alb = lerp(base, lerp(col('#33501f'), col('#6c8a38'), f2[..., None]), moss_amt[..., None])
    alb *= (1 - carve[..., None] * 0.35)
    save_rgb('tex-wall.jpg', alb)
    save_u8('tex-wall-n.jpg', normal_from_height(height * 255, 0.06))
    rough = np.clip(0.82 + 0.12 * (1 - face) - 0.1 * f2, 0, 1)
    arm = np.stack([np.clip(0.5 + 0.5 * face - carve * 0.3, 0, 1), rough, np.zeros_like(rough)], -1)
    save_rgb('tex-wall-arm.jpg', arm)

# ---------------------------------------------------------------- cliff rock (strata + fractures)
def worley(n, count, seed):
    from scipy.spatial import cKDTree
    r = np.random.default_rng(seed)
    pts = r.random((count, 2)) * n
    tree = cKDTree(pts, boxsize=n)
    yy, xx = np.mgrid[0:n, 0:n]
    wy = (tile_noise(n, 8, seed + 1) - 0.5) * n * 0.12; wx = (tile_noise(n, 8, seed + 2) - 0.5) * n * 0.12
    q = np.stack([(yy + wy).ravel() + 0.5, (xx + wx).ravel() + 0.5], -1) % n
    d, i = tree.query(q, k=2)
    return d[:, 0].reshape(n, n), d[:, 1].reshape(n, n), i[:, 0].reshape(n, n), r

def rock(n=1024):
    f1 = fbm(n, 4, 8, 31); f2 = fbm(n, 16, 6, 32); f3 = fbm(n, 2, 5, 33)
    d1, d2, cid, r = worley(n, 90, 39)
    broken = np.clip((fbm(n, 6, 5, 40) - 0.35) * 3, 0, 1)                 # fractures fade in and out
    edge = 1 - (1 - np.clip((d2 - d1) / 14, 0, 1)) * broken                         # 0 on the fracture lines between blocks
    slope = r.uniform(-1, 1, (90, 2))[cid]; ctone = r.uniform(-1, 1, 90)[cid]
    yy, xx = np.mgrid[0:n, 0:n] / n
    facet = (slope[..., 0] * ((xx * n) % 97) + slope[..., 1] * ((yy * n) % 89)) / 300
    strata = np.sin((yy + (f3 - 0.5) * 0.25) * np.pi * 2 * 12) * 0.5 + 0.5
    height = 0.45 * edge ** 0.5 + 0.2 * f1 + 0.15 * f2 + 0.08 * strata + 0.05 * facet
    base = lerp(col('#5a5249'), col('#a8998a'), np.clip(0.45 + 0.25 * ctone + 0.35 * (f1 - 0.5) + 0.2 * strata, 0, 1)[..., None])
    base = lerp(base, col('#8d6b4c'), np.clip((f3 - 0.45) * 1.5, 0, 1)[..., None] * 0.7)
    base *= (0.75 + 0.35 * f2[..., None]) * (0.55 + 0.45 * edge[..., None])
    base *= 0.9 + 0.2 * fbm(n, 128, 3, 38)[..., None]
    moss = np.clip((f3 - 0.6) * 2.4 + (1 - edge) * 0.25, 0, 0.75) * np.clip((f2 - 0.3) * 2, 0, 1)
    alb = lerp(base, lerp(col('#2f4a1c'), col('#5f7d32'), f2[..., None]), moss[..., None])
    save_rgb('tex-rock.jpg', alb)
    save_u8('tex-rock-n.jpg', normal_from_height(height * 255, 0.06))

# ---------------------------------------------------------------- weathered wood planks (bridges, mine)
def wood(n=512):
    yy, xx = np.mgrid[0:n, 0:n] / n
    planks = 4
    pid = (yy * planks).astype(int)
    r = np.random.default_rng(41)
    tone = r.uniform(-1, 1, planks + 1)[pid]
    grain_n = fbm(n, 4, 6, 42)
    grain = np.sin((xx * 2 + grain_n * 0.6 + pid * 0.37) * np.pi * 2 * 18 * (1 + 0.2 * tone)) * 0.5 + 0.5
    edge = np.abs(((yy * planks) % 1) - 0.5) * 2
    gap = np.clip((edge - 0.9) * 12, 0, 1)
    knots = np.clip((fbm(n, 8, 3, 43) - 0.82) * 6, 0, 1)
    height = 0.7 - 0.15 * grain - 0.6 * gap - 0.2 * knots
    base = lerp(col('#4d3423'), col('#8c6440'), np.clip(0.5 + 0.25 * tone + 0.35 * grain_n - 0.25 * grain, 0, 1)[..., None])
    base = lerp(base, col('#2a1c12'), gap[..., None] * 0.9 + knots[..., None] * 0.5)
    base *= 0.85 + 0.25 * fbm(n, 32, 4, 44)[..., None]
    save_rgb('tex-wood.jpg', base)
    save_u8('tex-wood-n.jpg', normal_from_height(height * 255, 0.04))

# ---------------------------------------------------------------- foliage cards: fern + hanging vine (alpha)
def foliage(n=512):
    img = np.zeros((n, n, 4), np.float32)
    r = np.random.default_rng(51)
    def leaf(cx, cy, ang, ln, wd, c):
        yy, xx = np.mgrid[0:n, 0:n]
        dx, dy = xx - cx, yy - cy
        u = dx * np.cos(ang) + dy * np.sin(ang); v = -dx * np.sin(ang) + dy * np.cos(ang)
        t = u / ln
        m = (t > 0) & (t < 1) & (np.abs(v) < wd * np.sin(np.clip(t, 0, 1) * np.pi) ** 0.7)
        shade = 0.75 + 0.25 * np.sign(v) * 0.5 + 0.2 * t
        img[m, :3] = np.clip(c * shade[m][:, None], 0, 1); img[m, 3] = 1
        vein = m & (np.abs(v) < 1.2); img[vein, :3] *= 0.7
    # left half: fern fronds fanning up from the bottom centre
    for f in range(7):
        a = -np.pi / 2 + (f - 3) * 0.32 + r.uniform(-0.08, 0.08)
        L = r.uniform(170, 230)
        bx, by = n * 0.25, n * 0.98
        for s in range(14):
            t = s / 14; px = bx + np.cos(a) * L * t; py = by + np.sin(a) * L * t
            for side in (-1, 1):
                leaf(px, py, a + side * 1.25, 34 * (1 - t * 0.7), 5.5 * (1 - t * 0.5), col('#4f8a2e') * r.uniform(0.8, 1.15))
    # right half: hanging vine with heart-shaped leaves
    for vtx in range(3):
        x0 = n * 0.62 + vtx * 55
        for s in range(18):
            y = 8 + s * 28 + r.uniform(-4, 4)
            x = x0 + np.sin(s * 0.7 + vtx) * 10
            img[int(y):int(y) + 28, int(x):int(x) + 3, :3] = col('#3a5a22'); img[int(y):int(y) + 28, int(x):int(x) + 3, 3] = 1
            leaf(x, y, np.pi * 0.5 + r.uniform(-0.9, 0.9) + (0.6 if s % 2 else -0.6), r.uniform(26, 38), 12, col('#4a8a34') * r.uniform(0.8, 1.2))
    a = img[..., 3]
    rgb = img[..., :3]
    # bleed colour into transparent texels so mipmaps don't fringe black
    for _ in range(6):
        m = a > 0
        blur = cv2.blur(rgb * m[..., None], (5, 5)); wsum = cv2.blur(m.astype(np.float32), (5, 5))
        fill = ~m & (wsum > 0)
        rgb[fill] = blur[fill] / wsum[fill][:, None]; a2 = a.copy(); a2[fill] = 0.001; a = np.maximum(a, (wsum > 0) * 0.001)
    out = np.dstack([rgb, img[..., 3]])
    cv2.imwrite(f'{OUT}/tex-foliage.png', cv2.cvtColor((np.clip(out, 0, 1) * 255).astype(np.uint8), cv2.COLOR_RGBA2BGRA), [cv2.IMWRITE_PNG_COMPRESSION, 9])

def leaves(n=512):
    """tileable dense canopy: thousands of overlapping leaves, darker where buried under others"""
    r = np.random.default_rng(77)
    rgb = np.zeros((n, n, 3), np.float32); rgb[:] = col('#16290f')
    depth = np.zeros((n, n), np.float32); hgt = np.zeros((n, n), np.float32)
    greens = [col(c) for c in ('#3f7a2a', '#4d8a2f', '#2f6a26', '#5b9436', '#3a6e33', '#6a9a3a')]
    count = 2600
    for k in range(count):
        cx, cy = r.uniform(0, n, 2); ang = r.uniform(0, 2 * np.pi)
        ln = r.uniform(16, 30); wd = ln * r.uniform(0.28, 0.42)
        c = greens[r.integers(len(greens))] * r.uniform(0.8, 1.15)
        t = np.linspace(0, 1, 12); w = wd * np.sin(t * np.pi) ** 0.8
        ca, sa = np.cos(ang), np.sin(ang)
        for ox in (-n, 0, n):
            for oy in (-n, 0, n):
                bx, by = cx + ox, cy + oy
                if bx < -40 or bx > n + 40 or by < -40 or by > n + 40: continue
                for side, sh in ((1, 1.08), (-1, 0.86)):
                    pts = [(bx + ca * ln * ti - sa * side * wi, by + sa * ln * ti + ca * side * wi) for ti, wi in zip(t, w)]
                    pts += [(bx + ca * ln * ti, by + sa * ln * ti) for ti in t[::-1]]
                    poly = np.array(pts, np.int32)
                    cv2.fillPoly(rgb, [poly], tuple(float(x) for x in np.clip(c * sh, 0, 1)))
                    cv2.fillPoly(depth, [poly], float(k / count))
                    cv2.fillPoly(hgt, [poly], 1.0)
                cv2.line(rgb, (int(bx), int(by)), (int(bx + ca * ln), int(by + sa * ln)), tuple(float(x) for x in c * 0.7), 1)
    # leaves buried under later ones are in shadow
    big = np.tile(depth, (3, 3)); amb = cv2.GaussianBlur(big, (0, 0), 9)[n:2 * n, n:2 * n]
    occ = np.clip(1 - (amb - depth) * 2.4, 0.35, 1.0)
    rgb *= occ[..., None]
    h = cv2.GaussianBlur(np.tile(depth, (3, 3)), (0, 0), 1.6)[n:2 * n, n:2 * n]
    save_rgb('tex-leaves.jpg', rgb)
    save_u8('tex-leaves-n.jpg', normal_from_height(h, 9.0))

def bark(n=256):
    """vertical fibrous bark"""
    h = fbm(n, base=4, seed=91)
    yy, xx = np.mgrid[0:n, 0:n] / n
    streak = fbm(n, base=8, seed=93)
    ridges = 0.5 + 0.5 * np.sin((xx * 14 + 1.4 * h) * 2 * np.pi)
    hh = ridges * 0.6 + streak * 0.4
    c = lerp(col('#3b2a1d')[None, None], col('#7a6248')[None, None], hh[..., None])
    c = lerp(c, col('#4f6a33')[None, None], (np.clip(fbm(n, base=3, seed=95) - 0.62, 0, 1) * 1.6)[..., None])
    save_rgb('tex-bark.jpg', c)
    save_u8('tex-bark-n.jpg', normal_from_height(hh, 5.0))

def frond(w=256, h=512):
    """one pinnate palm frond, base at the bottom, tip at the top (RGBA)"""
    img = np.zeros((h, w, 4), np.uint8)
    r = np.random.default_rng(5)
    cx = w // 2
    for k in range(46):
        t = k / 46; y = int(h * 0.97 - t * h * 0.92)
        ln = (0.9 * np.sin(min(1, t * 1.25) * np.pi * 0.9) + 0.1) * w * 0.47
        for side in (-1, 1):
            ang = np.radians(rng_ang := 32 + 18 * t + r.uniform(-5, 5))
            ex = cx + side * ln * np.cos(ang); ey = y - ln * np.sin(ang)
            wd = 5 + 3 * (1 - t)
            nx, ny = -(ey - y), (ex - cx); nl = np.hypot(nx, ny) + 1e-6; nx, ny = nx / nl * wd / 2, ny / nl * wd / 2
            mx, my = (cx + ex) / 2, (y + ey) / 2
            poly = np.array([[cx, y], [mx + nx, my + ny], [ex, ey], [mx - nx, my - ny]], np.int32)
            g = r.uniform(0.75, 1.15)
            c = (int(40 * g), int(118 * g), int(48 * g))
            cv2.fillPoly(img, [poly], (*c, 255), lineType=cv2.LINE_AA)
            cv2.line(img, (cx, y), (int(ex), int(ey)), (int(c[0] * 0.7), int(c[1] * 0.75), int(c[2] * 0.7), 255), 1, cv2.LINE_AA)
    cv2.line(img, (cx, h - 2), (cx, int(h * 0.05)), (70, 96, 40, 255), 4, cv2.LINE_AA)
    rgb = img[..., :3].astype(np.float32) / 255; a = img[..., 3]
    m = a > 0
    for _ in range(8):
        blur = cv2.blur(rgb * m[..., None], (5, 5)); ws = cv2.blur(m.astype(np.float32), (5, 5))
        fill = ~m & (ws > 0); rgb[fill] = blur[fill] / ws[fill][:, None]; m = m | fill
    out = np.dstack([(rgb * 255).astype(np.uint8), a])
    cv2.imwrite(f'{OUT}/tex-frond.png', cv2.cvtColor(out, cv2.COLOR_RGBA2BGRA), [cv2.IMWRITE_PNG_COMPRESSION, 9])

if __name__ == '__main__':
    import sys
    only = sys.argv[1:] or ['road', 'wall', 'rock', 'wood', 'foliage', 'leaves', 'bark', 'frond']
    for nme in only: globals()[nme]()
    print('ok')
