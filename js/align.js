// Finds how two neighbouring photos of a border overlap, so they can be joined into one strip.
// Compares edge maps (robust to exposure differences) at every horizontal offset and a small
// vertical drift, scoring each with normalised cross-correlation.

const H = 180;

function soften(a, w) {
  const out = new Float32Array(a.length);
  for (let y = 1; y < H - 1; y += 1) for (let x = 1; x < w - 1; x += 1) {
    const i = y * w + x;
    out[i] = (a[i] * 4 + a[i - 1] + a[i + 1] + a[i - w] + a[i + w]) / 8;
  }
  return out;
}

function edgeMap(img) {
  const scale = H / img.height;
  const w = Math.max(16, Math.round(img.width * scale));
  const g = new Float32Array(w * H);
  for (let y = 0; y < H; y += 1) {
    const sy = Math.min(img.height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(img.width - 1, Math.floor(x / scale));
      const o = (sy * img.width + sx) * 4;
      g[y * w + x] = 0.3 * img.data[o] + 0.59 * img.data[o + 1] + 0.11 * img.data[o + 2];
    }
  }
  const e = new Float32Array(w * H);
  for (let y = 1; y < H - 1; y += 1) for (let x = 1; x < w - 1; x += 1) {
    const i = y * w + x;
    e[i] = Math.abs(g[i + 1] - g[i - 1]) + Math.abs(g[i + w] - g[i - w]);
  }
  // Soften so a sub-pixel misalignment between the two photos still matches.
  return { w, e: soften(soften(e, w), w) };
}

// Returns where B starts on A: dx as a fraction of A's width (0.3 = B begins 30% across A),
// dy as a fraction of height, and a 0–1 match score. Assumes B continues to the right of A.
export function overlapOffset(imgA, imgB) {
  const A = edgeMap(imgA), B = edgeMap(imgB);
  const maxDy = Math.round(H * 0.08);
  let best = { score: -1, dx: 1, dy: 0 };
  for (let dxPx = Math.round(A.w * 0.12); dxPx <= Math.round(A.w * 0.97); dxPx += 1) {
    const ow = Math.min(A.w - dxPx, B.w);
    if (ow < A.w * 0.03) continue;
    for (let dyPx = -maxDy; dyPx <= maxDy; dyPx += 1) {
      let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, n = 0;
      for (let y = Math.max(2, dyPx + 2); y < Math.min(H - 2, H + dyPx - 2); y += 2) {
        const yb = y - dyPx;
        const ra = y * A.w + dxPx, rb = yb * B.w;
        for (let x = 1; x < ow - 1; x += 2) {
          const a = A.e[ra + x], b = B.e[rb + x];
          sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; n += 1;
        }
      }
      if (n < 60) continue;
      const cov = sab / n - (sa / n) * (sb / n);
      const va = saa / n - (sa / n) ** 2, vb = sbb / n - (sb / n) ** 2;
      const ncc = cov / Math.sqrt(Math.max(1e-6, va * vb));
      // Slight preference for larger overlaps, so a lucky match on a thin sliver doesn't win.
      const score = ncc * (0.85 + 0.15 * Math.min(1, ow / (A.w * 0.4)));
      if (score > best.score) best = { score, dx: dxPx / A.w, dy: dyPx / H };
    }
  }
  return { dx: +best.dx.toFixed(4), dy: +best.dy.toFixed(4), score: +best.score.toFixed(3) };
}
