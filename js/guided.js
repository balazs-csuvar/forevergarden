// Guided photo walk, plan first: sketch the garden's shape with real measurements,
// mark the areas you'll photograph, then photograph each one. Borders are photographed
// in 2–3 m sections so each photo shows the plants up close.
// Plan coordinates are metres: x to the right, y away from the house (house along y = 0).

const AREA_COLOURS = ["#5d7650", "#c46f4c", "#5f87a8", "#b8913a", "#8a6a9a", "#4f8f86"];
export const areaColour = (i) => AREA_COLOURS[i % AREA_COLOURS.length];

export function newPlan(width = 6, length = 12) {
  return { outline: [[0, 0], [width, 0], [width, length], [0, length]], areas: [] };
}

/* ---------- geometry ---------- */
export function bounds(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
export function signedArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return a / 2;
}
export function centroid(pts) {
  const a = signedArea(pts);
  if (Math.abs(a) < 1e-9) { const b = bounds(pts); return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; }
  let cx = 0, cy = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const c = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    cx += (pts[j][0] + pts[i][0]) * c; cy += (pts[j][1] + pts[i][1]) * c;
  }
  return [cx / (6 * a), cy / (6 * a)];
}
export function inside(x, y, pts) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const r1 = (v) => Math.round(v * 10) / 10;
export const fmtM = (v) => `${r1(v).toFixed(1).replace(/\.0$/, "")} m`;

// Size of an area for display, e.g. "4.5 × 1.2 m · 5.4 m²".
export function describeSize(pts) {
  const b = bounds(pts);
  const area = Math.abs(signedArea(pts));
  return `${r1(Math.max(b.w, b.h)).toFixed(1).replace(/\.0$/, "")} × ${r1(Math.min(b.w, b.h)).toFixed(1).replace(/\.0$/, "")} m · ${area < 10 ? area.toFixed(1) : Math.round(area)} m²`;
}

// Set the length of side i (corner i → i+1). The far corner moves along the side, and so does the
// run of corners after it while their sides are square to it, so a rectangle stays a rectangle.
export function setSideLength(pts, i, target) {
  const n = pts.length;
  const a = pts[i], b = pts[(i + 1) % n];
  const L = len(a, b);
  if (L < 1e-6 || !(target > 0)) return pts;
  const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
  const d = target - L;
  const out = pts.map((p) => [...p]);
  let k = (i + 1) % n;
  for (let steps = 0; steps < n - 1; steps++) {
    out[k] = [r1(out[k][0] + ux * d), r1(out[k][1] + uy * d)];
    const next = (k + 1) % n;
    if (next === i) break;
    const e = [pts[next][0] - pts[k][0], pts[next][1] - pts[k][1]];
    const el = Math.hypot(e[0], e[1]) || 1;
    if (Math.abs((e[0] * ux + e[1] * uy) / el) > 0.15) break; // not square to the edited side: stop here
    k = next;
  }
  return out;
}

// Starting shapes for the usual areas, inside the garden's bounding box.
export function presetArea(plan, kind, at = null) {
  const b = bounds(plan.outline);
  const bw = Math.min(1.5, Math.max(0.6, b.w * 0.22));
  const back = Math.min(2.5, Math.max(1, b.h * 0.2));
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => [r1(x), r1(y)]);
  switch (kind) {
    case "left": return { name: "Left border", poly: rect(b.x0, b.y0 + 0.5, b.x0 + bw, b.y1 - back) };
    case "right": return { name: "Right border", poly: rect(b.x1 - bw, b.y0 + 0.5, b.x1, b.y1 - back) };
    case "back": return { name: "Back border", poly: rect(b.x0, b.y1 - back, b.x1, b.y1) };
    case "middle": return { name: "Lawn", poly: rect(b.x0 + bw + 0.3, b.y0 + 1, b.x1 - bw - 0.3, b.y1 - back - 0.3) };
    default: {
      // Small areas go in the middle of what's on screen, sized to the zoom.
      const [cx, cy] = at ? [at.cx, at.cy] : centroid(plan.outline);
      const side = Math.min(2.5, Math.max(0.4, (at?.span ?? 4) * 0.3));
      const [w, h, name] = kind === "bed" ? [side * 1.4, side * 0.7, "Bed"] : kind === "patio" ? [side * 1.2, side, "Patio"] : [side, side, "New area"];
      return { name, poly: rect(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2) };
    }
  }
}

/* ---------- sections: borders photographed 2–3 m at a time ---------- */
const SECTION_MAX = 3;
const BORDER_WORDS = /border|bed|hedge|fence|edge/i;
export function isSectioned(area) {
  if (typeof area.sections === "boolean") return area.sections;
  return BORDER_WORDS.test(area.name || "");
}
// Keep the part of a polygon between lo and hi along one axis (0 = x, 1 = y).
function clipSlab(poly, axis, lo, hi) {
  const clip = (pts, keep, edge) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ina = keep(a[axis]), inb = keep(b[axis]);
      if (ina) out.push(a);
      if (ina !== inb) {
        const t = (edge - a[axis]) / (b[axis] - a[axis]);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  };
  return clip(clip(poly, (v) => v >= lo - 1e-9, lo), (v) => v <= hi + 1e-9, hi);
}
// The photos to take of an area: one, or a run of 2–3 m sections along its length,
// numbered from the house end (or from the left, for a border across the garden).
export function shotsOf(area) {
  const b = bounds(area.poly);
  const axis = b.h >= b.w ? 1 : 0;
  const L = axis ? b.h : b.w;
  const n = isSectioned(area) ? Math.max(1, Math.ceil(L / SECTION_MAX - 1e-6)) : 1;
  if (n === 1) return [{ key: area.id, area, index: null, count: 1, poly: area.poly, length: L, name: area.name }];
  const start = axis ? b.y0 : b.x0, step = L / n;
  return Array.from({ length: n }, (_, i) => ({
    key: `${area.id}#${i}`, area, index: i, count: n, length: step,
    poly: clipSlab(area.poly, axis, start + step * i, start + step * (i + 1)),
    name: `${area.name} · ${i + 1} of ${n}`
  })).filter((s) => s.poly.length >= 3);
}
export const shotsFor = (plan) => plan.areas.flatMap(shotsOf);
export const sectionCount = (area) => shotsOf(area).length;

