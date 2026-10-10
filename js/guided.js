// Guided photo walk, plan first: sketch the garden's shape with real measurements,
// mark the areas you'll photograph, then take one photo per area.
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
export function presetArea(plan, kind) {
  const b = bounds(plan.outline);
  const bw = Math.min(1.5, Math.max(0.6, b.w * 0.22));
  const back = Math.min(2.5, Math.max(1, b.h * 0.2));
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => [r1(x), r1(y)]);
  switch (kind) {
    case "left": return { name: "Left border", poly: rect(b.x0, b.y0 + 0.5, b.x0 + bw, b.y1 - back) };
    case "right": return { name: "Right border", poly: rect(b.x1 - bw, b.y0 + 0.5, b.x1, b.y1 - back) };
    case "back": return { name: "Back of the garden", poly: rect(b.x0, b.y1 - back, b.x1, b.y1) };
    case "middle": return { name: "Lawn", poly: rect(b.x0 + bw + 0.3, b.y0 + 1, b.x1 - bw - 0.3, b.y1 - back - 0.3) };
    default: {
      const [cx, cy] = centroid(plan.outline);
      return { name: "New area", poly: rect(cx - 1, cy - 1, cx + 1, cy + 1) };
    }
  }
}

// Where to stand to photograph an area. Usually back from it towards the middle of the garden,
// facing it. A long border that won't fit in from there is shot along its length from the house end.
const HALF_FOV = (65 / 2) * (Math.PI / 180);
export function cameraFor(plan, area) {
  const c = centroid(area.poly);
  const g = centroid(plan.outline);
  const others = plan.areas.filter((a) => a !== area && a.id !== area.id);
  const free = (x, y) => inside(x, y, plan.outline) && !inside(x, y, area.poly) && !others.some((o) => inside(x, y, o.poly));
  const ab = bounds(area.poly);
  let dx = g[0] - c[0], dy = g[1] - c[1];
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
export function planSvgInner(plan, { k = 0.05, mode = "view", selected = null, highlight = null, camera = null } = {}) {
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
    if ((isSel && mode === "areas") || dim) return;
    const [cx, cy] = S(centroid(a.poly));
    out.push(`<text x="${cx}" y="${cy + font * 0.35}" font-size="${font}" font-weight="700" text-anchor="middle" fill="#2a2b23" opacity="${dim ? 0.45 : 1}" pointer-events="none" style="paint-order:stroke" stroke="#fbf8f1" stroke-width="${3 * k}">${escXml(a.name)}</text>`);
  });
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
    out.push(`<circle cx="${x}" cy="${y}" r="${9 * k}" fill="#2a2b23"/><circle cx="${x}" cy="${y}" r="${3.5 * k}" fill="#fbf8f1"/>`);
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
  return `<svg viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" class="plan-svg" font-family="DM Sans, sans-serif" ${attrs}>${planSvgInner(plan, { ...opts, k })}</svg>`;
}

/* ---------- interactive editor ---------- */
// mode "shape": drag corners of the garden, tap + to add a corner, tap a side's length to type it.
// mode "areas": tap an area to select it, then drag its corners the same way.
export function mountPlanEditor(svg, plan, { mode, onSelect = () => {}, onSide = () => {}, onCorner = () => {}, onChange = () => {} }) {
  let selected = null;
  let vb = viewBoxFor(plan);
  let drag = null;
  const k = () => Math.max(vb.w / Math.max(1, svg.clientWidth || 340), vb.h / Math.max(1, svg.clientHeight || 340));
  const render = () => {
    svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    svg.innerHTML = planSvgInner(plan, { k: k(), mode, selected });
  };
  const toPlan = (ev) => {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return [p.x, -p.y];
  };
  const target = () => (mode === "shape" ? plan.outline : plan.areas.find((a) => a.id === selected)?.poly);
  svg.addEventListener("pointerdown", (ev) => {
    const el = ev.target.closest("[data-corner],[data-add],[data-side],[data-area]");
    const poly = target();
    if (el?.dataset.side != null && poly) { onSide(Number(el.dataset.side)); return; }
    if (el?.dataset.add != null && poly) {
      const i = Number(el.dataset.add), a = poly[i], b = poly[(i + 1) % poly.length];
      poly.splice(i + 1, 0, [r1((a[0] + b[0]) / 2), r1((a[1] + b[1]) / 2)]);
      drag = { poly, i: i + 1, id: ev.pointerId };
      svg.setPointerCapture(ev.pointerId);
      render(); onChange();
      return;
    }
    if (el?.dataset.corner != null && poly) {
      drag = { poly, i: Number(el.dataset.corner), id: ev.pointerId, start: [ev.clientX, ev.clientY], moved: false };
      svg.setPointerCapture(ev.pointerId);
      return;
    }
    if (mode === "areas") {
      const id = el?.dataset.area || null;
      selected = id;
      render(); onSelect(id);
    }
  });
  svg.addEventListener("pointermove", (ev) => {
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
    drag.poly[drag.i] = [r1(x), r1(y)];
    render(); onChange();
  });
  const end = (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    // Tapping (not dragging) a corner offers to remove it.
    if (d.start && !d.moved) { onCorner(d.i); return; }
    vb = viewBoxFor(plan);
    render();
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  render();
  return {
    render: () => { vb = viewBoxFor(plan); render(); },
    select: (id) => { selected = id; render(); },
    get selected() { return selected; },
    target
  };
}
