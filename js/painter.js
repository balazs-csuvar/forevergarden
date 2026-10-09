// Paints plants onto the watercolour scene so planned additions look like part of the painting,
// and shows each plant in its true state for the month (bare, budding, flowering, autumn colour).

export function seededRandom(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  // Seasonal blends come back as "rgb(r,g,b)"; everything else is "#rrggbb".
  if (typeof hex === "string" && hex.startsWith("rgb")) return hex.match(/\d+/g).slice(0, 3).map(Number);
  const v = parseInt(String(hex || "#6b8a4a").replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const mix = (a, b, t) => { const x = hexToRgb(a), y = hexToRgb(b); return `rgb(${x.map((c, i) => Math.round(c + (y[i] - c) * t)).join(",")})`; };
const rgba = (hex, alpha) => { const [r, g, b] = typeof hex === "string" && hex.startsWith("rgb") ? hex.match(/\d+/g).map(Number) : hexToRgb(hex); return `rgba(${r},${g},${b},${alpha})`; };
const shade = (hex, f) => { const [r, g, b] = hexToRgb(hex); return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`; };

// How a plant looks in a given month: leaf cover, colour, flowering, fruit, stems.
export function plantState(sp, month) {
  const leafCurves = {
    evergreen: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    semi: [0.7, 0.7, 0.8, 0.9, 1, 1, 1, 1, 1, 1, 0.9, 0.75],
    deciduous: [0, 0, 0.15, 0.7, 1, 1, 1, 1, 1, 0.9, 0.45, 0],
    herbaceous: [0.12, 0.12, 0.3, 0.6, 0.9, 1, 1, 1, 1, 0.85, 0.45, 0.15],
    bulb: new Array(12).fill(0)
  };
  let leaf = (leafCurves[sp.habit] || leafCurves.herbaceous)[month];
  if (sp.habit === "bulb") {
    const leaves = sp.leaves || [...new Set(sp.bloom.flatMap((m) => [(m + 11) % 12, m, (m + 1) % 12]))];
    leaf = leaves.includes(month) ? 1 : 0;
  }
  let foliage = sp.foliage || "#5f7d45";
  if (sp.autumn && (month === 9 || month === 10)) foliage = mix(foliage, sp.autumn, month === 9 ? 0.55 : 0.95);
  if (sp.habit === "herbaceous" && (month >= 10 || month <= 1)) foliage = mix(foliage, "#a08a62", 0.75);
  if (sp.habit === "herbaceous" && month === 2) foliage = mix(foliage, "#a8c060", 0.3);
  if (sp.habit === "deciduous" && month === 3) foliage = mix(foliage, "#b5cf6a", 0.4);
  const inBloom = (sp.bloom || []).includes(month);
  const bloomEdge = inBloom && (!(sp.bloom || []).includes((month + 11) % 12) || !(sp.bloom || []).includes((month + 1) % 12));
  return {
    leaf,
    foliage,
    flowering: inBloom ? (bloomEdge ? 0.6 : 1) : 0,
    fruit: sp.fruit && sp.fruit.months.includes(month) ? sp.fruit.color : null,
    stems: leaf < 0.3 && sp.stems ? sp.stems : null,
    bare: leaf < 0.2
  };
}

function wash(ctx, cx, cy, rx, ry, color, alpha, rnd, points = 22) {
  ctx.beginPath();
  const offs = [];
  for (let i = 0; i < points; i += 1) offs.push(0.82 + rnd() * 0.3);
  for (let i = 0; i <= points; i += 1) {
    const a = (i / points) * Math.PI * 2;
    const o = offs[i % points];
    const x = cx + Math.cos(a) * rx * o, y = cy + Math.sin(a) * ry * o;
    if (i === 0) ctx.moveTo(x, y);
    else {
      const pa = ((i - 0.5) / points) * Math.PI * 2;
      const po = (o + offs[(i - 1) % points]) / 2 + (rnd() - 0.5) * 0.12;
      ctx.quadraticCurveTo(cx + Math.cos(pa) * rx * po, cy + Math.sin(pa) * ry * po, x, y);
    }
  }
  ctx.closePath();
  ctx.fillStyle = rgba(color, alpha);
  ctx.fill();
  ctx.lineWidth = Math.max(0.8, rx * 0.025);
  ctx.strokeStyle = rgba(color, Math.min(1, alpha * 0.9));
  ctx.stroke();
}

// Fineliner width for the current drawing (set per paintPlant call from the canvas size).
let LW = 1;
const INK = (alpha) => `rgba(48,42,36,${alpha})`;

// Garden-designer "cloud" outline: scalloped ink edge, a few leaf scribbles, hatched shadow side.
function inkCloud(ctx, cx, cy, rx, ry, rnd, strength = 1) {
  if (rx < 2 || ry < 2) return;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const bumps = Math.max(7, Math.min(30, Math.round((Math.PI * (rx + ry)) / Math.max(6, LW * 9))));
  const start = rnd() * Math.PI * 2;
  ctx.beginPath();
  for (let i = 0; i <= bumps; i += 1) {
    const a = start + (i / bumps) * Math.PI * 2;
    const j = 0.93 + rnd() * 0.1;
    const px = cx + Math.cos(a) * rx * j, py = cy + Math.sin(a) * ry * j;
    if (i === 0) ctx.moveTo(px, py);
    else {
      const ma = start + ((i - 0.5) / bumps) * Math.PI * 2;
      const bulge = 1.1 + rnd() * 0.08;
      ctx.quadraticCurveTo(cx + Math.cos(ma) * rx * bulge, cy + Math.sin(ma) * ry * bulge, px, py);
    }
  }
  ctx.lineWidth = LW;
  ctx.strokeStyle = INK(0.85 * strength);
  ctx.stroke();
  const scribbles = Math.min(18, Math.round(3 + (rx * ry) / (LW * LW * 350)));
  ctx.lineWidth = LW * 0.7;
  ctx.strokeStyle = INK(0.5 * strength);
  for (let i = 0; i < scribbles; i += 1) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 0.7;
    const s = Math.max(LW * 2, Math.min(rx, ry) * (0.08 + rnd() * 0.06));
    const a0 = Math.PI * (0.1 + rnd() * 0.5);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, s, a0, a0 + Math.PI * 0.85);
    ctx.stroke();
  }
  // Shadow crescent on the lower right, hatched at 45°.
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.97, ry * 0.97, 0, 0, Math.PI * 2);
  ctx.ellipse(cx - rx * 0.28, cy - ry * 0.32, rx * 0.95, ry * 0.95, 0, 0, Math.PI * 2);
  ctx.clip("evenodd");
  ctx.lineWidth = LW * 0.6;
  ctx.strokeStyle = INK(0.45 * strength);
  ctx.beginPath();
  const spacing = Math.max(2.5, LW * 3.2);
  for (let t = -(rx + ry); t < rx + ry; t += spacing) {
    ctx.moveTo(cx + t - ry, cy + ry);
    ctx.lineTo(cx + t + ry, cy - ry);
  }
  ctx.stroke();
  ctx.restore();
}

function canopy(ctx, cx, cy, rx, ry, color, rnd, density = 1) {
  // Loose tint first (sketch colour never quite fills the outline), then the ink drawing.
  // Laid on as fresh paint over the scene (not multiplied), so a new plant reads light and crisp.
  const light = mix(color, "#fbf6e6", 0.5);
  ctx.globalCompositeOperation = "source-over";
  wash(ctx, cx + rx * 0.04, cy + ry * 0.05, rx * 0.95, ry * 0.92, light, 0.82 * density, rnd);
  ctx.globalCompositeOperation = "multiply";
  for (let i = 0; i < 3; i += 1) {
    wash(ctx, cx + (rnd() - 0.3) * rx * 0.8, cy + (rnd() - 0.2) * ry * 0.7, rx * (0.3 + rnd() * 0.25), ry * (0.3 + rnd() * 0.25), mix(color, "#fbf6e6", 0.2), 0.16 * density, rnd, 14);
  }
  ctx.globalCompositeOperation = "source-over";
  inkCloud(ctx, cx, cy, rx, ry, rnd, Math.max(0.35, Math.min(1, density)));
}

function dabs(ctx, cx, cy, rx, ry, color, count, size, rnd) {
  ctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < count; i += 1) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd());
    const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d;
    const s = size * (0.6 + rnd() * 0.7);
    wash(ctx, x, y, s, s * (0.75 + rnd() * 0.4), color, 0.78, rnd, 7);
    if (rnd() < 0.3) {
      ctx.beginPath();
      ctx.arc(x, y, s * 0.9, 0, Math.PI * 2);
      ctx.lineWidth = LW * 0.55;
      ctx.strokeStyle = INK(0.5);
      ctx.stroke();
    }
  }
}

// Coloured stroke with a fine ink line over it, so stems, blades and trunks read as drawn.
function strokeLine(ctx, x0, y0, cx, cy, x1, y1, width, color, alpha) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(cx, cy, x1, y1);
  ctx.lineCap = "round";
  ctx.lineWidth = width * 1.3;
  ctx.strokeStyle = rgba(mix(color, "#fbf6e6", 0.35), alpha * 0.5);
  ctx.stroke();
  ctx.lineWidth = Math.min(width, LW * 0.75);
  ctx.strokeStyle = INK(Math.min(0.6, alpha * 0.85));
  ctx.stroke();
}

function bareBranches(ctx, x, baseY, w, h, color, rnd, trunkTop) {
  const stems = 7 + Math.floor(rnd() * 5);
  for (let i = 0; i < stems; i += 1) {
    const sx = x + (rnd() - 0.5) * w * 0.15;
    const sy = trunkTop ?? baseY;
    const ex = x + (rnd() - 0.5) * w;
    const ey = baseY - h * (0.55 + rnd() * 0.45);
    strokeLine(ctx, sx, sy, (sx + ex) / 2 + (rnd() - 0.5) * w * 0.2, (sy + ey) / 2, ex, ey, Math.max(1, w * 0.012), color, 0.65);
    for (let j = 0; j < 3; j += 1) {
      const t = 0.5 + rnd() * 0.4;
      const bx = sx + (ex - sx) * t, by = sy + (ey - sy) * t;
      strokeLine(ctx, bx, by, bx + (rnd() - 0.5) * w * 0.1, by - h * 0.08, bx + (rnd() - 0.5) * w * 0.25, by - h * 0.15, Math.max(0.7, w * 0.006), color, 0.5);
    }
  }
}

// Draw one planned plant. Returns its bounding box (for hit-testing/labels).
export function paintPlant(ctx, W, H, placement, sp, month, spot) {
  const rnd = seededRandom(placement.id);
  const st = plantState(sp, month);
  const horizon = spot.horizon ?? 0.36;
  const ppm = W * (spot.perspective ?? 0.67) * Math.max(0.018, placement.y - horizon) * (placement.size || 1);
  const x = placement.x * W, baseY = placement.y * H;
  const climberCap = sp.form === "climber" ? 2.2 : Infinity;
  const hM = Math.min(sp.h, climberCap, placement.maxH || Infinity);
  const w = Math.max(6, Math.min(sp.s, sp.form === "climber" ? 1.6 : sp.s) * ppm), h = Math.max(6, hM * ppm);
  const stemColor = st.stems || "#6a5240";
  LW = Math.max(0.8, Math.min(W, H) / 520);

  // Ground shadow: a pale wash and a few horizontal ink strokes, as in a designer's sketch.
  ctx.globalCompositeOperation = "multiply";
  wash(ctx, x + w * 0.08, baseY, w * 0.55, Math.max(2, w * 0.09), "#8a8070", 0.18, rnd, 14);
  ctx.globalCompositeOperation = "source-over";
  ctx.lineWidth = LW * 0.6;
  ctx.strokeStyle = INK(0.45);
  ctx.beginPath();
  for (let i = 0; i < 4; i += 1) {
    const yy = baseY + (i - 1) * Math.max(1.5, w * 0.025), half = w * (0.45 - Math.abs(i - 1) * 0.1);
    ctx.moveTo(x - half * 0.6 + w * 0.12, yy);
    ctx.lineTo(x + half + w * 0.12, yy);
  }
  ctx.stroke();

  const flowerSize = Math.max(1.6, Math.min(w * 0.035, W * 0.011));
  const flowerCount = Math.round(18 + Math.min(w * 0.12, (w * h) / (flowerSize * flowerSize * 40)));
  const fl = sp.flower && st.flowering > 0 ? sp.flower : null;

  switch (sp.form) {
    case "tree": {
      const trunkH = h * 0.4;
      strokeLine(ctx, x, baseY, x + w * 0.03, baseY - trunkH * 0.5, x, baseY - trunkH, Math.max(2, w * 0.05), "#5e4a3a", 0.85);
      if (st.leaf > 0.15) canopy(ctx, x, baseY - trunkH - (h - trunkH) * 0.45, w / 2, (h - trunkH) * 0.55, st.foliage, rnd, st.leaf);
      if (st.leaf < 0.6) bareBranches(ctx, x, baseY - trunkH * 0.6, w, h * 0.95, stemColor, rnd, baseY - trunkH);
      if (fl) dabs(ctx, x, baseY - trunkH - (h - trunkH) * 0.45, w * 0.45, (h - trunkH) * 0.48, fl, Math.round(flowerCount * 1.6 * st.flowering), flowerSize, rnd);
      if (st.fruit) dabs(ctx, x, baseY - trunkH - (h - trunkH) * 0.4, w * 0.4, (h - trunkH) * 0.42, st.fruit, 22, flowerSize * 0.8, rnd);
      break;
    }
    case "column": {
      canopy(ctx, x, baseY - h / 2, w / 2, h / 2, st.foliage, rnd, 1.1);
      break;
    }
    case "ball": {
      canopy(ctx, x, baseY - h / 2, w / 2, h / 2, st.foliage, rnd, 1.1);
      break;
    }
    case "spiky":
    case "grass": {
      const blades = sp.form === "grass" ? 26 : 16;
      const color = st.leaf > 0.2 ? st.foliage : "#a89272";
      const hh = st.leaf > 0.2 ? h * Math.max(0.35, st.leaf) : h * 0.25;
      for (let i = 0; i < blades; i += 1) {
        const lean = (rnd() - 0.5) * 2;
        const tipX = x + lean * w * (sp.form === "grass" ? 0.7 : 0.45);
        const tipY = baseY - hh * (0.6 + rnd() * 0.4) * (sp.form === "grass" ? 1 - Math.abs(lean) * 0.3 : 1);
        strokeLine(ctx, x + lean * w * 0.08, baseY, x + lean * w * 0.15, tipY + hh * 0.2, tipX, tipY, Math.max(1, w * (sp.form === "grass" ? 0.018 : 0.03)), i % 3 ? color : shade(color, 0.75), 0.6);
        if (fl && rnd() < (sp.form === "grass" ? 0.6 : 0.4) * st.flowering) {
          if (sp.form === "grass") wash(ctx, tipX, tipY, flowerSize * 1.2, flowerSize * 2.4, fl, 0.45, rnd, 8);
          else dabs(ctx, tipX, tipY - flowerSize, flowerSize * 1.5, flowerSize * 2.5, fl, 3, flowerSize, rnd);
        }
      }
      if (st.stems && sp.stems) for (let i = 0; i < 10; i += 1) strokeLine(ctx, x + (rnd() - 0.5) * w * 0.2, baseY, x, baseY - h * 0.5, x + (rnd() - 0.5) * w * 0.4, baseY - h * (0.8 + rnd() * 0.2), Math.max(1, w * 0.015), sp.stems, 0.7);
      break;
    }
    case "spire": {
      if (st.leaf > 0.2) canopy(ctx, x, baseY - h * 0.1, w / 2, h * 0.12, st.foliage, rnd, st.leaf);
      if (fl) {
        for (let s = 0; s < 3; s += 1) {
          const sx = x + (s - 1) * w * 0.18, top = baseY - h * (0.8 + rnd() * 0.2);
          strokeLine(ctx, sx, baseY - h * 0.1, sx, (top + baseY) / 2, sx + (rnd() - 0.5) * 4, top, Math.max(1, w * 0.02), "#4e6b3e", 0.7);
          for (let k = 0; k < 9; k += 1) wash(ctx, sx + (rnd() - 0.5) * w * 0.06, top + (k / 9) * h * 0.5, flowerSize * 1.2, flowerSize * 1.6, fl, 0.8, rnd, 7);
        }
      }
      break;
    }
    case "upright":
    case "airy": {
      // Woody upright shrubs (dogwood, viburnum…) read as a tall cloud; stems only show when bare.
      if (sp.form === "upright" && sp.habit !== "herbaceous") {
        if (st.leaf > 0.15) canopy(ctx, x, baseY - h * 0.5, w * 0.42, h * 0.5, st.foliage, rnd, st.leaf);
        if (st.leaf < 0.5) bareBranches(ctx, x, baseY, w * 0.8, h, st.stems || "#7a6250", rnd);
        if (fl) dabs(ctx, x, baseY - h * 0.55, w * 0.36, h * 0.42, fl, Math.round(flowerCount * st.flowering), flowerSize, rnd);
        break;
      }
      const leafH = st.leaf > 0.2 ? h * st.leaf : h * 0.2;
      if (sp.form === "upright" && st.leaf > 0.15) canopy(ctx, x, baseY - leafH * 0.35, w / 2, leafH * 0.38, st.foliage, rnd, st.leaf);
      const stems = sp.form === "airy" ? 9 : 12;
      for (let i = 0; i < stems; i += 1) {
        const ex = x + (rnd() - 0.5) * w * 0.9, ey = baseY - leafH * (0.7 + rnd() * 0.3);
        strokeLine(ctx, x + (rnd() - 0.5) * w * 0.2, baseY, (x + ex) / 2, (baseY + ey) / 2, ex, ey, Math.max(0.8, w * 0.012), st.leaf > 0.2 ? shade(st.foliage, 0.8) : (st.stems || "#8a7458"), 0.6);
        if (fl && rnd() < st.flowering) dabs(ctx, ex, ey, flowerSize * 1.4, flowerSize * 2, fl, sp.form === "airy" ? 2 : 3, flowerSize, rnd);
      }
      if (st.stems && sp.stems) bareBranches(ctx, x, baseY, w, h, sp.stems, rnd);
      break;
    }
    case "fern": {
      if (st.leaf < 0.15) { wash(ctx, x, baseY - h * 0.06, w * 0.25, h * 0.06, "#8a7458", 0.4, rnd, 10); break; }
      for (let i = 0; i < 11; i += 1) {
        const a = -Math.PI / 2 + (i / 10 - 0.5) * 2.4;
        const ex = x + Math.cos(a) * w * 0.55, ey = baseY + Math.sin(a) * h * st.leaf;
        strokeLine(ctx, x, baseY, (x + ex) / 2, ey - h * 0.1, ex, ey, Math.max(1, w * 0.02), st.foliage, 0.55);
        for (let k = 1; k < 7; k += 1) {
          const t = k / 7, fx = x + (ex - x) * t, fy = baseY + (ey - baseY) * t - h * 0.08 * Math.sin(t * Math.PI);
          wash(ctx, fx, fy, w * 0.035 * (1.2 - t), h * 0.03, st.foliage, 0.45, rnd, 6);
        }
      }
      break;
    }
    case "ground": {
      if (st.leaf > 0.1) canopy(ctx, x, baseY - h * 0.45, w / 2, Math.max(h * 0.55, w * 0.12), st.foliage, rnd, st.leaf);
      if (fl) dabs(ctx, x, baseY - h * 0.6, w * 0.45, Math.max(h * 0.45, w * 0.1), fl, Math.round(flowerCount * st.flowering), flowerSize * 0.8, rnd);
      break;
    }
    case "climber": {
      const top = baseY - h;
      strokeLine(ctx, x, baseY, x - w * 0.1, baseY - h * 0.5, x + w * 0.05, top, Math.max(1.2, w * 0.025), "#6a5240", 0.6);
      if (st.leaf > 0.15) {
        for (let i = 0; i < 6; i += 1) canopy(ctx, x + (rnd() - 0.5) * w * 0.6, baseY - h * (0.15 + i * 0.15), w * (0.22 + rnd() * 0.12), h * 0.12, st.foliage, rnd, st.leaf * 0.8);
      } else bareBranches(ctx, x, baseY, w, h, "#7a6250", rnd);
      if (fl) dabs(ctx, x, baseY - h * 0.55, w * 0.45, h * 0.45, fl, Math.round(flowerCount * 1.3 * st.flowering), flowerSize, rnd);
      break;
    }
    case "bulbs": {
      if (st.leaf <= 0) break;
      for (let i = 0; i < 9; i += 1) {
        const bx = x + (rnd() - 0.5) * Math.max(w, h * 0.8), by = baseY + (rnd() - 0.5) * h * 0.15;
        strokeLine(ctx, bx, by, bx, by - h * 0.5, bx + (rnd() - 0.5) * 3, by - h * (0.75 + rnd() * 0.25), Math.max(1, h * 0.03), st.foliage, 0.6);
        if (fl) wash(ctx, bx, by - h * (0.85 + rnd() * 0.15), flowerSize * 1.5, flowerSize * 1.5, fl, 0.85, rnd, 7);
      }
      break;
    }
    default: {
      if (st.leaf > 0.12) canopy(ctx, x, baseY - h * 0.5, w / 2, h / 2, st.foliage, rnd, Math.max(0.35, st.leaf));
      else bareBranches(ctx, x, baseY, w, h * 0.9, stemColor, rnd);
      if (fl) dabs(ctx, x, baseY - h * 0.55, w * 0.42, h * 0.38, fl, Math.round(flowerCount * st.flowering), flowerSize, rnd);
      if (st.fruit) dabs(ctx, x, baseY - h * 0.5, w * 0.4, h * 0.35, st.fruit, 24, flowerSize * 0.4, rnd);
    }
  }
  return { x, y: baseY - h, w, h };
}

// For plants already in the photo: dab flowers / autumn tints over their region in season.
export function paintExistingSeason(ctx, W, H, placement, sp, month) {
  const rnd = seededRandom(placement.id + month);
  const st = plantState(sp, month);
  const cx = placement.x * W, cy = placement.y * H, r = placement.r * W;
  if (sp.flower && st.flowering > 0 && sp.form !== "tree") {
    dabs(ctx, cx, cy, r * 0.7, r * 0.55, sp.flower, Math.round((14 + r * 0.25) * st.flowering), Math.max(1.5, r * 0.05), rnd);
  } else if (sp.flower && st.flowering > 0) {
    dabs(ctx, cx, cy, r * 0.75, r * 0.6, sp.flower, Math.round((20 + r * 0.3) * st.flowering), Math.max(1.5, r * 0.035), rnd);
  }
  if (st.fruit) dabs(ctx, cx, cy, r * 0.6, r * 0.5, st.fruit, 18, Math.max(1.2, r * 0.03), rnd);
  if (sp.autumn && (month === 9 || month === 10)) {
    ctx.globalCompositeOperation = "soft-light";
    wash(ctx, cx, cy, r * 0.8, r * 0.7, sp.autumn, month === 9 ? 0.35 : 0.55, rnd, 18);
    ctx.globalCompositeOperation = "source-over";
  }
}
