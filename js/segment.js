// Tap-to-outline: grows a region from the tapped point using colour and texture similarity,
// stops at strong edges, tidies the mask and traces its outline as a polygon (normalised 0–1).

const WORK = 320;

function toLab(r, g, b) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

function blur3(A, w, h) {
  const out = new Float32Array(A.length);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += A[yy * w + xx]; n += 1; }
    }
    out[y * w + x] = s / n;
  }
  return out;
}

function prepare(imageData) {
  const scale = Math.min(1, WORK / Math.max(imageData.width, imageData.height));
  const w = Math.max(8, Math.round(imageData.width * scale)), h = Math.max(8, Math.round(imageData.height * scale));
  const N = w * h;
  let Lc = new Float32Array(N), Ac = new Float32Array(N), Bc = new Float32Array(N);
  const src = imageData.data, sw = imageData.width;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const sx = Math.min(imageData.width - 1, Math.floor(x / scale)), sy = Math.min(imageData.height - 1, Math.floor(y / scale));
    const o = (sy * sw + sx) * 4;
    const [l, a, b] = toLab(src[o], src[o + 1], src[o + 2]);
    const i = y * w + x;
    Lc[i] = l; Ac[i] = a; Bc[i] = b;
  }
  Lc = blur3(blur3(Lc, w, h), w, h); Ac = blur3(Ac, w, h); Bc = blur3(Bc, w, h);
  // Local texture: standard deviation of lightness, which separates foliage from lawn or paving.
  const L2 = new Float32Array(N);
  for (let i = 0; i < N; i += 1) L2[i] = Lc[i] * Lc[i];
  let mean = Lc, sq = L2;
  for (let k = 0; k < 2; k += 1) { mean = blur3(mean, w, h); sq = blur3(sq, w, h); }
  const tex = new Float32Array(N);
  for (let i = 0; i < N; i += 1) tex[i] = Math.sqrt(Math.max(0, sq[i] - mean[i] * mean[i]));
  return { w, h, Lc, Ac, Bc, tex };
}

const cache = new WeakMap();

function grow(f, sx, sy, looseness) {
  const { w, h, Lc, Ac, Bc, tex } = f;
  const N = w * h;
  // Seed statistics from a small window, and how varied the plant is around the tap.
  let mL = 0, mA = 0, mB = 0, mT = 0, n = 0;
  for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
    const x = sx + dx, y = sy + dy;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = y * w + x;
    mL += Lc[i]; mA += Ac[i]; mB += Bc[i]; mT += tex[i]; n += 1;
  }
  mL /= n; mA /= n; mB /= n; mT /= n;
  let vs = 0, vn = 0;
  for (let dy = -6; dy <= 6; dy += 2) for (let dx = -6; dx <= 6; dx += 2) {
    const x = sx + dx, y = sy + dy;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = y * w + x;
    vs += (Lc[i] - mL) ** 2 * 0.5 + (Ac[i] - mA) ** 2 + (Bc[i] - mB) ** 2; vn += 1;
  }
  const spread = Math.sqrt(vs / Math.max(1, vn));
  const T = Math.min(30, Math.max(9, 7 + spread * 1.1)) * looseness;
  // Plants are compact: tolerance tapers off with distance from the tap.
  const maxR = Math.max(w, h) * 0.32 * Math.sqrt(looseness);
  const TT = Math.max(4, mT * 0.9 + 3) * looseness;
  const mask = new Uint8Array(N);
  const queue = new Int32Array(N);
  let head = 0, tail = 0;
  const seed = sy * w + sx;
  mask[seed] = 1; queue[tail++] = seed;
  const limit = N * 0.45;
  let count = 1;
  while (head < tail && count < limit) {
    const i = queue[head++];
    const x = i % w, y = (i / w) | 0;
    for (let k = 0; k < 4; k += 1) {
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (mask[j]) continue;
      const dSeed = Math.sqrt((Lc[j] - mL) ** 2 * 0.5 + (Ac[j] - mA) ** 2 + (Bc[j] - mB) ** 2);
      const dStep = Math.sqrt((Lc[j] - Lc[i]) ** 2 * 0.5 + (Ac[j] - Ac[i]) ** 2 + (Bc[j] - Bc[i]) ** 2);
      const dist = Math.hypot(nx - sx, ny - sy) / maxR;
      if (dist > 1) continue;
      const taper = 1 - dist * dist * 0.6;
      if (dSeed < T * taper && dStep < T * 0.4 && Math.abs(tex[j] - mT) < (TT + T * 0.3) * taper) {
        mask[j] = 1; queue[tail++] = j; count += 1;
      }
    }
  }
  return { mask, count };
}

function morph(mask, w, h, r, dilate) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    let v = dilate ? 0 : 1;
    for (let dy = -r; dy <= r && (dilate ? !v : v); dy += 1) for (let dx = -r; dx <= r; dx += 1) {
      if (dx * dx + dy * dy > r * r) continue;
      const xx = x + dx, yy = y + dy;
      const m = xx >= 0 && yy >= 0 && xx < w && yy < h ? mask[yy * w + xx] : 0;
      if (dilate && m) { v = 1; break; }
      if (!dilate && !m) { v = 0; break; }
    }
    out[y * w + x] = v;
  }
  return out;
}

