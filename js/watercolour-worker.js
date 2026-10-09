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

function gaussian(A, w, h, sigma) {
  // Large blurs: three box passes approximate a Gaussian at a fraction of the cost.
  if (sigma > 1.6) {
    const out = A.slice();
    const r = Math.max(1, Math.round((-1 + Math.sqrt(1 + 4 * sigma * sigma)) / 2));
    return boxBlur(out, w, h, r, 3);
  }
  const r = Math.max(1, Math.ceil(sigma * 3));
  const kern = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i += 1) { kern[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += kern[i + r]; }
  for (let i = 0; i < kern.length; i += 1) kern[i] /= sum;
  const tmp = new Float32Array(A.length), out = new Float32Array(A.length);
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) {
      let acc = 0;
      for (let j = -r; j <= r; j += 1) acc += A[row + Math.min(w - 1, Math.max(0, x + j))] * kern[j + r];
      tmp[row + x] = acc;
    }
  }
  for (let x = 0; x < w; x += 1) {
    for (let y = 0; y < h; y += 1) {
      let acc = 0;
      for (let j = -r; j <= r; j += 1) acc += tmp[Math.min(h - 1, Math.max(0, y + j)) * w + x] * kern[j + r];
      out[y * w + x] = acc;
    }
  }
  return out;
}

// Thin contour lines (Canny-style): gradient crest only, so ink reads as pen strokes, not blobs.
// share = fraction of the image area that becomes line.
function contourLines(A, w, h, share) {
  const N = w * h;
  const mag = new Float32Array(N), dir = new Uint8Array(N);
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const gx = -A[i - w - 1] - 2 * A[i - 1] - A[i + w - 1] + A[i - w + 1] + 2 * A[i + 1] + A[i + w + 1];
      const gy = -A[i - w - 1] - 2 * A[i - w] - A[i - w + 1] + A[i + w - 1] + 2 * A[i + w] + A[i + w + 1];
      mag[i] = Math.hypot(gx, gy);
      const ang = (Math.atan2(gy, gx) * 180) / Math.PI;
      const a = (ang + 180) % 180;
      dir[i] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3;
    }
  }
  const crest = new Float32Array(N);
  const offs = [[1, 0], [1, 1], [0, 1], [-1, 1]];
  const vals = [];
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const [ox, oy] = offs[dir[i]];
      const m = mag[i];
      if (m >= mag[i + oy * w + ox] && m >= mag[i - oy * w - ox]) { crest[i] = m; if ((i & 3) === 0) vals.push(m); }
    }
  }
  vals.sort((a, b) => a - b);
  const crestFrac = (vals.length * 4) / N;
  const keep = Math.min(0.95, share / Math.max(crestFrac, 1e-6));
  const t1 = vals[Math.floor((1 - keep * 0.5) * (vals.length - 1))] || 1;
  const t0 = vals[Math.floor((1 - keep) * (vals.length - 1))] || t1 * 0.5;
  const out = new Float32Array(N);
  for (let i = 0; i < N; i += 1) if (crest[i] > 0) out[i] = smoothstep(t0, Math.max(t1, t0 + 1e-6), crest[i]);
  // Soften by a hair so lines are anti-aliased and slightly thicker where strong.
  const soft = new Float32Array(N);
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const n = Math.max(out[i - 1], out[i + 1], out[i - w], out[i + w]);
      soft[i] = Math.max(out[i], n * 0.45 * out[i] + n * 0.3);
    }
  }
  return soft;
}

// Share of the picture drawn in ink: outlines of masses, and finer detail lines.
const INK_SHARE = { mass: 0.045, detail: 0.03 };

// Stretch exposure so a dim or bright photo maps to the same tonal range before drawing.
function normalizeExposure(src, w, h) {
  const N = w * h;
  const hist = new Uint32Array(256);
  for (let i = 0; i < N; i += 1) hist[(0.3 * src[i * 4] + 0.59 * src[i * 4 + 1] + 0.11 * src[i * 4 + 2]) | 0] += 1;
  const pct = (q) => { let acc = 0; for (let v = 0; v < 256; v += 1) { acc += hist[v]; if (acc >= N * q) return v; } return 255; };
  const lo = pct(0.02), hi = Math.max(lo + 20, pct(0.985)), med = pct(0.5);
  const medN = Math.min(0.9, Math.max(0.1, (med - lo) / (hi - lo)));
  const gamma = Math.log(0.5) / Math.log(medN);
  const lut = new Float32Array(256);
  for (let v = 0; v < 256; v += 1) lut[v] = Math.pow(Math.min(1, Math.max(0, (v - lo) / (hi - lo))), gamma) * 255;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) { out[i] = lut[src[i]]; out[i + 1] = lut[src[i + 1]]; out[i + 2] = lut[src[i + 2]]; out[i + 3] = 255; }
  return out;
}