// Where to stand to photograph an area. Usually back from it towards the middle of the garden,
// facing it. A long border that won't fit in from there is shot along its length from the house end.
const HALF_FOV = (65 / 2) * (Math.PI / 180);
export function cameraFor(plan, area) {
  const c = centroid(area.poly);
  // Where you chose to stand instead, if you moved it.
  const own = plan.cams?.[area.key || area.id];
  if (own) {
    const l = Math.hypot(own.dir[0], own.dir[1]) || 1;
    return { x: own.x, y: own.y, dir: [own.dir[0] / l, own.dir[1] / l], dist: Math.hypot(c[0] - own.x, c[1] - own.y), along: false, custom: true };
  }
  const g = centroid(plan.outline);
  const ownId = area.area?.id || area.id;
  // You can stand on a lawn or patio, but not in another border.
  const others = plan.areas.filter((a) => a.id !== ownId && isSectioned(a));
  const free = (x, y) => inside(x, y, plan.outline) && !inside(x, y, area.poly) && !others.some((o) => inside(x, y, o.poly));
  const ab = bounds(area.poly);
  let dx = g[0] - c[0], dy = g[1] - c[1];
  // Borders and their sections are faced square on, from the garden side.
  const pb = bounds((area.area || area).poly);
  if (pb.h >= pb.w * 1.5) { dx = Math.sign(dx) || 1; dy = 0; }
  else if (pb.w >= pb.h * 1.5) { dx = 0; dy = Math.sign(dy) || -1; }
  let d = Math.hypot(dx, dy);
  if (d < 0.5) { dx = 0; dy = -1; d = 1; } // an area in the middle: stand nearer the house
  dx /= d; dy /= d;
  // The width you need to fit in when facing it square on.
  const span = Math.abs(dx) > Math.abs(dy) ? ab.h : ab.w;
  const need = Math.min(9, Math.max(1.5, (span / 2) / Math.tan(HALF_FOV) - (Math.abs(dx) > Math.abs(dy) ? ab.w : ab.h) / 2 + 0.5));
  let best = null;
  for (let dist = need; dist >= 0.8; dist -= 0.25) {
    const x = c[0] + dx * dist, y = c[1] + dy * dist;
    if (free(x, y) || (dist <= 1.5 && inside(x, y, plan.outline))) { best = { x, y, dir: [-dx, -dy], dist, along: false }; break; }
  }
  const fits = best && best.dist >= need - 0.3;
  if (!fits && ab.h > ab.w * 2.2) {
    // Long border running away from the house: stand at the house end, beside it, looking along it.
    const side = g[0] >= c[0] ? 1 : -1;
    const x = (side > 0 ? ab.x1 : ab.x0) + side * Math.min(1.2, Math.max(0.6, ab.w * 0.6));
    const og = bounds(plan.outline);
    const y = Math.max(og.y0 + 0.4, ab.y0 - 0.6);
    const look = [c[0], ab.y0 + ab.h * 0.6];
    const vx = look[0] - x, vy = look[1] - y, vl = Math.hypot(vx, vy) || 1;
    if (inside(x, y, plan.outline)) return { x, y, dir: [vx / vl, vy / vl], dist: Math.hypot(c[0] - x, c[1] - ab.y0), along: true };
  }
  return best || { x: c[0] + dx * 1.5, y: c[1] + dy * 1.5, dir: [-dx, -dy], dist: 1.5, along: false };
}

// Where the path marker to another area sits on this area's photo (0–1 across and down).
export function linkSpot(cam, target) {
  const t = [target[0] - cam.x, target[1] - cam.y];
  const fwd = t[0] * cam.dir[0] + t[1] * cam.dir[1];
  const right = t[0] * cam.dir[1] - t[1] * cam.dir[0]; // y points away from the house
  const ang = Math.atan2(right, fwd);
  const half = (65 / 2) * (Math.PI / 180);
  if (Math.abs(ang) < half * 0.9) return { x: Math.min(0.88, Math.max(0.12, 0.5 + Math.tan(ang) / (2 * Math.tan(half)))), y: 0.6 };
  return { x: ang < 0 ? 0.1 : 0.9, y: 0.82 };
}

/* ---------- drawing ---------- */
// Plan y runs away from the house; on screen the house is at the bottom.
const S = ([x, y]) => [x, -y];
const pts2 = (pts) => pts.map((p) => S(p).map((v) => v.toFixed(2)).join(",")).join(" ");

export function viewBoxFor(plan, pad = 0.18) {
  const all = [...plan.outline, ...plan.areas.flatMap((a) => a.poly)];
  const b = bounds(all);
  const m = Math.max(b.w, b.h) * pad + 1;
  // Room under the garden for the house.
  return { x: b.x0 - m, y: -b.y1 - m, w: b.w + 2 * m, h: b.h + 2 * m + 1.2 };
}

