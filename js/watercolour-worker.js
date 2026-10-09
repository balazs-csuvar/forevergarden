// Watercolour engine. Pure pixel maths so it runs in a Web Worker (and in Node for tuning).
// Input: RGBA pixels of a garden photo, the month (0-11), and plant "pins" that say whether a
// region of the photo is evergreen (0), herbaceous (0.7) or deciduous (1) so seasons are local.

const MONTH_GRADES = [
  { th: 38, a: 0.55, sm: 0.45, la: 0.05, cool: 0.06, bare: 1.0 },
  { th: 42, a: 0.45, sm: 0.55, la: 0.05, cool: 0.05, bare: 0.9 },
  { th: 72, a: 0.25, sm: 0.8, la: 0.04, cool: 0.02, bare: 0.5 },
  { th: 86, a: 0.35, sm: 1.12, la: 0.05, cool: 0, bare: 0.1 },
  { th: 95, a: 0.22, sm: 1.15, la: 0.03, cool: 0, bare: 0 },
  { th: 100, a: 0.06, sm: 1.1, la: 0.01, cool: 0, bare: 0 },
  { th: 100, a: 0, sm: 1.05, la: 0, cool: 0, bare: 0 },
  { th: 92, a: 0.04, sm: 1.0, la: 0, warm: 0.02, bare: 0 },
  { th: 55, a: 0.2, sm: 0.95, la: 0, warm: 0.04, bare: 0 },
  { th: 34, a: 0.5, sm: 1.08, la: 0, warm: 0.06, bare: 0.05 },
  { th: 28, a: 0.6, sm: 0.8, la: 0.02, warm: 0.03, bare: 0.45 },
  { th: 35, a: 0.55, sm: 0.45, la: 0.06, cool: 0.07, bare: 0.9 }
];

function mulberry32(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(seed) {
  const rnd = mulberry32(seed);
  const vals = new Float32Array(256);
  const perm = new Uint8Array(512);
  for (let i = 0; i < 256; i += 1) { vals[i] = rnd(); perm[i] = i; }
  for (let i = 255; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 256; i += 1) perm[i + 256] = perm[i];
  const hash = (i, j) => vals[perm[(perm[i & 255] + j) & 255]];
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y, octaves) => {
    let sum = 0, amp = 0.5, norm = 0, f = 1;
    for (let o = 0; o < octaves; o += 1) { sum += noise(x * f + o * 17.3, y * f - o * 9.1) * amp; norm += amp; amp *= 0.5; f *= 2.03; }
    return sum / norm;
  };
  return { noise, fbm, hash };
}

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hueToRgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h, s, l) {
  if (s <= 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = (((h % 360) + 360) % 360) / 360;
  return [hueToRgb(p, q, hk + 1 / 3), hueToRgb(p, q, hk), hueToRgb(p, q, hk - 1 / 3)];
}

function buildDeciduousMap(w, h, pins) {
  const map = new Float32Array(w * h).fill(0.55);
  for (const pin of pins) {
    const cx = pin.x * w, cy = pin.y * h, rad = Math.max(4, pin.r * w);
    const x0 = Math.max(0, Math.floor(cx - rad * 1.6)), x1 = Math.min(w - 1, Math.ceil(cx + rad * 1.6));
    const y0 = Math.max(0, Math.floor(cy - rad * 1.6)), y1 = Math.min(h - 1, Math.ceil(cy + rad * 1.6));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const d2 = ((x - cx) ** 2 + (y - cy) ** 2) / (rad * rad);
        const wgt = Math.exp(-d2 * 1.4);
        const i = y * w + x;
        map[i] += (pin.kind - map[i]) * wgt;
      }
    }
  }
  return map;
}