function fillHolesAndKeep(mask, w, h, seed) {
  // Keep the component containing the seed, then fill any holes inside it.
  const N = w * h;
  const comp = new Uint8Array(N), stack = [seed];
  if (!mask[seed]) return comp;
  comp[seed] = 1;
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    for (const j of [x + 1 < w ? i + 1 : -1, x > 0 ? i - 1 : -1, y + 1 < h ? i + w : -1, y > 0 ? i - w : -1]) {
      if (j >= 0 && mask[j] && !comp[j]) { comp[j] = 1; stack.push(j); }
    }
  }
  const outside = new Uint8Array(N), q = [];
  for (let x = 0; x < w; x += 1) { q.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y += 1) { q.push(y * w, y * w + w - 1); }
  while (q.length) {
    const i = q.pop();
    if (outside[i] || comp[i]) continue;
    outside[i] = 1;
    const x = i % w, y = (i / w) | 0;
    if (x + 1 < w) q.push(i + 1); if (x > 0) q.push(i - 1); if (y + 1 < h) q.push(i + w); if (y > 0) q.push(i - w);
  }
  for (let i = 0; i < N; i += 1) if (!outside[i]) comp[i] = 1;
  return comp;
}

function trace(mask, w, h) {
  // Moore-neighbour boundary trace from the top-left-most pixel.
  let start = -1;
  for (let i = 0; i < mask.length; i += 1) if (mask[i]) { start = i; break; }
  if (start < 0) return [];
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x];
  let x = start % w, y = (start / w) | 0, dir = 7;
  const pts = [[x, y]];
  const sx = x, sy = y;
  for (let steps = 0; steps < w * h * 4; steps += 1) {
    let found = false;
    for (let k = 0; k < 8; k += 1) {
      const d = (dir + 6 + k) % 8;
      const nx = x + dirs[d][0], ny = y + dirs[d][1];
      if (at(nx, ny)) { x = nx; y = ny; dir = d; found = true; break; }
    }
    if (!found || (x === sx && y === sy)) break;
    pts.push([x, y]);
  }
  return pts;
}

function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let best = -1, bd = 0;
    for (let i = a + 1; i < b; i += 1) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
      if (d > bd) { bd = d; best = i; }
    }
    if (bd > eps && best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

function chaikin(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i += 1) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    out.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25], [x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75]);
  }
  return out;
}

// nx, ny: tap position 0–1. looseness: 1 normal, <1 tighter, >1 looser.
export function segmentAt(imageData, nx, ny, looseness = 1) {
  let f = cache.get(imageData);
  if (!f) { f = prepare(imageData); cache.set(imageData, f); }
  const { w, h } = f;
  const sx = Math.min(w - 1, Math.max(0, Math.round(nx * (w - 1)))), sy = Math.min(h - 1, Math.max(0, Math.round(ny * (h - 1))));
  let loose = looseness, result = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { mask, count } = grow(f, sx, sy, loose);
    const frac = count / (w * h);
    result = { mask, frac };
    if (frac < 0.002) { loose *= 1.45; continue; }
    if (frac > 0.4) { loose *= 0.7; continue; }
    break;
  }
  // Open first to cut thin bridges into neighbouring plants, keep the tapped piece, then close and fill.
  let mask = morph(morph(result.mask, w, h, 2, false), w, h, 2, true);
  let seedIdx = sy * w + sx;
  if (!mask[seedIdx]) {
    // The tap sat on a thin part that the opening removed: snap to the nearest surviving pixel.
    let best = -1, bd = Infinity;
    for (let i = 0; i < mask.length; i += 1) if (mask[i] && result.mask[i]) { const d = (i % w - sx) ** 2 + (((i / w) | 0) - sy) ** 2; if (d < bd) { bd = d; best = i; } }
    if (best < 0 || bd > 64) mask = result.mask; else seedIdx = best;
  }
  mask = fillHolesAndKeep(mask, w, h, seedIdx);
  mask = morph(morph(mask, w, h, 2, true), w, h, 2, false);
  let area = 0, cx = 0, cy = 0;
  for (let i = 0; i < mask.length; i += 1) if (mask[i]) { area += 1; cx += i % w; cy += (i / w) | 0; }
  if (area < 6) return null;
  const pts = chaikin(simplify(trace(mask, w, h), 1.1));
  const poly = pts.map(([x, y]) => [+(x / (w - 1)).toFixed(4), +(y / (h - 1)).toFixed(4)]);
  return {
    poly,
    cx: cx / area / (w - 1),
    cy: cy / area / (h - 1),
    area: area / (w * h),
    r: Math.sqrt(area / Math.PI) / w
  };
}

export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polyBounds(poly) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}