// k = metres per screen pixel, so handles and text stay a constant size on screen.
export function planSvgInner(plan, { k = 0.05, mode = "view", selected = null, highlight = null, camera = null, shot = null, dots = null, editCamera = false } = {}) {
  const ob = bounds(plan.outline);
  const font = 12 * k;
  const out = [];
  out.push(`<rect x="${ob.x0 - 0.3}" y="${0.15}" width="${ob.w + 0.6}" height="${1.1}" rx="${0.15}" fill="#e2dac8" stroke="#9a907a" stroke-width="${1.2 * k}"/>`);
  out.push(`<text x="${(ob.x0 + ob.x1) / 2}" y="${0.15 + 0.55 + font * 0.35}" font-size="${font}" text-anchor="middle" fill="#6b6455">House</text>`);
  out.push(`<polygon points="${pts2(plan.outline)}" fill="#e6ead6" stroke="#5d7650" stroke-width="${2.2 * k}" stroke-linejoin="round" data-garden="1"/>`);
  plan.areas.forEach((a, i) => {
    const col = areaColour(i);
    const isSel = selected === a.id, isHi = highlight === a.id;
    const dim = highlight && !isHi;
    out.push(`<polygon points="${pts2(a.poly)}" fill="${col}" fill-opacity="${dim ? 0.12 : isSel || isHi ? 0.42 : 0.28}" stroke="${col}" stroke-opacity="${dim ? 0.35 : 1}" stroke-width="${(isSel || isHi ? 2.6 : 1.6) * k}" stroke-dasharray="${isSel ? `${6 * k} ${4 * k}` : "none"}" data-area="${a.id}"/>`);
    const shots = shotsOf(a);
    if (shots.length > 1) {
      // Section dividers; in the plan card each section can be tapped to open its view.
      shots.forEach((sh) => {
        out.push(`<polygon points="${pts2(sh.poly)}" fill="${mode === "view" && !highlight ? "transparent" : "none"}" stroke="#fbf8f1" stroke-opacity="${dim ? 0.5 : 0.9}" stroke-width="${1.6 * k}" stroke-dasharray="${4 * k} ${3 * k}" ${mode === "view" && !highlight ? `data-shot="${sh.key}"` : 'pointer-events="none"'}/>`);
      });
    }
    if ((isSel && mode === "areas") || dim || (shot && shots.length > 1)) return;
    const [cx, cy] = S(centroid(a.poly));
    // Names run along tall, narrow areas so they fit.
    const ab = bounds(a.poly);
    const rot = ab.h > ab.w * 1.8 && ab.w < 2.5 ? ` transform="rotate(-90 ${cx} ${cy})"` : "";
    out.push(`<text${rot} x="${cx}" y="${cy + font * 0.35}" font-size="${font}" font-weight="700" text-anchor="middle" fill="#2a2b23" opacity="${dim ? 0.45 : 1}" pointer-events="none" style="paint-order:stroke" stroke="#fbf8f1" stroke-width="${3 * k}">${escXml(a.name)}</text>`);
  });
  // One dot per plant, coloured by its flower or foliage.
  if (dots) for (const d of dots) {
    const [x, y] = S([d.x, d.y]);
    out.push(`<g data-plant="${escXml(d.key)}" style="cursor:pointer"><circle cx="${x}" cy="${y}" r="${12 * k}" fill="transparent"/><circle cx="${x}" cy="${y}" r="${5.5 * k}" fill="${escXml(d.colour)}" stroke="#fbf8f1" stroke-width="${1.6 * k}"/>${d.multi ? `<circle cx="${x}" cy="${y}" r="${8 * k}" fill="none" stroke="#2a2b23" stroke-width="${1 * k}"/>` : ""}</g>`);
  }
  if (shot) out.push(`<polygon points="${pts2(shot.poly)}" fill="#c46f4c" fill-opacity=".45" stroke="#c46f4c" stroke-width="${2.8 * k}" pointer-events="none"/>`);
  // Side lengths: on the garden while shaping it, on the selected area while marking areas.
  const sideOf = mode === "shape" ? plan.outline : mode === "areas" && selected ? plan.areas.find((a) => a.id === selected)?.poly : mode === "view" && !highlight ? plan.outline : null;
  if (sideOf) out.push(sideLabels(sideOf, k, mode !== "view"));
  if (mode === "shape") out.push(handles(plan.outline, k, true));
  if (mode === "areas" && selected) {
    const a = plan.areas.find((x) => x.id === selected);
    if (a) out.push(handles(a.poly, k, true));
  }
  if (camera) {
    const [x, y] = S([camera.x, camera.y]);
    const ang = Math.atan2(-camera.dir[1], camera.dir[0]);
    const spread = 0.55, L = Math.max(1.6, camera.dist * 1.1);
    const p1 = [x + Math.cos(ang - spread) * L, y + Math.sin(ang - spread) * L];
    const p2 = [x + Math.cos(ang + spread) * L, y + Math.sin(ang + spread) * L];
    out.push(`<clipPath id="plan-clip"><polygon points="${pts2(plan.outline)}"/></clipPath>`);
    out.push(`<polygon clip-path="url(#plan-clip)" points="${x},${y} ${p1.join(",")} ${p2.join(",")}" fill="rgba(196,111,76,.25)" stroke="#c46f4c" stroke-width="${1.4 * k}"/>`);
    if (editCamera) {
      // A handle at the end of the view to turn it.
      const hx = x + Math.cos(ang) * L * 0.8, hy = y + Math.sin(ang) * L * 0.8;
      out.push(`<line x1="${x}" y1="${y}" x2="${hx}" y2="${hy}" stroke="#c46f4c" stroke-width="${2 * k}" stroke-dasharray="${4 * k} ${3 * k}"/>`);
      out.push(`<g data-aim="1" style="cursor:grab"><circle cx="${hx}" cy="${hy}" r="${20 * k}" fill="transparent"/><circle cx="${hx}" cy="${hy}" r="${9 * k}" fill="#fffdf8" stroke="#c46f4c" stroke-width="${2.4 * k}"/><path d="M${hx - 4 * k} ${hy - 2 * k}a${4.5 * k} ${4.5 * k} 0 1 1 ${1 * k} ${5 * k}" fill="none" stroke="#c46f4c" stroke-width="${1.6 * k}"/></g>`);
    }
    out.push(`<g ${editCamera ? 'data-cam="1" style="cursor:grab"' : ""}><circle cx="${x}" cy="${y}" r="${22 * k}" fill="transparent"/><circle cx="${x}" cy="${y}" r="${9 * k}" fill="#2a2b23"/><circle cx="${x}" cy="${y}" r="${3.5 * k}" fill="#fbf8f1"/></g>`);
    // Label on the side away from where you're looking.
    const left = camera.dir[0] > 0.2;
    out.push(`<text x="${x + (left ? -14 : 14) * k}" y="${y + font * 0.35}" font-size="${font}" text-anchor="${left ? "end" : "start"}" font-weight="700" fill="#2a2b23" style="paint-order:stroke" stroke="#fbf8f1" stroke-width="${3 * k}">Stand here</text>`);
  }
  return out.join("");
}