function seasonGrade(src, w, h, month, decid, nz) {
  const g = MONTH_GRADES[month];
  const N = w * h;
  const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      let r = src[i * 4] / 255, gg = src[i * 4 + 1] / 255, b = src[i * 4 + 2] / 255;
      let [hue, sat, lum] = rgbToHsl(r, gg, b);
      const veg = smoothstep(35, 55, hue) * (1 - smoothstep(165, 190, hue)) * smoothstep(0.06, 0.18, sat);
      if (veg > 0.01) {
        const d = decid[i];
        const patch = nz.fbm(x * 0.018, y * 0.018, 3);
        const target = g.th + (patch - 0.5) * 34;
        const amt = Math.min(0.92, g.a * (0.2 + 1.15 * d) * veg * (0.55 + 0.9 * patch));
        let diff = ((target - hue + 540) % 360) - 180;
        hue += diff * amt;
        sat *= 1 + (g.sm - 1) * veg * (0.35 + 0.9 * d);
        const bare = g.bare * smoothstep(0.55, 0.9, d) * veg;
        // Bare winter branches: a soft grey-brown-mauve haze instead of a green canopy.
        if (bare > 0) {
          hue += ((((20 - hue + 540) % 360) - 180)) * bare;
          lum += (0.58 + 0.08 * patch - lum) * bare * 0.65;
          sat *= 1 - bare * 0.7;
        }
        [r, gg, b] = hslToRgb(hue, Math.min(1, sat), Math.min(1, lum));
      }
      r += g.la || 0; gg += g.la || 0; b += g.la || 0;
      if (g.cool) { b += g.cool; r -= g.cool * 0.5; }
      if (g.warm) { r += g.warm; b -= g.warm * 0.6; }
      R[i] = r; G[i] = gg; B[i] = b;
    }
  }
  return [R, G, B];
}

function kuwahara(R, G, B, w, h, r) {
  const W = w + 1, size = W * (h + 1), N = w * h;
  const iR = new Float64Array(size), iG = new Float64Array(size), iB = new Float64Array(size), iL = new Float64Array(size), iL2 = new Float64Array(size);
  for (let y = 0; y < h; y += 1) {
    let sr = 0, sg = 0, sb = 0, sl = 0, sl2 = 0;
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const l = 0.3 * R[i] + 0.59 * G[i] + 0.11 * B[i];
      sr += R[i]; sg += G[i]; sb += B[i]; sl += l; sl2 += l * l;
      const o = (y + 1) * W + x + 1, up = y * W + x + 1;
      iR[o] = iR[up] + sr; iG[o] = iG[up] + sg; iB[o] = iB[up] + sb; iL[o] = iL[up] + sl; iL2[o] = iL2[up] + sl2;
    }
  }
  const oR = new Float32Array(N), oG = new Float32Array(N), oB = new Float32Array(N);
  const S = (I, x0, y0, x1, y1) => I[(y1 + 1) * W + x1 + 1] - I[y0 * W + x1 + 1] - I[(y1 + 1) * W + x0] + I[y0 * W + x0];
  for (let y = 0; y < h; y += 1) {
    const ya = Math.max(0, y - r), yb = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x += 1) {
      const xa = Math.max(0, x - r), xb = Math.min(w - 1, x + r);
      const quads = [[xa, ya, x, y], [x, ya, xb, y], [xa, y, x, yb], [x, y, xb, yb]];
      let best = Infinity, bq = quads[0], bn = 1;
      for (const q of quads) {
        const n = (q[2] - q[0] + 1) * (q[3] - q[1] + 1);
        const m = S(iL, q[0], q[1], q[2], q[3]) / n;
        const v = S(iL2, q[0], q[1], q[2], q[3]) / n - m * m;
        if (v < best) { best = v; bq = q; bn = n; }
      }
      const i = y * w + x;
      oR[i] = S(iR, bq[0], bq[1], bq[2], bq[3]) / bn;
      oG[i] = S(iG, bq[0], bq[1], bq[2], bq[3]) / bn;
      oB[i] = S(iB, bq[0], bq[1], bq[2], bq[3]) / bn;
    }
  }
  return [oR, oG, oB];
}