// Garden-designer sketch: ink linework + hatching carry the detail, a loose watercolour tint carries colour.
function paint(src, w, h, month, pins, seed) {
  const N = w * h;
  const k = w / 900;
  const nz = makeNoise(seed || 7);
  const rnd = mulberry32((seed || 7) * 31 + 5);
  const decid = buildDeciduousMap(w, h, pins || []);
  const [R, G, B] = seasonGrade(normalizeExposure(src, w, h), w, h, month, decid, nz);

  // Edge-preserving clean-up so lines follow real edges, not photo noise.
  // Two levels: light clean-up for hard landscaping, heavier simplification so foliage reads as masses.
  const [kR, kG, kB] = kuwahara(R, G, B, w, h, Math.max(1, Math.round(1.5 * k)));
  const L = new Float32Array(N);
  for (let i = 0; i < N; i += 1) L[i] = Math.min(1, Math.max(0, 0.3 * kR[i] + 0.59 * kG[i] + 0.11 * kB[i]));
  // A round blur (not a square filter) so foliage masses get soft, cloud-like outlines.
  const M = gaussian(L, w, h, 2.6 * k);

  // Ink lines: thin contours of the simplified masses, plus finer detail on the lightly cleaned image.
  const massLines = contourLines(M, w, h, INK_SHARE.mass);
  const detailLines = contourLines(gaussian(L, w, h, 0.9 * k), w, h, INK_SHARE.detail);
  const T = gaussian(L, w, h, 2.5 * k);

  // Soft, misregistered colour for the tint.
  const sig = 3 * k;
  const cR = gaussian(kR, w, h, sig), cG = gaussian(kG, w, h, sig), cB = gaussian(kB, w, h, sig);

  const out = new Uint8ClampedArray(N * 4);
  const paper = [0.99, 0.978, 0.95];
  const inkC = [0.2, 0.18, 0.16];
  const border = 0.05 * Math.min(w, h);
  const sp = 4.2 * k;
  const amp = 3.2 * k;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;

      // Outlines of masses (shrubs, canopies, beds) plus crisp detail lines on strong edges only.
      const lineInk = Math.min(1, massLines[i] * 0.95 + detailLines[i] * 0.6);

      // Hatching follows tone: single diagonal in shade, cross-hatch in deep shade.
      const t = T[i];
      const wob = (nz.fbm(x * 0.02 / k, y * 0.02 / k, 2) - 0.5) * 1.1;
      const u1 = (x + y) / (sp * 1.414) + wob;
      const u2 = (x - y) / (sp * 1.414) - wob;
      const l1 = 1 - smoothstep(0.07, 0.17, Math.abs(u1 - Math.round(u1)));
      const l2 = 1 - smoothstep(0.07, 0.17, Math.abs(u2 - Math.round(u2)));
      const dash = smoothstep(0.32, 0.5, nz.noise(x * 0.06 / k, y * 0.18 / k));
      const hatch = Math.max(l1 * smoothstep(0.34, 0.2, t), l2 * smoothstep(0.2, 0.08, t)) * dash;

      // Ragged sheet: colour stops short, ink runs closer to the edge.
      const edgeDist = Math.min(x, w - 1 - x, y, h - 1 - y) / border;
      const jag = (nz.fbm(x * 0.012, y * 0.012, 4) - 0.5) * 1.8 + (nz.fbm(x * 0.07, y * 0.07, 2) - 0.5) * 0.4;
      const d = edgeDist + jag;
      const colourMask = smoothstep(0.8, 1.6, d);
      const inkMask = smoothstep(0.45, 0.85, d);

      // Tint: offset sample, lightened and a touch more saturated; leaves white paper in places.
      const dx = (nz.fbm(x * 0.008 / k, y * 0.008 / k, 2) - 0.5) * 2 * amp;
      const dy = (nz.fbm(x * 0.008 / k + 40, y * 0.008 / k + 40, 2) - 0.5) * 2 * amp;
      let r = sample(cR, w, h, x + dx, y + dy), g = sample(cG, w, h, x + dx, y + dy), b = sample(cB, w, h, x + dx, y + dy);
      const lum = 0.3 * r + 0.59 * g + 0.11 * b;
      r = lum + (r - lum) * 1.5; g = lum + (g - lum) * 1.5; b = lum + (b - lum) * 1.5;
      const lift = (c) => 1 - Math.min(1, Math.max(0, 1 - c)) * 0.45;
      r = lift(r); g = lift(g); b = lift(b);
      // Colour goes where the planting is (saturated areas); paving and soil stay mostly paper.
      const mx = Math.max(cR[i], cG[i], cB[i]), mn = Math.min(cR[i], cG[i], cB[i]);
      const chroma = mx - mn;
      const patch = nz.fbm(x * 0.004 / k + 7, y * 0.004 / k, 3);
      let m = smoothstep(0.04, 0.14, chroma) * 0.6 + 0.4;
      m *= smoothstep(0.2, 0.45, patch + 0.12);
      m *= 1 - smoothstep(0.75, 0.92, t) * 0.8;
      m *= colourMask;
      const rim = (1 - Math.abs(2 * m - 1)) * 0.08 * colourMask;
      const gran = 1 + (rnd() - 0.5) * 0.05 + (nz.fbm(x * 0.25, y * 0.25, 2) - 0.5) * 0.08 * m;

      const fibre = 0.978 + 0.022 * nz.fbm(x * 0.12, y * 0.12, 2);
      let fr = paper[0] * fibre * (1 - m * (1 - r)) * (1 - rim) * gran;
      let fg = paper[1] * fibre * (1 - m * (1 - g)) * (1 - rim) * gran;
      let fb = paper[2] * fibre * (1 - m * (1 - b)) * (1 - rim) * gran;

      // Ink pressure varies a little, like a fineliner.
      const pressure = 0.75 + 0.35 * nz.noise(x * 0.03 / k + 3, y * 0.03 / k);
      const a = Math.min(0.95, (lineInk * 0.95 + hatch * 0.5) * pressure) * inkMask;
      fr = fr * (1 - a) + inkC[0] * a;
      fg = fg * (1 - a) + inkC[1] * a;
      fb = fb * (1 - a) + inkC[2] * a;
      out[i * 4] = fr * 255;
      out[i * 4 + 1] = fg * 255;
      out[i * 4 + 2] = fb * 255;
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