function sideLabels(pts, k, tappable) {
  const ccw = signedArea(pts) > 0;
  const font = 11.5 * k;
  return pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const L = len(a, b);
    if (L < 0.05) return "";
    // Outward normal (plan coordinates), then flip y for the screen.
    let nx = (b[1] - a[1]) / L, ny = -(b[0] - a[0]) / L;
    if (!ccw) { nx = -nx; ny = -ny; }
    const off = 13 * k;
    const [mx, my] = S([(a[0] + b[0]) / 2 + nx * off, (a[1] + b[1]) / 2 + ny * off]);
    const text = fmtM(L);
    const w = (text.length * 6.6 + 12) * k, h = 18 * k;
    return `<g ${tappable ? `data-side="${i}" style="cursor:pointer"` : ""}><rect x="${mx - w / 2}" y="${my - h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="#fffdf8" stroke="${tappable ? "#c46f4c" : "#cfc6b2"}" stroke-width="${k}"/><text x="${mx}" y="${my + font * 0.36}" font-size="${font}" font-weight="600" text-anchor="middle" fill="#2a2b23" pointer-events="none">${text}</text></g>`;
  }).join("");
}

function handles(pts, k, withAdd) {
  const out = [];
  if (withAdd) pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    if (len(a, b) < 0.6) return;
    // Add-corner handle sits a third of the way along, clear of the length label.
    const [x, y] = S([a[0] + (b[0] - a[0]) * 0.28, a[1] + (b[1] - a[1]) * 0.28]);
    out.push(`<g data-add="${i}"><circle cx="${x}" cy="${y}" r="${11 * k}" fill="transparent"/><circle cx="${x}" cy="${y}" r="${6 * k}" fill="#fffdf8" stroke="#5d7650" stroke-width="${1.3 * k}"/><path d="M${x - 3 * k} ${y}h${6 * k}M${x} ${y - 3 * k}v${6 * k}" stroke="#5d7650" stroke-width="${1.4 * k}"/></g>`);
  });
  pts.forEach((p, i) => {
    const [x, y] = S(p);
    out.push(`<g data-corner="${i}"><circle cx="${x}" cy="${y}" r="${18 * k}" fill="transparent"/><circle cx="${x}" cy="${y}" r="${8 * k}" fill="#c46f4c" stroke="#fffdf8" stroke-width="${2.2 * k}"/></g>`);
  });
  return out.join("");
}