function boxBlur(A, w, h, r, passes) {
  const tmp = new Float32Array(A.length);
  for (let p = 0; p < passes; p += 1) {
    for (let y = 0; y < h; y += 1) {
      let acc = 0;
      const row = y * w;
      for (let x = -r; x <= r; x += 1) acc += A[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x += 1) {
        tmp[row + x] = acc / (2 * r + 1);
        acc += A[row + Math.min(w - 1, x + r + 1)] - A[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x += 1) {
      let acc = 0;
      for (let y = -r; y <= r; y += 1) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y += 1) {
        A[y * w + x] = acc / (2 * r + 1);
        acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
  }
  return A;
}

function sample(A, w, h, x, y) {
  x = Math.min(w - 1.001, Math.max(0, x)); y = Math.min(h - 1.001, Math.max(0, y));
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
  return A[i] * (1 - fx) * (1 - fy) + A[i + 1] * fx * (1 - fy) + A[i + w] * (1 - fx) * fy + A[i + w + 1] * fx * fy;
}

function paint(src, w, h, month, pins, seed) {
  const N = w * h;
  const k = w / 800;
  const nz = makeNoise(seed || 7);
  const rnd = mulberry32((seed || 7) * 31 + 5);
  const decid = buildDeciduousMap(w, h, pins || []);
  let [R, G, B] = seasonGrade(src, w, h, month, decid, nz);
  // Structure lines come from a heavily blurred luma so they follow big shapes, not foliage texture.
  const structL = new Float32Array(N);
  for (let i = 0; i < N; i += 1) structL[i] = 0.3 * R[i] + 0.59 * G[i] + 0.11 * B[i];
  boxBlur(structL, w, h, Math.max(2, Math.round(3 * k)), 3);
  [R, G, B] = kuwahara(R, G, B, w, h, Math.max(2, Math.round(4 * k)));
  // Wet-in-wet: soften the Kuwahara blocks into flowing washes, keeping some crisp edges.
  const sR = R.slice(), sG = G.slice(), sB = B.slice();
  const br = Math.max(2, Math.round(5 * k));
  boxBlur(sR, w, h, br, 2); boxBlur(sG, w, h, br, 2); boxBlur(sB, w, h, br, 2);
  for (let i = 0; i < N; i += 1) {
    const wet = 0.55 + 0.3 * nz.fbm((i % w) * 0.01, ((i / w) | 0) * 0.01, 2);
    R[i] += (sR[i] - R[i]) * wet; G[i] += (sG[i] - G[i]) * wet; B[i] += (sB[i] - B[i]) * wet;
  }

  // Wobble: pigment bleeds slightly past shapes.
  const wR = new Float32Array(N), wG = new Float32Array(N), wB = new Float32Array(N);
  const amp = 1.8 * k;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = (nz.fbm(x * 0.009 / k, y * 0.009 / k, 2) - 0.5) * 2 * amp;
      const dy = (nz.fbm(x * 0.009 / k + 50, y * 0.009 / k + 50, 2) - 0.5) * 2 * amp;
      const i = y * w + x;
      wR[i] = sample(R, w, h, x + dx, y + dy); wG[i] = sample(G, w, h, x + dx, y + dy); wB[i] = sample(B, w, h, x + dx, y + dy);
    }
  }

  // Wash: layered glazes, lighter pigment, gentle saturation lift.
  const L = new Float32Array(N);
  for (let i = 0; i < N; i += 1) {
    let r = wR[i], g = wG[i], b = wB[i];
    const l = 0.3 * r + 0.59 * g + 0.11 * b;
    const q = Math.round(l * 6) / 6;
    const f = 1 + ((q + 0.02) / (l + 0.02) - 1) * 0.12;
    r *= f; g *= f; b *= f;
    const l2 = 0.3 * r + 0.59 * g + 0.11 * b;
    r = l2 + (r - l2) * 1.25; g = l2 + (g - l2) * 1.25; b = l2 + (b - l2) * 1.25;
    // Transparent pigment: lift the darks hard, the paper does the rest.
    const lift = (c) => 1 - Math.pow(Math.min(1, Math.max(0, 1 - c)), 1.15) * 0.7;
    r = lift(r); g = lift(g); b = lift(b);
    wR[i] = r; wG[i] = g; wB[i] = b;
    L[i] = 0.3 * r + 0.59 * g + 0.11 * b;
  }

  const out = new Uint8ClampedArray(N * 4);
  const paper = [0.988, 0.974, 0.942];
  const sepia = [0.36, 0.29, 0.23];
  const border = 0.055 * Math.min(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      // Sobel on the wash: edges collect pigment; strongest become sketch lines.
      let gx = 0, gy = 0;
      if (x > 0 && y > 0 && x < w - 1 && y < h - 1) {
        gx = -L[i - w - 1] - 2 * L[i - 1] - L[i + w - 1] + L[i - w + 1] + 2 * L[i + 1] + L[i + w + 1];
        gy = -L[i - w - 1] - 2 * L[i - w] - L[i - w + 1] + L[i + w - 1] + 2 * L[i + w] + L[i + w + 1];
      }
      const gm = Math.sqrt(gx * gx + gy * gy);
      const darken = 1 - 0.12 * smoothstep(0.04, 0.22, gm);
      let sx = 0, sy = 0;
      if (x > 0 && y > 0 && x < w - 1 && y < h - 1) {
        sx = -structL[i - w - 1] - 2 * structL[i - 1] - structL[i + w - 1] + structL[i - w + 1] + 2 * structL[i + 1] + structL[i + w + 1];
        sy = -structL[i - w - 1] - 2 * structL[i - w] - structL[i - w + 1] + structL[i + w - 1] + 2 * structL[i + w] + structL[i + w + 1];
      }
      const sg = Math.sqrt(sx * sx + sy * sy) / k;
      const line = smoothstep(0.1, 0.22, sg) * 0.32 * (0.6 + 0.8 * nz.fbm(x * 0.05, y * 0.05, 2));
      let r = wR[i] * darken, g = wG[i] * darken, b = wB[i] * darken;
      r += (sepia[0] - r) * line; g += (sepia[1] - g) * line; b += (sepia[2] - b) * line;

      // Granulation: pigment settles into the paper grain, more so in dense washes.
      const dens = 1 - L[i];
      const gran = (rnd() - 0.5) * 0.07 + (nz.fbm(x * 0.21, y * 0.21, 2) - 0.5) * 0.1;
      const gf = 1 + gran * (0.4 + dens);
      r *= gf; g *= gf; b *= gf;

      // Blooms / cauliflower marks: low-frequency density variation.
      const bloom = (nz.fbm(x * 0.006 / k + 9, y * 0.006 / k, 4) - 0.5) * 0.2;
      r = 1 - (1 - r) * (1 + bloom); g = 1 - (1 - g) * (1 + bloom); b = 1 - (1 - b) * (1 + bloom);

      // Unpainted sparkles in the lightest areas.
      const sparkle = smoothstep(0.7, 0.8, nz.fbm(x * 0.09, y * 0.09, 2)) * smoothstep(0.7, 0.9, L[i]);
      r += (1 - r) * sparkle; g += (1 - g) * sparkle; b += (1 - b) * sparkle;

      // Ragged painted edge with pooled pigment just inside it.
      const edgeDist = Math.min(x, w - 1 - x, y, h - 1 - y) / border;
      const jag = (nz.fbm(x * 0.012, y * 0.012, 4) - 0.5) * 1.6 + (nz.fbm(x * 0.06, y * 0.06, 2) - 0.5) * 0.4;
      const d = edgeDist + jag;
      const m = smoothstep(0.35, 0.75, d);
      const rim = Math.exp(-((d - 0.8) ** 2) / 0.015) * 0.07;
      r *= 1 - rim; g *= 1 - rim; b *= 1 - rim;

      const fibre = 0.975 + 0.025 * nz.fbm(x * 0.11, y * 0.11, 2) + (rnd() - 0.5) * 0.012;
      const pr = paper[0] * fibre, pg = paper[1] * fibre, pb = paper[2] * fibre;
      const fr = pr * Math.min(1.02, Math.max(0, r)), fg = pg * Math.min(1.02, Math.max(0, g)), fb = pb * Math.min(1.02, Math.max(0, b));
      out[i * 4] = (pr + (fr - pr) * m) * 255;
      out[i * 4 + 1] = (pg + (fg - pg) * m) * 255;
      out[i * 4 + 2] = (pb + (fb - pb) * m) * 255;
      out[i * 4 + 3] = 255;
    }
  }
  return out;
}

if (typeof self !== "undefined" && typeof self.postMessage === "function" && typeof module === "undefined") {
  self.onmessage = (event) => {
    const { id, width, height, data, month, pins, seed } = event.data;
    try {
      const out = paint(new Uint8ClampedArray(data), width, height, month, pins, seed);
      self.postMessage({ id, data: out.buffer }, [out.buffer]);
    } catch (error) {
      self.postMessage({ id, error: String(error && error.message || error) });
    }
  };
}
if (typeof module !== "undefined") module.exports = { paint, MONTH_GRADES };