function escXml(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// Static plan picture (no editing), e.g. the "stand here" diagram or the plan card.
export function planSvg(plan, opts = {}, attrs = "") {
  const vb = viewBoxFor(plan);
  const k = Math.max(vb.w / (opts.widthPx || 340), opts.heightPx ? vb.h / opts.heightPx : 0);
  return `<svg viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" ${/\bclass=/.test(attrs) ? "" : 'class="plan-svg"'} font-family="DM Sans, sans-serif" ${attrs}>${planSvgInner(plan, { ...opts, k })}</svg>`;
}

/* ---------- interactive editor ---------- */
// mode "shape": drag corners of the garden, tap + to add a corner, tap a side's length to type it.
// mode "areas": tap an area to select it, then drag its corners the same way.
// Pinch (or the wheel) zooms; dragging an empty spot moves around. Handles keep their size on
// screen, so zooming in lets you place corners precisely. Pass the same `view` object to keep
// the zoom when the editor is redrawn.
const MAX_ZOOM = 14;
export function mountPlanEditor(svg, plan, { mode, view = {}, onSelect = () => {}, onSide = () => {}, onCorner = () => {}, onChange = () => {}, onCommit = () => {} }) {
  let selected = null;
  let fit = viewBoxFor(plan);
  view.z ||= 1;
  if (view.cx == null) { view.cx = fit.x + fit.w / 2; view.cy = fit.y + fit.h / 2; }
  const pointers = new Map();
  let drag = null, gesture = null;
  const size = () => ({ W: Math.max(1, svg.clientWidth || 340), H: Math.max(1, svg.clientHeight || 340) });
  const unitsPerPx = (z = view.z) => { const { W, H } = size(); return Math.max(fit.w / W, fit.h / H) / z; };
  const vb = () => { const w = fit.w / view.z, h = fit.h / view.z; return { x: view.cx - w / 2, y: view.cy - h / 2, w, h }; };
  const k = () => unitsPerPx();
  const clampView = () => {
    view.z = Math.min(MAX_ZOOM, Math.max(1, view.z));
    const v = vb();
    const mx = Math.max(0, (fit.w - v.w) / 2), my = Math.max(0, (fit.h - v.h) / 2);
    const fx = fit.x + fit.w / 2, fy = fit.y + fit.h / 2;
    view.cx = Math.min(fx + mx, Math.max(fx - mx, view.cx));
    view.cy = Math.min(fy + my, Math.max(fy - my, view.cy));
  };
  const render = () => {
    clampView();
    const v = vb();
    svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
    svg.innerHTML = planSvgInner(plan, { k: k(), mode, selected });
  };
  const toSvg = (cx, cy) => {
    const pt = svg.createSVGPoint();
    pt.x = cx; pt.y = cy;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };
  const toPlan = (ev) => { const p = toSvg(ev.clientX, ev.clientY); return [p.x, -p.y]; };
  const rectCentre = () => { const r = svg.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  // Keep the plan point `anchor` (svg units) under the screen point (sx, sy) at zoom z.
  const placeAt = (anchor, sx, sy, z) => {
    view.z = Math.min(MAX_ZOOM, Math.max(1, z));
    const [rx, ry] = rectCentre(), u = unitsPerPx();
    view.cx = anchor.x - (sx - rx) * u;
    view.cy = anchor.y - (sy - ry) * u;
    render();
  };
  const zoomAt = (sx, sy, factor) => placeAt(toSvg(sx, sy), sx, sy, view.z * factor);
  const target = () => (mode === "shape" ? plan.outline : plan.areas.find((a) => a.id === selected)?.poly);
  const startPinch = () => {
    const [a, b] = [...pointers.values()];
    const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
    gesture = { type: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: view.z, anchor: toSvg(...mid) };
  };
  svg.addEventListener("pointerdown", (ev) => {
    svg.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 2) {
      // A second finger: zoom instead (a corner being dragged stays where it got to).
      if (drag?.moved) { drag = null; onCommit(); } else drag = null;
      startPinch();
      return;
    }
    if (pointers.size > 2) return;
    const el = ev.target.closest("[data-corner],[data-add],[data-side],[data-area]");
    const poly = target();
    if (el?.dataset.side != null && poly) { gesture = { type: "side", i: Number(el.dataset.side), sx: ev.clientX, sy: ev.clientY }; return; }
    if (el?.dataset.add != null && poly) {
      const i = Number(el.dataset.add), a = poly[i], b = poly[(i + 1) % poly.length];
      poly.splice(i + 1, 0, [r1((a[0] + b[0]) / 2), r1((a[1] + b[1]) / 2)]);
      drag = { poly, i: i + 1, id: ev.pointerId, moved: true };
      render(); onChange();
      return;
    }
    if (el?.dataset.corner != null && poly) {
      drag = { poly, i: Number(el.dataset.corner), id: ev.pointerId, start: [ev.clientX, ev.clientY], moved: false };
      return;
    }
    // Anything else: a tap selects (in areas mode); a drag moves the view.
    const anchor = toSvg(ev.clientX, ev.clientY);
    gesture = { type: "pan", id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, anchor, moved: false, area: el?.dataset.area || null };
  });
  svg.addEventListener("pointermove", (ev) => {
    if (!pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (gesture?.type === "pinch" && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      placeAt(gesture.anchor, (a.x + b.x) / 2, (a.y + b.y) / 2, gesture.z0 * (Math.hypot(a.x - b.x, a.y - b.y) / gesture.d0));
      return;
    }
    if (gesture?.type === "pan" && ev.pointerId === gesture.id) {
      if (!gesture.moved && Math.hypot(ev.clientX - gesture.sx, ev.clientY - gesture.sy) < 6) return;
      gesture.moved = true;
      if (view.z > 1.001) placeAt(gesture.anchor, ev.clientX, ev.clientY, view.z);
      return;
    }
    if (!drag || ev.pointerId !== drag.id) return;
    if (drag.start && !drag.moved && Math.hypot(ev.clientX - drag.start[0], ev.clientY - drag.start[1]) < 4) return;
    drag.moved = true;
    let [x, y] = toPlan(ev);
    const n = drag.poly.length;
    const prev = drag.poly[(drag.i - 1 + n) % n], next = drag.poly[(drag.i + 1) % n];
    // Snap into line with the neighbouring corners, which keeps square corners square.
    const snap = 14 * k();
    for (const q of [prev, next]) {
      if (Math.abs(x - q[0]) < snap) x = q[0];
      if (Math.abs(y - q[1]) < snap) y = q[1];
    }
    // Finer steps when zoomed right in.
    const step = view.z >= 4 ? 0.05 : 0.1;
    drag.poly[drag.i] = [Math.round(x / step) * step, Math.round(y / step) * step].map((v) => +v.toFixed(2));
    render(); onChange();
  });
  const end = (ev) => {
    if (!pointers.has(ev.pointerId)) return;
    pointers.delete(ev.pointerId);
    if (gesture?.type === "pinch") {
      if (pointers.size === 1) {
        // Carry on moving the view with the finger that's left.
        const [[id, p]] = [...pointers.entries()];
        gesture = { type: "pan", id, sx: p.x, sy: p.y, anchor: toSvg(p.x, p.y), moved: true };
      } else if (!pointers.size) gesture = null;
      return;
    }
    if (gesture?.type === "side") {
      const g = gesture; gesture = null;
      if (Math.hypot(ev.clientX - g.sx, ev.clientY - g.sy) < 8) onSide(g.i);
      return;
    }
    if (gesture?.type === "pan" && ev.pointerId === gesture.id) {
      const g = gesture; gesture = null;
      if (!g.moved && mode === "areas" && ev.type === "pointerup") { selected = g.area; render(); onSelect(g.area); }
      return;
    }
    if (!drag || ev.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    // Tapping (not dragging) a corner offers to remove it.
    if (d.start && !d.moved) { onCorner(d.i); return; }
    fit = viewBoxFor(plan);
    render();
    onCommit();
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  svg.addEventListener("wheel", (ev) => { ev.preventDefault(); zoomAt(ev.clientX, ev.clientY, ev.deltaY < 0 ? 1.2 : 1 / 1.2); }, { passive: false });
  render();
  return {
    render: () => { fit = viewBoxFor(plan); render(); },
    select: (id) => { selected = id; render(); },
    get selected() { return selected; },
    target,
    zoomBy: (f) => { const [rx, ry] = rectCentre(); zoomAt(rx, ry, f); },
    fit: () => { view.z = 1; view.cx = fit.x + fit.w / 2; view.cy = fit.y + fit.h / 2; render(); },
    // Zoom so an area fills most of the view.
    zoomTo: (poly) => {
      const b = bounds(poly);
      const { W, H } = size();
      const base = Math.max(fit.w / W, fit.h / H);
      view.z = Math.min(MAX_ZOOM, Math.max(1, base / (Math.max((b.w + 1.2) / W, (b.h + 1.2) / H))));
      view.cx = (b.x0 + b.x1) / 2; view.cy = -(b.y0 + b.y1) / 2;
      render();
    },
    // What's on screen now, in plan metres: its centre and the smaller of its width and height.
    visible: () => { const { W, H } = size(); const u = unitsPerPx(); return { cx: view.cx, cy: -view.cy, span: Math.min(W, H) * u }; }
  };
}

/* ---------- keeping areas tidy: inside the garden, never overlapping ----------
   Areas are trimmed on a fine grid (5 cm), then the result is traced back into a polygon,
   straightened, and snapped onto the original corners so edges stay exact. */
const MIN_PIECE = 0.3;   // m²: smaller leftovers are dropped
const MIN_CHANGE = 0.03; // m²: overlaps smaller than this are ignored
const MIN_SPLIT = 2;     // m²: a cut-off piece must be at least this big to become its own area

function trimPoly(poly, outline, blockers) {
  const b = bounds(poly);
  let cell = 0.05;
  while (((b.w / cell) * (b.h / cell)) > 400000) cell *= 1.5;
  const x0 = Math.floor(b.x0 / cell) * cell - cell, y0 = Math.floor(b.y0 / cell) * cell - cell;
  const nx = Math.ceil((b.x1 - x0) / cell) + 2, ny = Math.ceil((b.y1 - y0) / cell) + 2;
  const live = blockers.filter((q) => { const qb = bounds(q); return qb.x1 > b.x0 && qb.x0 < b.x1 && qb.y1 > b.y0 && qb.y0 < b.y1; });
  const grid = new Uint8Array(nx * ny);
  let inA = 0, kept = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const cx = x0 + (i + 0.5) * cell, cy = y0 + (j + 0.5) * cell;
    if (!inside(cx, cy, poly)) continue;
    inA++;
    if (inside(cx, cy, outline) && !live.some((q) => inside(cx, cy, q))) { grid[j * nx + i] = 1; kept++; }
  }
  if ((inA - kept) * cell * cell < MIN_CHANGE) return null; // nothing worth changing
  const snapTo = [poly, outline, ...live].flat();
  const pieces = [];
  for (const comp of components(grid, nx, ny)) {
    if (comp.count * cell * cell < MIN_PIECE) continue;
    carveHoles(comp.mask, nx, ny, b.w < b.h ? 0 : 1);
    for (const part of components(comp.mask, nx, ny)) {
      if (part.count * cell * cell < MIN_PIECE) continue;
      const loop = traceOuter(part.mask, nx, ny);
      if (!loop) continue;
      const pts = tidy(simplifyClosed(loop.map(([i, j]) => [x0 + i * cell, y0 + j * cell]), cell * 1.3), snapTo, cell * 1.8);
      if (pts.length >= 3 && Math.abs(signedArea(pts)) >= MIN_PIECE) pieces.push(pts);
    }
  }
  pieces.sort((p, q) => Math.abs(signedArea(q)) - Math.abs(signedArea(p)));
  return pieces;
}

function components(grid, nx, ny) {
  const seen = new Uint8Array(nx * ny), out = [];
  for (let s = 0; s < grid.length; s++) {
    if (!grid[s] || seen[s]) continue;
    const mask = new Uint8Array(nx * ny), stack = [s];
    let count = 0;
    seen[s] = 1;
    while (stack.length) {
      const c = stack.pop(); mask[c] = 1; count++;
      const i = c % nx, j = (c - i) / nx;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, bb = j + dj;
        if (a < 0 || bb < 0 || a >= nx || bb >= ny) continue;
        const n = bb * nx + a;
        if (grid[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    out.push({ mask, count });
  }
  return out.sort((p, q) => q.count - p.count);
}

// An area entirely inside another would leave a hole; cut a notch from the hole to the
// nearest edge instead, across the area's narrow direction (axis 0 = left/right).
function carveHoles(mask, nx, ny, axis) {
  const outside = new Uint8Array(nx * ny), stack = [];
  for (let i = 0; i < nx; i++) stack.push(i, (ny - 1) * nx + i);
  for (let j = 0; j < ny; j++) stack.push(j * nx, j * nx + nx - 1);
  while (stack.length) {
    const c = stack.pop();
    if (outside[c] || mask[c]) continue;
    outside[c] = 1;
    const i = c % nx, j = (c - i) / nx;
    if (i > 0) stack.push(c - 1); if (i < nx - 1) stack.push(c + 1);
    if (j > 0) stack.push(c - nx); if (j < ny - 1) stack.push(c + nx);
  }
  const holes = new Uint8Array(nx * ny);
  let any = false;
  for (let c = 0; c < mask.length; c++) if (!mask[c] && !outside[c]) { holes[c] = 1; any = true; }
  if (!any) return;
  let mi0 = nx, mi1 = 0, mj0 = ny, mj1 = 0;
  for (let c = 0; c < mask.length; c++) if (mask[c]) { const i = c % nx, j = (c - i) / nx; mi0 = Math.min(mi0, i); mi1 = Math.max(mi1, i); mj0 = Math.min(mj0, j); mj1 = Math.max(mj1, j); }
  for (const h of components(holes, nx, ny)) {
    let i0 = nx, i1 = 0, j0 = ny, j1 = 0;
    for (let c = 0; c < h.mask.length; c++) if (h.mask[c]) { const i = c % nx, j = (c - i) / nx; i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); }
    if (axis === 0) {
      const toLow = i0 - mi0 <= mi1 - i1;
      for (let j = j0; j <= j1; j++) for (let i = toLow ? mi0 : i1; i <= (toLow ? i0 : mi1); i++) mask[j * nx + i] = 0;
    } else {
      const toLow = j0 - mj0 <= mj1 - j1;
      for (let i = i0; i <= i1; i++) for (let j = toLow ? mj0 : j1; j <= (toLow ? j0 : mj1); j++) mask[j * nx + i] = 0;
    }
  }
}

// Outer boundary of a set of cells, as corner coordinates, anticlockwise.
function traceOuter(mask, nx, ny) {
  const at = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && mask[j * nx + i];
  const edges = new Map();
  const add = (a, b) => { const k = `${a[0]},${a[1]}`; (edges.get(k) || edges.set(k, []).get(k)).push({ a, b, used: false }); };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!mask[j * nx + i]) continue;
    if (!at(i, j - 1)) add([i, j], [i + 1, j]);
    if (!at(i + 1, j)) add([i + 1, j], [i + 1, j + 1]);
    if (!at(i, j + 1)) add([i + 1, j + 1], [i, j + 1]);
    if (!at(i - 1, j)) add([i, j + 1], [i, j]);
  }
  let best = null, bestArea = 0;
  for (const list of edges.values()) for (const first of list) {
    if (first.used) continue;
    const loop = [];
    let e = first;
    while (e && !e.used) {
      e.used = true;
      loop.push(e.a);
      const dir = [e.b[0] - e.a[0], e.b[1] - e.a[1]];
      const nexts = (edges.get(`${e.b[0]},${e.b[1]}`) || []).filter((x) => !x.used);
      // At a pinch point, turn left: pieces that only touch at a corner are traced separately.
      nexts.sort((p, q) => turn(dir, q) - turn(dir, p));
      e = nexts[0];
    }
    const area = signedArea(loop);
    if (area > bestArea) { bestArea = area; best = loop; }
  }
  return best;
}
const turn = (dir, e) => { const d = [e.b[0] - e.a[0], e.b[1] - e.a[1]]; return dir[0] * d[1] - dir[1] * d[0]; };

function simplifyClosed(pts, tol) {
  if (pts.length < 4) return pts;
  let far = 0, fd = -1;
  for (let i = 1; i < pts.length; i++) { const d = len(pts[0], pts[i]); if (d > fd) { fd = d; far = i; } }
  const dp = (a) => {
    if (a.length < 3) return a;
    let idx = 0, md = 0;
    for (let i = 1; i < a.length - 1; i++) { const d = segDist(a[i], a[0], a[a.length - 1]); if (d > md) { md = d; idx = i; } }
    if (md <= tol) return [a[0], a[a.length - 1]];
    return [...dp(a.slice(0, idx + 1)).slice(0, -1), ...dp(a.slice(idx))];
  };
  const one = dp(pts.slice(0, far + 1)), two = dp([...pts.slice(far), pts[0]]);
  return [...one.slice(0, -1), ...two.slice(0, -1)];
}
function segDist(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vy * t);
}
// Snap onto nearby original corners, round, drop repeats and straight-through points.
function tidy(pts, snapTo, snap) {
  let out = pts.map((p) => {
    let best = null, bd = snap;
    for (const q of snapTo) { const d = len(p, q); if (d < bd) { bd = d; best = q; } }
    return best ? [...best] : [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];
  });
  out = out.filter((p, i) => len(p, out[(i + 1) % out.length]) > 0.02);
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length], p = out[i], c = out[(i + 1) % out.length];
      if (segDist(p, a, c) < 0.02) { out.splice(i, 1); changed = true; break; }
    }
  }
  return out;
}

// Make every area sit inside the garden without overlapping. Areas earlier in `first`
// keep their shape; the rest are trimmed around them (in plan order).
// Returns notes for the person, e.g. "Trimmed Back border".
export function settleAreas(plan, first = []) {
  const order = [...first.map((id) => plan.areas.find((a) => a.id === id)).filter(Boolean), ...plan.areas.filter((a) => !first.includes(a.id))];
  const placed = [], notes = [], extra = [];
  for (const a of order) {
    const pieces = trimPoly(a.poly, plan.outline, placed.map((p) => p.poly));
    if (pieces === null) { placed.push(a); continue; }
    if (!pieces.length) { notes.push(`Removed ${a.name}: no room left for it`); a.dead = true; continue; }
    a.poly = pieces[0];
    placed.push(a);
    notes.push(`Trimmed ${a.name} to fit`);
    pieces.slice(1).filter((poly) => Math.abs(signedArea(poly)) >= MIN_SPLIT).forEach((poly, k) => {
      const piece = { ...a, id: `${a.id}-${Date.now().toString(36)}${k}`, name: `${a.name} (${k + 2})`, poly, sections: a.sections };
      delete piece.spotId;
      extra.push(piece); placed.push(piece);
      notes.push(`${a.name} was split in two`);
    });
  }
  plan.areas = [...plan.areas.filter((a) => !a.dead), ...extra];
  return [...new Set(notes)];
}

/* ---------- where things in a photo sit on the plan ---------- */
export function shotOfSpot(plan, spot) {
  if (!plan || !spot?.planAreaId) return null;
  const area = plan.areas.find((a) => a.id === spot.planAreaId);
  if (!area) return null;
  const shots = shotsOf(area);
  return shots.find((s) => s.index === (spot.planSection ?? null)) || shots[Math.min(shots.length - 1, spot.planSection ?? 0)] || null;
}

// Plan position (metres) of a point on a view's photo (x, y from 0 to 1), worked out from where
// the photo was taken and which way it faced. Approximate: good to about a metre.
export function planPoint(plan, spot, x, y) {
  const sh = shotOfSpot(plan, spot);
  if (!sh) return null;
  const cam = cameraFor(plan, sh);
  const ang = Math.atan((x - 0.5) * 2 * Math.tan(HALF_FOV));
  const r = [cam.dir[1], -cam.dir[0]];
  const ray = [cam.dir[0] * Math.cos(ang) + r[0] * Math.sin(ang), cam.dir[1] * Math.cos(ang) + r[1] * Math.sin(ang)];
  const c = centroid(sh.poly);
  const ahead = (c[0] - cam.x) * cam.dir[0] + (c[1] - cam.y) * cam.dir[1];
  const b = bounds(sh.poly);
  // Lower in the photo is nearer the front of the bed.
  const depth = cam.along ? 0 : Math.min(b.w, b.h) * (0.72 - y) * 1.4;
  const t = Math.max(0.3, (ahead + depth) / Math.max(0.25, ray[0] * cam.dir[0] + ray[1] * cam.dir[1]));
  const px = cam.x + ray[0] * t, py = cam.y + ray[1] * t;
  return [Math.min(b.x1, Math.max(b.x0, px)), Math.min(b.y1, Math.max(b.y0, py))];
}

// Views whose part of the plan touches this one (neighbouring border sections, a border's end
// meeting the back border, and so on).
export function neighbourSpotIds(plan, spot, spots) {
  const mine = shotOfSpot(plan, spot);
  if (!mine) return [];
  const a = bounds(mine.poly);
  return spots.filter((s) => s.id !== spot.id).filter((s) => {
    const sh = shotOfSpot(plan, s);
    if (!sh) return false;
    const b = bounds(sh.poly);
    const gx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1));
    const gy = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
    return Math.hypot(gx, gy) <= 0.6;
  }).map((s) => s.id);
}

/* ---------- choosing where to stand for a photo ----------
   Drag the dot to stand somewhere else (it keeps facing what you're photographing), drag the
   round handle to turn, or tap anywhere in the garden to stand there. Saved in plan.cams. */
export function mountCameraEditor(svg, plan, shot, opts, onCommit = () => {}) {
  const key = shot.key || shot.id;
  const target = centroid(shot.poly);
  let drag = null;
  const vbOf = () => svg.viewBox.baseVal;
  const k = () => { const v = vbOf(); return Math.max(v.width / Math.max(1, svg.clientWidth), v.height / Math.max(1, svg.clientHeight)); };
  const render = () => { svg.innerHTML = planSvgInner(plan, { ...opts, k: k(), camera: cameraFor(plan, shot), editCamera: true }); };
  const toPlan = (ev) => {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return [p.x, -p.y];
  };
  const set = (patch) => {
    const cur = cameraFor(plan, shot);
    const next = { x: cur.x, y: cur.y, dir: cur.dir, aimed: plan.cams?.[key]?.aimed || false, ...patch };
    if (!inside(next.x, next.y, plan.outline)) return;
    if (!next.aimed || patch.facing) next.dir = [target[0] - next.x, target[1] - next.y];
    delete next.facing;
    (plan.cams ||= {})[key] = { x: r1(next.x * 10) / 10, y: r1(next.y * 10) / 10, dir: next.dir, aimed: next.aimed };
    render();
  };
  svg.addEventListener("pointerdown", (ev) => {
    svg.setPointerCapture(ev.pointerId);
    const el = ev.target.closest("[data-cam],[data-aim]");
    if (el?.dataset.aim) drag = "aim";
    else { drag = "cam"; if (!el) { const [x, y] = toPlan(ev); set({ x, y }); } }
  });
  svg.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    const [x, y] = toPlan(ev);
    if (drag === "cam") set({ x, y });
    else { const cur = cameraFor(plan, shot); set({ dir: [x - cur.x, y - cur.y], aimed: true }); }
  });
  const end = () => { if (drag) { drag = null; onCommit(); } };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  render();
}
