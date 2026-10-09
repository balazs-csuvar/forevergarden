import { getValue, setValue, getBlob, putBlob, deleteBlobsWithPrefix, uid } from "./store.js";
import { searchPlants, SOURCE_LABEL } from "./plant-index.js";
import { segmentAt, pointInPoly, polyBounds } from "./segment.js";
import { buildFirstGarden, newSpot } from "./seed.js";
import { paintPlant, paintExistingSeason, plantState } from "./painter.js";
import { MONTHS, MON, monthRange, nearestArea, bloomCoverage, speciesFor, recommendFor, describeConditions, fitsConditions } from "./recommend.js";
import * as ai from "./ai.js";

const ENGINE = "sk4";
const WORK_SIZE = 960;
const SEASON_COLORS = ["#a7b6c8", "#b3c0c9", "#c3d39a", "#a6cf7a", "#8cc46a", "#e2a6bd", "#e6c25a", "#dba94a", "#c99a4a", "#c9773e", "#a86a48", "#9aa8b8"];
const LIGHT_LABEL = { full: "Full sun (6h+)", part: "Part shade (3–6h)", shade: "Shade (<3h)" };
const MOIST_LABEL = { dry: "Dry", moist: "Moist, drains well", wet: "Damp / heavy" };
const ASPECTS = { N: "north", NE: "north-east", E: "east", SE: "south-east", S: "south", SW: "south-west", W: "west", NW: "north-west" };
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let state;
let apiKey = "";
const ui = { view: "walk", spotId: null, month: new Date().getMonth(), labels: true, edit: false, photo: false, mode: null, history: [], areaId: null, gapMonth: null, playing: false, sheetPlacement: null };

/* ---------- persistence ---------- */
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => setValue("state", state).catch(() => toast("Couldn't save. Storage may be full.")), 150);
}
function persistUi() {
  try { localStorage.setItem("fg-ui", JSON.stringify({ spotId: ui.spotId, labels: ui.labels })); } catch { /* private mode */ }
}
function restoreUi() {
  try { Object.assign(ui, JSON.parse(localStorage.getItem("fg-ui")) || {}); } catch { /* ignore */ }
}

/* ---------- toast & sheet ---------- */
let toastTimer;
function toast(message, ms = 2800) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}
const sheet = $("#sheet");
function openSheet(html, bind) {
  if (!html.includes('id="tag-q"')) sheet.classList.remove("compact");
  $("#sheet-body").innerHTML = html;
  if (!sheet.open) sheet.show();
  $("#sheet-body").scrollTop = 0;
  bind?.($("#sheet-body"));
}
function closeSheet() {
  if (sheet.open) sheet.close();
  sheet.classList.remove("compact");
  if (ui.draft && ui.mode?.type !== "draw") { ui.draft = null; if (ui.view === "walk") renderOverlay(); }
  ui.sheetPlacement = null;
  document.querySelectorAll(".pin.selected").forEach((pin) => pin.classList.remove("selected"));
}

/* ---------- photo helpers ---------- */
function pickPhoto() {
  return new Promise((resolve) => {
    const input = $("#gallery-input");
    input.value = "";
    const done = () => { input.removeEventListener("change", onChange); window.removeEventListener("focus", onFocus); };
    const onChange = () => { done(); resolve(input.files?.[0] || null); };
    const onFocus = () => setTimeout(() => { if (!input.files?.length) { done(); resolve(null); } }, 800);
    input.addEventListener("change", onChange);
    window.addEventListener("focus", onFocus);
    input.click();
  });
}
async function resizeBlob(blob, max = 1600, quality = 0.86) {
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}
const photoUrls = new Map();
async function photoUrl(key) {
  if (!key) return "";
  if (!photoUrls.has(key)) {
    const blob = await getBlob(key);
    photoUrls.set(key, blob ? URL.createObjectURL(blob) : "");
  }
  return photoUrls.get(key);
}

/* ---------- watercolour rendering pipeline ---------- */
const worker = new Worker("js/watercolour-worker.js");
const jobs = new Map();
let nextJob = 1;
worker.onmessage = (event) => {
  const job = jobs.get(event.data.id);
  jobs.delete(event.data.id);
  if (event.data.error) job.reject(new Error(event.data.error));
  else job.resolve(event.data.data);
};
function paintInWorker(imageData, month, pins) {
  return new Promise((resolve, reject) => {
    const id = nextJob++;
    jobs.set(id, { resolve, reject });
    const copy = imageData.data.slice().buffer;
    worker.postMessage({ id, width: imageData.width, height: imageData.height, data: copy, month, pins, seed: 7 }, [copy]);
  });
}

// One painting at a time; the view you are looking at jumps the queue.
const queue = [];
const queuedByKey = new Map();
let busy = false, seq = 0;
function schedule(key, task, priority) {
  const existing = queuedByKey.get(key);
  if (existing) { existing.priority = Math.max(existing.priority, priority); return existing.promise; }
  const job = { key, task, priority, seq: seq++ };
  job.promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
  queue.push(job);
  queuedByKey.set(key, job);
  pump();
  return job.promise;
}
async function pump() {
  if (busy || !queue.length) return;
  queue.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
  const job = queue.shift();
  busy = true;
  try { job.resolve(await job.task()); } catch (error) { job.reject(error); }
  queuedByKey.delete(job.key);
  busy = false;
  pump();
}

const pixelCache = new Map();
async function spotPixels(spot) {
  if (pixelCache.has(spot.id)) return pixelCache.get(spot.id);
  const blob = await getBlob(spot.photoId);
  if (!blob) throw new Error("Photo missing for this view");
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const scale = Math.min(1, WORK_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (pixelCache.size > 3) pixelCache.delete(pixelCache.keys().next().value);
  pixelCache.set(spot.id, data);
  return data;
}

function habitKind(sp) {
  if (!sp) return 0.55;
  return { evergreen: 0, semi: 0.3, herbaceous: 0.75, bulb: 0.75, deciduous: 1 }[sp.habit] ?? 0.55;
}
function pinsFor(spot) {
  const pins = state.placements
    .filter((p) => p.spotId === spot.id && p.status === "existing")
    .map((p) => ({ x: p.x, y: p.y, r: p.r || 0.06, kind: habitKind(speciesFor(state, p.speciesId)), poly: p.outline || null }));
  return pins.concat(state.backdrop?.[spot.id] || []);
}
function hashStr(text) {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
const baseKey = (spot, month) => `wc:${spot.id}:${month}:${hashStr(JSON.stringify(pinsFor(spot)))}:${ENGINE}`;

const baseCache = new Map();
const inflight = new Map();
async function getBase(spot, month, priority = 1) {
  const key = baseKey(spot, month);
  if (baseCache.has(key)) return baseCache.get(key);
  if (inflight.has(key)) {
    const queued = queuedByKey.get(key);
    if (queued) queued.priority = Math.max(queued.priority, priority);
    return inflight.get(key);
  }
  const promise = (async () => {
    const stored = await getBlob(key).catch(() => null);
    if (stored) return createImageBitmap(stored);
    return schedule(key, async () => {
      const px = await spotPixels(spot);
      const buffer = await paintInWorker(px, month, pinsFor(spot));
      const canvas = document.createElement("canvas");
      canvas.width = px.width;
      canvas.height = px.height;
      canvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(buffer), px.width, px.height), 0, 0);
      canvas.toBlob((blob) => blob && putBlob(key, blob).catch(() => {}), "image/jpeg", 0.9);
      return canvas;
    }, priority);
  })();
  inflight.set(key, promise);
  try {
    const result = await promise;
    if (baseCache.size > 40) baseCache.delete(baseCache.keys().next().value);
    baseCache.set(key, result);
    return result;
  } finally {
    inflight.delete(key);
  }
}

function drawPlants(ctx, W, H, spot, month, { highlight } = {}) {
  const here = state.placements.filter((p) => p.spotId === spot.id);
  for (const p of here.filter((p) => p.status === "existing")) {
    const sp = speciesFor(state, p.speciesId);
    if (sp) paintExistingSeason(ctx, W, H, p, sp, month);
  }
  for (const p of here.filter((p) => p.status === "planned").sort((a, b) => a.y - b.y)) {
    const sp = speciesFor(state, p.speciesId);
    if (!sp) continue;
    ctx.save();
    ctx.filter = "blur(0.35px)";
    paintPlant(ctx, W, H, p, sp, month, spot);
    ctx.restore();
    if (highlight === p.id) ctx.globalAlpha = 1;
  }
}

async function composeScene(spot, month, priority) {
  const base = await getBase(spot, month, priority);
  const canvas = document.createElement("canvas");
  canvas.width = base.width;
  canvas.height = base.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(base, 0, 0);
  drawPlants(ctx, canvas.width, canvas.height, spot, month);
  return canvas;
}

// Small standalone painting of a plant for cards and the swap strip.
function paintThumb(canvas, sp, month) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round((canvas.clientWidth || 96) * dpr), H = Math.round((canvas.clientHeight || 120) * dpr);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fbf7ee";
  ctx.fillRect(0, 0, W, H);
  const grd = ctx.createLinearGradient(0, H * 0.75, 0, H);
  grd.addColorStop(0, "rgba(170,160,120,0)");
  grd.addColorStop(1, "rgba(170,160,120,0.28)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);
  const hEff = sp.form === "climber" ? Math.min(sp.h, 2.2) : sp.h;
  const sEff = sp.form === "climber" ? Math.min(sp.s, 1.6) : sp.s;
  const ppm = Math.min((W * 0.82) / Math.max(sEff, 0.1), (H * 0.8) / Math.max(hEff, 0.1));
  const baseY = 0.92;
  const size = ppm / (W * baseY);
  paintPlant(ctx, W, H, { id: `thumb-${sp.id}`, x: 0.5, y: baseY, size }, sp, month, { horizon: 0, perspective: 1 });
}
function showcaseMonth(sp) {
  if (sp.bloom?.includes(ui.month)) return ui.month;
  if (sp.bloom?.length) return sp.bloom[Math.floor(sp.bloom.length / 2)];
  if (sp.autumn) return 9;
  return ui.month;
}

/* ---------- walk view ---------- */
const currentSpot = () => state.spots.find((s) => s.id === ui.spotId) || state.spots[0];
const view = { s: 1, x: 0, y: 0, baseW: 0, baseH: 0, ox: 0, oy: 0 };
let sceneSize = { w: 0, h: 0 };
let renderToken = 0;

function numbering(spotId) {
  const map = new Map();
  let n = 1;
  for (const status of ["existing", "planned"]) {
    for (const p of state.placements) if (p.spotId === spotId && p.status === status) map.set(p.id, n++);
  }
  return map;
}
const shortName = (sp) => {
  const name = sp.name.replace(/\s*\(.*?\)\s*/g, " ").trim();
  return name.length > 22 ? `${name.slice(0, 20)}…` : name;
};

async function renderWalk({ animateMonth = false } = {}) {
  const spot = currentSpot();
  if (!spot) return;
  const token = ++renderToken;
  renderWalkHeader();
  renderSeasons();
  renderStones();
  const loading = $("#stage-loading");
  if (!baseCache.has(baseKey(spot, ui.month)) && !ui.photo) {
    $("#loading-text").textContent = `Sketching ${MONTHS[ui.month]}…`;
    loading.classList.remove("hidden");
  }
  try {
    let canvas;
    if (ui.photo) {
      const px = await spotPixels(spot);
      canvas = document.createElement("canvas");
      canvas.width = px.width;
      canvas.height = px.height;
      canvas.getContext("2d").putImageData(px, 0, 0);
    } else {
      canvas = await composeScene(spot, ui.month, 10);
    }
    if (token !== renderToken) return;
    const target = $("#scene-canvas");
    if (animateMonth && target.width && !reducedMotion) {
      const fade = $("#fade-canvas");
      fade.width = target.width;
      fade.height = target.height;
      fade.getContext("2d").drawImage(target, 0, 0);
      fade.style.transition = "none";
      fade.style.opacity = "1";
      requestAnimationFrame(() => requestAnimationFrame(() => { fade.style.transition = ""; fade.style.opacity = "0"; }));
    }
    const sizeChanged = target.width !== canvas.width || target.height !== canvas.height;
    target.width = canvas.width;
    target.height = canvas.height;
    target.getContext("2d").drawImage(canvas, 0, 0);
    sceneSize = { w: canvas.width, h: canvas.height };
    if (sizeChanged || !view.baseW) layoutScene();
    renderOverlay();
  } catch (error) {
    console.error(error);
    if (token === renderToken) toast(`Couldn't paint this view: ${error.message}`);
  } finally {
    if (token === renderToken) loading.classList.add("hidden");
  }
  if (!ui.photo) for (let i = 1; i < 12; i += 1) getBase(spot, (ui.month + i) % 12, 1 - i * 0.01).catch(() => {});
}

function renderWalkHeader() {
  const spot = currentSpot();
  $("#spot-name").textContent = spot.name;
  const here = state.placements.filter((p) => p.spotId === spot.id);
  const blooming = here.filter((p) => speciesFor(state, p.speciesId)?.bloom?.includes(ui.month)).length;
  const planned = here.filter((p) => p.status === "planned").length;
  $("#spot-sub").textContent = `${MONTHS[ui.month]} · ${blooming ? `${blooming} in flower` : "nothing in flower"}${planned ? ` · ${planned} planned` : ""}`;
  $("#back-btn").hidden = !ui.history.length;
  $("#edit-toggle").setAttribute("aria-pressed", String(ui.edit));
  $("#stage").classList.toggle("edit", ui.edit);
  $("#labels-toggle").setAttribute("aria-pressed", String(ui.labels));
  $("#compare-toggle").setAttribute("aria-pressed", String(ui.photo));
  updateMonthChip();
}

function updateMonthChip() {
  $("#month-chip").innerHTML = `${ui.playing ? "❚❚" : "▶"} <i style="background:${SEASON_COLORS[ui.month]}"></i>${MONTHS[ui.month]}`;
  $("#month-chip").setAttribute("aria-label", ui.playing ? "Pause the year" : "Play the year");
}

function renderSeasons() {
  const spot = currentSpot();
  const coverage = bloomCoverage(state, spot.id);
  $("#seasons").innerHTML = MON.map((m, i) => `<button class="season-btn${i === ui.month ? " active" : ""}" data-month="${i}" aria-pressed="${i === ui.month}" aria-label="${MONTHS[i]}"><b>${coverage[i] ? "•".repeat(Math.min(3, coverage[i])) : ""}</b>${m}<i style="background:${SEASON_COLORS[i]}"></i></button>`).join("");
}

async function renderStones() {
  const spot = currentSpot();
  const html = await Promise.all(state.spots.map(async (s) => `<button class="stone${s.id === spot.id ? " active" : ""}" data-spot="${s.id}"><img src="${await photoUrl(s.photoId)}" alt="" /><span>${esc(s.name)}</span></button>`));
  $("#stones").innerHTML = `${html.join("")}<button class="stone add" id="add-stone">+ Add a view</button>`;
}

function layoutScene() {
  const stage = $("#stage");
  const sw = stage.clientWidth, sh = stage.clientHeight;
  if (!sceneSize.w || !sw || !sh) return;
  const fit = Math.min(sw / sceneSize.w, sh / sceneSize.h);
  view.baseW = sceneSize.w * fit;
  view.baseH = sceneSize.h * fit;
  view.ox = (sw - view.baseW) / 2;
  view.oy = (sh - view.baseH) / 2;
  const scene = $("#scene");
  scene.style.width = `${view.baseW}px`;
  scene.style.height = `${view.baseH}px`;
  clampView();
  applyView();
}
function clampView() {
  view.s = Math.min(5, Math.max(1, view.s));
  const stage = $("#stage");
  const sw = stage.clientWidth, sh = stage.clientHeight;
  const w = view.baseW * view.s, h = view.baseH * view.s;
  const limit = (offset, size, space, base) => {
    if (size <= space) return (space - size) / 2 - base;
    return Math.min(-base, Math.max(space - size - base, offset));
  };
  view.x = limit(view.x, w, sw, view.ox);
  view.y = limit(view.y, h, sh, view.oy);
}
function applyView() {
  const scene = $("#scene");
  scene.style.transform = `translate(${view.ox + view.x}px, ${view.oy + view.y}px) scale(${view.s})`;
  scene.style.setProperty("--inv", String(1 / view.s));
}
function zoomAt(clientX, clientY, newScale) {
  const rect = $("#stage").getBoundingClientRect();
  const cx = clientX - rect.left, cy = clientY - rect.top;
  const px = (cx - view.ox - view.x) / view.s, py = (cy - view.oy - view.y) / view.s;
  view.s = Math.min(5, Math.max(1, newScale));
  view.x = cx - view.ox - px * view.s;
  view.y = cy - view.oy - py * view.s;
  clampView();
  applyView();
}

function renderOverlay() {
  const spot = currentSpot();
  const overlay = $("#overlay");
  overlay.classList.toggle("no-labels", !ui.labels);
  if (ui.photo) { overlay.innerHTML = ""; return; }
  const nums = numbering(spot.id);
  const pins = state.placements.filter((p) => p.spotId === spot.id).map((p) => {
    const sp = speciesFor(state, p.speciesId);
    if (!sp) return "";
    const cls = `pin ${p.status}${p.status === "existing" && !p.confirmed ? " unconfirmed" : ""}${ui.sheetPlacement === p.id ? " selected" : ""}${p.x > 0.55 ? " flip" : ""}`;
    const y = p.status === "planned" ? p.y - 0.015 : p.y;
    return `<button class="${cls}" data-pin="${p.id}" style="left:${p.x * 100}%;top:${y * 100}%" aria-label="${esc(sp.name)}"><span class="dot">${nums.get(p.id)}</span><span class="tag">${esc(shortName(sp))}</span></button>`;
  });
  const links = (spot.links || []).map((link) => `<button class="hotspot${link.to ? "" : " empty"}" data-link="${link.id}" style="left:${link.x * 100}%;top:${link.y * 100}%" aria-label="${esc(link.to ? `Walk to ${link.label}` : `${link.label}: no photo yet`)}"><span class="ring"><svg viewBox="0 0 24 24">${link.to ? '<path d="m6 15 6-6 6 6"/><path d="m6 20 6-6 6 6" opacity=".45"/>' : '<path d="M12 6v12M6 12h12"/>'}</svg></span><span class="label">${esc(link.label)}</span></button>`);
  const outlines = state.placements.filter((p) => p.spotId === spot.id && p.outline?.length > 2).map((p) =>
    `<polygon class="${p.confirmed ? "" : "unconfirmed"}${ui.sheetPlacement === p.id ? " selected" : ""}" points="${p.outline.map(([x, y]) => `${(x * 1000).toFixed(1)},${(y * 1000).toFixed(1)}`).join(" ")}" />`);
  const draft = ui.draft?.seg?.poly ? `<polygon class="draft" points="${ui.draft.seg.poly.map(([x, y]) => `${(x * 1000).toFixed(1)},${(y * 1000).toFixed(1)}`).join(" ")}" />` : "";
  const svg = `<svg class="outlines" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">${outlines.join("")}${draft}</svg>`;
  overlay.innerHTML = svg + links.join("") + pins.join("");
}

// Which recorded plant (if any) is under this point: outline first, then the pin's circle.
function placementAt(x, y) {
  const spot = currentSpot();
  const aspect = sceneSize.h / Math.max(1, sceneSize.w);
  let best = null, bestArea = Infinity;
  for (const p of state.placements) {
    if (p.spotId !== spot.id || p.status !== "existing") continue;
    let hit = false, area;
    if (p.outline?.length > 2) {
      hit = pointInPoly(x, y, p.outline);
      const b = polyBounds(p.outline);
      area = (b.x1 - b.x0) * (b.y1 - b.y0);
    } else {
      const r = p.r || 0.05;
      hit = Math.hypot(x - p.x, (y - p.y) * aspect) < r * 0.8;
      area = r * r;
    }
    if (hit && area < bestArea) { best = p; bestArea = area; }
  }
  return best;
}

function sceneRel(event) {
  const rect = $("#scene").getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
}

function setupStageGestures() {
  const stage = $("#stage");
  const pointers = new Map();
  let gesture = null;
  let lastTap = 0;
  let drawing = null;
  stage.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".pin, .hotspot, .round-tool, .banner")) return;
    stage.setPointerCapture(event.pointerId);
    if (ui.mode?.type === "draw") { drawing = [sceneRel(event)]; ui.draft = { seg: { poly: [] } }; return; }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) gesture = { type: "pan", sx: event.clientX, sy: event.clientY, vx: view.x, vy: view.y, moved: false };
    else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = { type: "pinch", dist: Math.hypot(a.x - b.x, a.y - b.y), s: view.s, moved: true };
    }
  });
  stage.addEventListener("pointermove", (event) => {
    if (drawing) {
      const pt = sceneRel(event);
      const last = drawing[drawing.length - 1];
      if (Math.hypot(pt.x - last.x, pt.y - last.y) > 0.006) {
        drawing.push(pt);
        ui.draft.seg.poly = drawing.map(({ x, y }) => [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]);
        renderOverlay();
      }
      return;
    }
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture.type === "pan") {
      const dx = event.clientX - gesture.sx, dy = event.clientY - gesture.sy;
      if (Math.hypot(dx, dy) > 8) gesture.moved = true;
      if (gesture.moved && view.s > 1) { view.x = gesture.vx + dx; view.y = gesture.vy + dy; clampView(); applyView(); }
    } else if (gesture.type === "pinch" && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, gesture.s * (Math.hypot(a.x - b.x, a.y - b.y) / gesture.dist));
    }
  });
  const end = (event) => {
    if (drawing) { finishDrawing(drawing); drawing = null; return; }
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (gesture?.type === "pan" && !gesture.moved && event.type === "pointerup") {
      const now = Date.now();
      if (now - lastTap < 300 && !ui.mode && !ui.edit) { zoomAt(event.clientX, event.clientY, view.s > 1.5 ? 1 : 2.5); lastTap = 0; }
      else { lastTap = now; handleStageTap(event); }
    }
    if (pointers.size === 0) gesture = null;
    else if (pointers.size === 1 && gesture?.type === "pinch") {
      const [p] = [...pointers.values()];
      gesture = { type: "pan", sx: p.x, sy: p.y, vx: view.x, vy: view.y, moved: true };
    }
  };
  stage.addEventListener("pointerup", end);
  stage.addEventListener("pointercancel", end);
  stage.addEventListener("wheel", (event) => { event.preventDefault(); zoomAt(event.clientX, event.clientY, view.s * (event.deltaY < 0 ? 1.15 : 0.87)); }, { passive: false });
}

function handleStageTap(event) {
  const { x, y } = sceneRel(event);
  if (x < 0 || x > 1 || y < 0 || y > 1) return;
  if (ui.mode) { placeAt(x, y); return; }
  if (ui.edit) { openHereSheet(x, y); return; }
  const hit = placementAt(x, y);
  if (hit) { openPlacementSheet(hit.id); return; }
  outlineAt(x, y);
}

/* ---------- tap a plant: outline it, then tag it ---------- */
async function outlineAt(x, y, looseness = 1) {
  const spot = currentSpot();
  try {
    const px = await spotPixels(spot);
    const seg = segmentAt(px, x, y, looseness);
    if (!seg) { toast("Couldn't find a plant there. Try tapping its middle, or draw it."); return; }
    ui.draft = { x, y, looseness, seg, spotId: spot.id };
    renderOverlay();
    openTagSheet();
  } catch (error) {
    console.error(error);
    toast(`Outline failed: ${error.message}`);
  }
}

function finishDrawing(points) {
  const target = ui.mode?.placementId;
  setMode(null);
  if (points.length < 6) { ui.draft = null; renderOverlay(); toast("Draw all the way round the plant"); return; }
  const poly = points.map(({ x, y }) => [+Math.min(1, Math.max(0, x)).toFixed(4), +Math.min(1, Math.max(0, y)).toFixed(4)]);
  let area = 0, cx = 0, cy = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const c = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    area += c; cx += (poly[j][0] + poly[i][0]) * c; cy += (poly[j][1] + poly[i][1]) * c;
  }
  area /= 2;
  const seg = Math.abs(area) > 1e-5 ? { poly, cx: cx / (6 * area), cy: cy / (6 * area), area: Math.abs(area), r: Math.sqrt(Math.abs(area) / Math.PI) } : null;
  if (!seg) { ui.draft = null; renderOverlay(); return; }
  if (target) {
    const p = state.placements.find((item) => item.id === target);
    Object.assign(p, { outline: seg.poly, x: seg.cx, y: seg.cy, r: seg.r });
    ui.draft = null;
    save(); renderWalk(); openPlacementSheet(p.id);
    return;
  }
  ui.draft = { x: seg.cx, y: seg.cy, looseness: 1, seg, spotId: currentSpot().id, drawn: true };
  renderOverlay();
  openTagSheet();
}

function discardDraft() {
  ui.draft = null;
  renderOverlay();
}

function tagDraftAs(speciesId, confirmed = true) {
  const d = ui.draft;
  if (!d) return;
  const p = { id: uid("pl"), spotId: d.spotId, speciesId, status: "existing", x: d.seg.cx, y: d.seg.cy, r: d.seg.r, outline: d.seg.poly, confirmed, photos: [] };
  if (d.photoKey) p.photos.push({ id: d.photoKey, date: new Date().toISOString().slice(0, 10) });
  state.placements.push(p);
  ui.draft = null;
  save();
  renderWalk();
  openPlacementSheet(p.id);
  toast(`${speciesFor(state, speciesId)?.name || "Plant"} tagged`);
}

function plantResults(q) {
  const list = searchPlants(q, Object.values(state.species).filter((sp) => sp.source !== "claude-idea"), 8);
  return list.map((sp) => `<button class="choice" data-sp="${esc(sp.id)}"><span style="width:14px;height:14px;border-radius:50%;flex:none;background:${esc(sp.flower || sp.foliage)}"></span><span><strong>${esc(sp.name)}</strong><small><em>${esc(sp.latin)}</em> · ${esc(SOURCE_LABEL[sp.source] || sp.type || "")}${sp.bloom?.length ? ` · ${monthRange(sp.bloom)}` : ""}</small></span></button>`).join("")
    || `<p class="muted">No match in the UK list. You can add it by name.</p>`;
}

function openTagSheet() {
  const d = ui.draft;
  sheet.classList.add("compact");
  openSheet(`<p class="eyebrow">New plant</p><h2>What's this plant?</h2>
    <div class="outline-tools">
      <span class="muted">Outline</span>
      ${d.drawn ? "" : `<button class="btn small" data-o="tighter">Tighter</button><button class="btn small" data-o="looser">Looser</button>`}
      <button class="btn small" data-o="draw">Draw it myself</button>
    </div>
    <div class="stack">
      <input type="search" id="tag-q" placeholder="Type a name, e.g. hawthorn, lavender, Acer" autocomplete="off" />
      <div class="choice-list" id="tag-results" style="margin:0"></div>
      <div class="sheet-actions" style="margin-top:4px">
        <button class="btn small dark" id="tag-identify">Identify from this photo</button>
        <button class="btn small" id="tag-closeup">Take a close-up</button>
        <button class="btn small" id="tag-custom">Add by name</button>
        <button class="btn small ghost" id="tag-unsure">Not sure yet</button>
      </div>
    </div>`, (body) => {
    const results = body.querySelector("#tag-results");
    const bind = () => results.querySelectorAll("[data-sp]").forEach((btn) => btn.addEventListener("click", () => tagDraftAs(btn.dataset.sp)));
    const q = body.querySelector("#tag-q");
    q.addEventListener("input", () => { results.innerHTML = q.value.trim() ? plantResults(q.value) : ""; bind(); });
    body.querySelectorAll("[data-o]").forEach((btn) => btn.addEventListener("click", () => {
      const o = btn.dataset.o;
      if (o === "draw") { closeSheetKeepDraft(); setMode({ type: "draw" }, "Trace round the plant with your finger"); return; }
      outlineAt(d.x, d.y, d.looseness * (o === "tighter" ? 0.75 : 1.35));
    }));
    body.querySelector("#tag-identify").addEventListener("click", async () => {
      const crop = await cropFromView(currentSpot(), d.seg.poly);
      identifyFromBlob(crop, (id) => tagDraftAs(id), { onNone: () => openTagSheet() });
    });
    body.querySelector("#tag-closeup").addEventListener("click", async () => {
      const blob = await pickPhoto();
      if (!blob) return;
      identifyFromBlob(blob, (id) => tagDraftAs(id), { keepPhoto: true, onNone: () => openTagSheet() });
    });
    body.querySelector("#tag-custom").addEventListener("click", () => customSpeciesForm((id) => tagDraftAs(id), { name: q.value.trim() }));
    body.querySelector("#tag-unsure").addEventListener("click", () => {
      const sp = normalizeSpecies({ name: "Unidentified plant", habit: "deciduous", form: "mound", h: 1, note: "Tagged without a name. Add a close-up when it's in leaf or flower to identify it." }, "custom");
      state.species[sp.id] = sp;
      tagDraftAs(sp.id, false);
    });
  });
}

function closeSheetKeepDraft() {
  if (sheet.open) sheet.close();
}

// Crop the outlined area (with a margin) from the full-resolution photo, for identification.
async function cropFromView(spot, poly) {
  const blob = await getBlob(spot.photoId);
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const b = poly?.length ? polyBounds(poly) : { x0: 0, y0: 0, x1: 1, y1: 1 };
  const padX = (b.x1 - b.x0) * 0.15 + 0.02, padY = (b.y1 - b.y0) * 0.15 + 0.02;
  const x0 = Math.max(0, b.x0 - padX) * bitmap.width, y0 = Math.max(0, b.y0 - padY) * bitmap.height;
  const x1 = Math.min(1, b.x1 + padX) * bitmap.width, y1 = Math.min(1, b.y1 + padY) * bitmap.height;
  const scale = Math.min(1, 1400 / Math.max(x1 - x0, y1 - y0));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((x1 - x0) * scale));
  canvas.height = Math.max(1, Math.round((y1 - y0) * scale));
  canvas.getContext("2d").drawImage(bitmap, x0, y0, x1 - x0, y1 - y0, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}

function setMode(mode, message) {
  ui.mode = mode;
  const banner = $("#banner");
  if (!mode) { banner.hidden = true; return; }
  banner.innerHTML = `<span>${esc(message)}</span><button id="banner-cancel">Cancel</button>`;
  banner.hidden = false;
  $("#banner-cancel").onclick = () => { if (ui.mode?.type === "draw") discardDraft(); setMode(null); };
}

function placeAt(x, y) {
  const mode = ui.mode;
  if (mode.type === "draw") return;
  const spot = currentSpot();
  let placement;
  if (mode.type === "move") {
    placement = state.placements.find((p) => p.id === mode.id);
    if (placement) { placement.x = x; placement.y = y; placement.spotId = spot.id; }
  } else if (mode.type === "place") {
    placement = { id: uid("pl"), spotId: spot.id, speciesId: mode.speciesId, status: mode.status || "planned", x, y, r: 0.06, size: 1, confirmed: true };
    state.placements.push(placement);
  } else if (mode.type === "link") {
    spot.links.push({ id: uid("link"), x, y, to: mode.to || null, label: mode.label || "Somewhere else" });
  }
  setMode(null);
  save();
  renderWalk();
  if (placement) openPlacementSheet(placement.id);
}

async function goToSpot(id, origin = null, { pushHistory = true } = {}) {
  if (id === ui.spotId) return;
  const target = state.spots.find((s) => s.id === id);
  if (!target) return;
  if (ui.view !== "walk") switchView("walk");
  closeSheet();
  const scene = $("#scene");
  const prep = composeScene(target, ui.month, 10).catch(() => null);
  if (origin && !reducedMotion && view.baseW) {
    const s0 = view.s, s1 = s0 * 2.8;
    const px = origin.x * view.baseW, py = origin.y * view.baseH;
    view.x = view.x + px * s0 - px * s1;
    view.y = view.y + py * s0 - py * s1;
    view.s = s1;
    scene.classList.add("leaving");
    scene.style.transform = `translate(${view.ox + view.x}px, ${view.oy + view.y}px) scale(${view.s})`;
    await Promise.all([wait(600), prep]);
  }
  if (pushHistory) ui.history.push(ui.spotId);
  ui.spotId = id;
  view.s = 1; view.x = 0; view.y = 0;
  scene.classList.remove("leaving");
  persistUi();
  await renderWalk();
  layoutScene();
  if (!reducedMotion) { scene.classList.add("arriving"); setTimeout(() => scene.classList.remove("arriving"), 650); }
}

/* ---------- placement sheet ---------- */
function describeNow(sp, month) {
  const st = plantState(sp, month);
  const name = MONTHS[month];
  if (sp.habit === "bulb" && st.leaf <= 0) return `${name}: resting below ground`;
  if (st.flowering) return `${name}: in flower`;
  if (st.fruit) return `${name}: covered in fruit`;
  if (st.bare && st.stems) return `${name}: bare, with glowing stems`;
  if (st.bare) return sp.habit === "herbaceous" ? `${name}: died back for winter` : `${name}: bare branches`;
  if (sp.autumn && (month === 9 || month === 10)) return `${name}: autumn colour`;
  if (st.leaf < 0.5) return `${name}: just waking up`;
  return `${name}: in leaf`;
}
function miniCalendar(sp) {
  return `<div class="mini-cal">${MON.map((m, i) => {
    const st = plantState(sp, i);
    const bg = st.flowering ? sp.flower : st.leaf > 0.5 ? "#c9d4b5" : st.stems ? sp.stems : "";
    return `<div class="${i === ui.month ? "now" : ""}" style="${bg ? `background:${bg}` : ""}" title="${MONTHS[i]}">${m[0]}</div>`;
  }).join("")}</div>`;
}
function factChips(sp) {
  const facts = [`${sp.h}m × ${sp.s}m`, `RHS H${sp.rhs}`, sp.sun.map((s) => ({ full: "Sun", part: "Part shade", shade: "Shade" })[s]).join(" / "), { evergreen: "Evergreen", semi: "Semi-evergreen", deciduous: "Deciduous", herbaceous: "Dies back in winter", bulb: "Bulb" }[sp.habit]];
  if (sp.wildlife) facts.push("Pollinators");
  if (sp.scent) facts.push("Scented");
  if (sp.source?.startsWith("claude")) facts.push("Claude");
  return facts.map((f) => `<span class="fact${f === "Claude" ? " claude" : ""}">${esc(f)}</span>`).join("");
}

function openPlacementSheet(id, { scrollToSwap = false } = {}) {
  const p = state.placements.find((item) => item.id === id);
  if (!p) return;
  const sp = speciesFor(state, p.speciesId);
  const spot = state.spots.find((s) => s.id === p.spotId);
  const area = nearestArea(spot, p.x, p.y);
  ui.sheetPlacement = id;
  document.querySelectorAll(".pin").forEach((pin) => pin.classList.toggle("selected", pin.dataset.pin === id));
  const fit = area ? fitsConditions(sp, area, state.settings) : { ok: true };
  const planned = p.status === "planned";
  const alternatives = planned && area ? recommendFor(state, spot, area, { limit: 10, exclude: [sp.id], likeOf: sp }) : [];
  const statusChip = planned ? `<span class="status planned">Planned · ${esc(area?.name || "")}</span>` : `<span class="status">${p.confirmed ? "Growing here" : "Growing here · ID to confirm"}</span>`;
  const swap = planned ? `<div class="sheet-section" id="swap-section"><h3>Swap for something else in this spot</h3>${alternatives.length ? `<div class="swap-strip"><button class="swap-card current" disabled><canvas data-thumb="${esc(sp.id)}"></canvas><strong>${esc(sp.name)}</strong><small>Current</small></button>${alternatives.map(({ sp: alt }) => `<button class="swap-card" data-swap="${esc(alt.id)}"><canvas data-thumb="${esc(alt.id)}"></canvas><strong>${esc(alt.name)}</strong><small>${esc(alt.bloom.length ? monthRange(alt.bloom) : alt.habit)} · ${alt.h}m</small></button>`).join("")}</div>` : `<p class="muted">No close alternatives in the catalogue for these conditions.</p>`}</div>
    <div class="sheet-section"><h3>Size shown</h3><div class="size-row"><small>Young</small><input type="range" min="0.35" max="1.3" step="0.05" value="${p.size || 1}" id="size-range" aria-label="Plant size" /><small>Mature</small></div></div>` : "";
  const actions = planned
    ? `<button class="btn small" data-act="move">Move</button><button class="btn small" data-act="planted">I've planted it</button><button class="btn small ghost" data-act="remove">Remove</button>`
    : `<button class="btn small dark" data-act="identify">Identify from a close-up</button>${p.outline ? `<button class="btn small" data-act="identify-view">Identify from this photo</button>` : ""}<button class="btn small" data-act="choose">Change plant</button>${p.confirmed ? "" : `<button class="btn small" data-act="confirm">That's right</button>`}${needsDetails(sp) ? `<button class="btn small" data-act="details">Fill in details</button>` : ""}<button class="btn small" data-act="redraw">${p.outline ? "Redraw outline" : "Draw outline"}</button><button class="btn small ghost" data-act="remove">Remove</button>`;
  openSheet(`
    ${statusChip}
    <h2 style="margin-top:8px">${esc(sp.name)}</h2>
    <p class="latin">${esc(sp.latin)}</p>
    <div class="now-line">${esc(describeNow(sp, ui.month))}</div>
    <div class="sheet-section"><h3>Through the year</h3>${miniCalendar(sp)}</div>
    <div class="sheet-section"><div class="rec facts" style="display:flex;padding:0;border:0;background:none">${factChips(sp)}</div></div>
    ${!fit.ok ? `<div class="note-box" style="background:#f6e2d6">Watch out: ${esc(fit.why)} (${esc(area.name)}).</div>` : ""}
    ${sp.note ? `<div class="note-box" style="margin-top:10px">${esc(sp.note)}</div>` : ""}
    ${swap}
    <div class="sheet-actions">${actions}</div>`, (body) => {
    body.querySelectorAll("canvas[data-thumb]").forEach((canvas) => { const s = speciesFor(state, canvas.dataset.thumb); if (s) paintThumb(canvas, s, showcaseMonth(s)); });
    body.querySelectorAll("[data-swap]").forEach((btn) => btn.addEventListener("click", () => {
      p.speciesId = btn.dataset.swap;
      save();
      renderWalk();
      openPlacementSheet(p.id, { scrollToSwap: true });
      toast(`Swapped in ${speciesFor(state, p.speciesId).name}`);
    }));
    const range = body.querySelector("#size-range");
    range?.addEventListener("input", () => { p.size = Number(range.value); save(); renderWalk(); });
    body.querySelectorAll("[data-act]").forEach((btn) => btn.addEventListener("click", () => placementAction(p, btn.dataset.act)));
    if (scrollToSwap) body.querySelector("#swap-section")?.scrollIntoView({ block: "nearest" });
  });
}

function placementAction(p, act) {
  const sp = speciesFor(state, p.speciesId);
  if (act === "move") {
    closeSheet();
    if (ui.view !== "walk") switchView("walk");
    setMode({ type: "move", id: p.id }, `Tap where ${sp.name} should go`);
  } else if (act === "remove") {
    if (!confirm(`Remove ${sp.name} from this view?`)) return;
    state.placements = state.placements.filter((item) => item.id !== p.id);
    save(); closeSheet(); renderWalk(); refreshCurrentView();
  } else if (act === "planted") {
    const spot = state.spots.find((s) => s.id === p.spotId);
    const ppm = (spot.perspective ?? 0.67) * Math.max(0.018, p.y - (spot.horizon ?? 0.36)) * (p.size || 1);
    p.status = "existing"; p.confirmed = true;
    p.r = Math.max(0.03, (sp.s * ppm) / 2);
    p.y = p.y - Math.min(sp.h, 2) * ppm * 0.4;
    p.plantedOn = new Date().toISOString().slice(0, 10);
    save(); renderWalk(); openPlacementSheet(p.id);
    toast("Moved into the garden record. Take a new photo when it settles in.");
  } else if (act === "confirm") {
    p.confirmed = true; save(); renderOverlay(); openPlacementSheet(p.id);
  } else if (act === "choose") {
    pickSpecies({ title: "What is it?", onPick: (id) => { p.speciesId = id; p.confirmed = true; save(); renderWalk(); openPlacementSheet(p.id); } });
  } else if (act === "identify") {
    identifyFlow((id) => { p.speciesId = id; p.confirmed = true; save(); renderWalk(); openPlacementSheet(p.id); }, p);
  } else if (act === "identify-view") {
    cropFromView(state.spots.find((s) => s.id === p.spotId), p.outline).then((crop) => identifyFromBlob(crop, (id) => { p.speciesId = id; p.confirmed = true; save(); renderWalk(); openPlacementSheet(p.id); }));
  } else if (act === "redraw") {
    closeSheet();
    if (ui.view !== "walk") switchView("walk");
    setMode({ type: "draw", placementId: p.id }, `Trace round the ${sp.name} with your finger`);
  } else if (act === "details") {
    fillInDetails(p);
  }
}

const needsDetails = (sp) => sp && (sp.source === "uk-native" || (!sp.bloom?.length && sp.source === "custom"));

async function fillInDetails(p) {
  const sp = speciesFor(state, p.speciesId);
  if (!apiKey) { toast("Add your Claude API key in Settings to fill in details"); openSettings(); return; }
  openSheet(`<h2>Looking up ${esc(sp.name)}…</h2><p class="muted">Getting flowering time, colours, size and growing conditions.</p><div class="brush" style="margin:20px auto"></div>`);
  try {
    const details = await ai.describeSpecies(apiKey, sp.name, sp.latin, gardenContext());
    const full = normalizeSpecies({ ...details, name: details.name || sp.name, latin: details.latin || sp.latin }, "claude-details");
    if (sp.nativeStatus) full.nativeStatus = sp.nativeStatus;
    state.species[full.id] = full;
    state.placements.filter((item) => item.speciesId === sp.id).forEach((item) => { item.speciesId = full.id; });
    save(); renderWalk(); openPlacementSheet(p.id);
  } catch (error) {
    console.error(error);
    openSheet(`<h2>Couldn't fill in details</h2><p class="muted">${esc(error.message)}</p>`);
  }
}

/* ---------- edit: tap on the scene ---------- */
function openHereSheet(x, y) {
  const spot = currentSpot();
  const area = nearestArea(spot, x, y);
  const recs = area ? recommendFor(state, spot, area, { limit: 10 }) : [];
  openSheet(`
    <p class="eyebrow">${esc(area ? area.name : "This spot")}</p>
    <h2>What's here?</h2>
    ${area ? `<p class="muted">${esc(describeConditions(area, state.settings))}</p>` : ""}
    <div class="sheet-section"><h3>Plan something new here</h3>
      ${recs.length ? `<div class="swap-strip">${recs.map(({ sp }) => `<button class="swap-card" data-place="${esc(sp.id)}"><canvas data-thumb="${esc(sp.id)}"></canvas><strong>${esc(sp.name)}</strong><small>${esc(sp.bloom.length ? monthRange(sp.bloom) : sp.habit)} · ${sp.h}m</small></button>`).join("")}</div>` : `<p class="muted">Set this area's light and moisture in Plan to see ideas.</p>`}
      <button class="btn small" data-here="any">Choose any plant…</button>
    </div>
    <div class="choice-list">
      <button class="choice" data-here="existing"><svg viewBox="0 0 24 24"><path d="M12 21v-8m0 3c-4.5 0-7-2.5-7-7.5 4.5 0 7 2.5 7 7.5Zm0-3c0-4.5 2.5-7 7-7 0 4.5-2.5 7-7 7Z"/></svg><span><strong>Tag a plant that's already here</strong><small>Identify it from a photo or pick it from the list</small></span></button>
      <button class="choice" data-here="link"><svg viewBox="0 0 24 24"><path d="M5 19 19 5m0 0h-8m8 0v8"/></svg><span><strong>Make a path to another view from here</strong><small>Walk on to a close-up of this corner</small></span></button>
      <button class="choice" data-here="area"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg><span><strong>${area ? "Adjust this area's conditions" : "Mark an area here"}</strong><small>Light, moisture and space shape every recommendation</small></span></button>
    </div>`, (body) => {
    body.querySelectorAll("canvas[data-thumb]").forEach((canvas) => { const s = speciesFor(state, canvas.dataset.thumb); if (s) paintThumb(canvas, s, showcaseMonth(s)); });
    body.querySelectorAll("[data-place]").forEach((btn) => btn.addEventListener("click", () => { ui.mode = { type: "place", speciesId: btn.dataset.place, status: "planned" }; closeSheet(); placeAt(x, y); }));
    body.querySelector('[data-here="any"]').addEventListener("click", () => pickSpecies({ title: "Plan which plant?", onPick: (id) => { ui.mode = { type: "place", speciesId: id, status: "planned" }; closeSheet(); placeAt(x, y); } }));
    body.querySelector('[data-here="existing"]').addEventListener("click", () => pickSpecies({
      title: "What's growing here?",
      identify: true,
      onPick: (id) => { ui.mode = { type: "place", speciesId: id, status: "existing" }; closeSheet(); placeAt(x, y); }
    }));
    body.querySelector('[data-here="link"]').addEventListener("click", () => openLinkTargetSheet(x, y));
    body.querySelector('[data-here="area"]').addEventListener("click", () => openAreaSheet(area, x, y));
  });
}

function openLinkTargetSheet(x, y) {
  const spot = currentSpot();
  const others = state.spots.filter((s) => s.id !== spot.id);
  openSheet(`<h2>Where does this lead?</h2>
    <div class="choice-list">
      <button class="choice" data-new><svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/></svg><span><strong>A new photo from there</strong><small>Stand at that spot and take a photo looking into it</small></span></button>
      ${others.map((s) => `<button class="choice" data-to="${s.id}"><svg viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></svg><span><strong>${esc(s.name)}</strong><small>An existing view</small></span></button>`).join("")}
    </div>`, (body) => {
    body.querySelector("[data-new]").addEventListener("click", async () => {
      const label = await askText("Name this place", "e.g. The bench under the arch");
      if (!label) return;
      const link = { id: uid("link"), x, y, to: null, label };
      spot.links.push(link);
      save();
      renderOverlay();
      newView({ fromSpot: spot, fromLink: link });
    });
    body.querySelectorAll("[data-to]").forEach((btn) => btn.addEventListener("click", () => {
      const to = state.spots.find((s) => s.id === btn.dataset.to);
      spot.links.push({ id: uid("link"), x, y, to: to.id, label: to.name });
      save(); closeSheet(); renderOverlay();
    }));
  });
}

function openLinkSheet(link) {
  const spot = currentSpot();
  openSheet(`<p class="eyebrow">Path</p><h2>${esc(link.label)}</h2>
    ${link.to ? `<p class="muted">Leads to "${esc(state.spots.find((s) => s.id === link.to)?.name)}".</p>` : `<p class="muted">There's no photo from here yet. Stand at this spot, look into the corner, and take one: it becomes the next step of your walk.</p>`}
    <div class="sheet-actions">
      ${link.to ? `<button class="btn small dark" data-act="go">Walk there</button>` : `<button class="btn small dark" data-act="photo">Take the photo</button>`}
      <button class="btn small" data-act="rename">Rename</button>
      <button class="btn small" data-act="move">Move</button>
      <button class="btn small ghost" data-act="remove">Remove path</button>
    </div>`, (body) => {
    body.querySelectorAll("[data-act]").forEach((btn) => btn.addEventListener("click", async () => {
      const act = btn.dataset.act;
      if (act === "go") goToSpot(link.to, link);
      if (act === "photo") newView({ fromSpot: spot, fromLink: link });
      if (act === "rename") { const name = await askText("Rename path", link.label, link.label); if (name) { link.label = name; save(); renderOverlay(); openLinkSheet(link); } }
      if (act === "move") { closeSheet(); spot.links = spot.links.filter((l) => l.id !== link.id); setMode({ type: "link", to: link.to, label: link.label }, "Tap where this path should start"); }
      if (act === "remove") { spot.links = spot.links.filter((l) => l.id !== link.id); save(); closeSheet(); renderOverlay(); }
    }));
  });
}

function openAreaSheet(area, x, y) {
  const spot = currentSpot();
  const isNew = !area;
  const a = area || { id: uid("area"), name: "", x, y, light: "part", moist: "moist", maxH: 2.5, climbers: false, note: "" };
  const opt = (map, value) => Object.entries(map).map(([k, v]) => `<option value="${k}"${k === value ? " selected" : ""}>${v}</option>`).join("");
  openSheet(`<h2>${isNew ? "New area" : "This area"}</h2>
    <div class="stack">
      <label class="field">Name<input type="text" id="area-name" value="${esc(a.name)}" placeholder="e.g. Shady corner by the shed" /></label>
      <div class="field-row">
        <label class="field">Sun it gets<select id="area-light">${opt(LIGHT_LABEL, a.light)}</select></label>
        <label class="field">Soil moisture<select id="area-moist">${opt(MOIST_LABEL, a.moist)}</select></label>
      </div>
      <div class="field-row">
        <label class="field">Max plant height (m)<input type="text" inputmode="decimal" id="area-maxh" value="${a.maxH ?? ""}" /></label>
        <label class="field">Fence or structure?<select id="area-climb"><option value="no">No climbers</option><option value="yes"${a.climbers ? " selected" : ""}>Yes, climbers OK</option></select></label>
      </div>
      <label class="field">Notes<input type="text" id="area-note" value="${esc(a.note)}" /></label>
      <p class="muted">Not sure about sun? Check the spot at 10am, 1pm and 4pm on a sunny day and count the hours it's in direct sun.</p>
      <div class="sheet-actions"><button class="btn dark" id="area-save">Save area</button>${!isNew && spot.areas.length > 1 ? `<button class="btn ghost" id="area-del">Delete</button>` : ""}</div>
    </div>`, (body) => {
    body.querySelector("#area-save").addEventListener("click", () => {
      a.name = body.querySelector("#area-name").value.trim() || "Unnamed area";
      a.light = body.querySelector("#area-light").value;
      a.moist = body.querySelector("#area-moist").value;
      a.maxH = Number(body.querySelector("#area-maxh").value) || 2.5;
      a.climbers = body.querySelector("#area-climb").value === "yes";
      a.note = body.querySelector("#area-note").value.trim();
      if (isNew) spot.areas.push(a);
      ui.areaId = a.id;
      save(); closeSheet(); refreshCurrentView();
      toast("Area saved. Recommendations updated.");
    });
    body.querySelector("#area-del")?.addEventListener("click", () => { spot.areas = spot.areas.filter((item) => item.id !== a.id); save(); closeSheet(); refreshCurrentView(); });
  });
}

function askText(title, placeholder, value = "") {
  return new Promise((resolve) => {
    openSheet(`<h2>${esc(title)}</h2><div class="stack"><input type="text" id="ask-text" placeholder="${esc(placeholder)}" value="${esc(value)}" /><div class="sheet-actions"><button class="btn dark" id="ask-ok">Save</button></div></div>`, (body) => {
      const input = body.querySelector("#ask-text");
      setTimeout(() => input.focus(), 50);
      const ok = () => { const v = input.value.trim(); closeSheet(); resolve(v); };
      body.querySelector("#ask-ok").addEventListener("click", ok);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") ok(); });
    });
  });
}

/* ---------- species picking & identification ---------- */
function pickSpecies({ title, onPick, identify = true }) {
  const render = (q) => plantResults(q);
  openSheet(`<h2>${esc(title)}</h2>
    <div class="stack">
      ${identify ? `<button class="btn dark" id="pick-identify"><svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/></svg>Identify from a photo</button>` : ""}
      <input type="search" id="pick-q" placeholder="Search plants" />
      <div class="choice-list" id="pick-list" style="margin:0">${render("")}</div>
      <button class="btn" id="pick-custom">Not listed? Add by name</button>
    </div>`, (body) => {
    const bindList = () => body.querySelectorAll("[data-sp]").forEach((btn) => btn.addEventListener("click", () => onPick(btn.dataset.sp)));
    bindList();
    body.querySelector("#pick-q").addEventListener("input", (e) => { body.querySelector("#pick-list").innerHTML = render(e.target.value.trim()); bindList(); });
    body.querySelector("#pick-identify")?.addEventListener("click", () => identifyFlow(onPick));
    body.querySelector("#pick-custom").addEventListener("click", () => customSpeciesForm(onPick, { name: body.querySelector("#pick-q").value.trim() }));
  });
}

function customSpeciesForm(onPick, preset = {}) {
  const months = new Set(preset.bloom || []);
  const opt = (pairs, value) => pairs.map(([k, v]) => `<option value="${k}"${k === value ? " selected" : ""}>${v}</option>`).join("");
  openSheet(`<h2>Add a plant</h2>
    <div class="stack">
      <label class="field">Name<input type="text" id="cs-name" value="${esc(preset.name || "")}" placeholder="e.g. Rose by the back door" /></label>
      <div class="field-row">
        <label class="field">Type<select id="cs-habit">${opt([["deciduous", "Shrub/tree, loses leaves"], ["evergreen", "Evergreen"], ["herbaceous", "Perennial, dies back"], ["bulb", "Bulb"], ["semi", "Semi-evergreen"]], preset.habit || "deciduous")}</select></label>
        <label class="field">Shape<select id="cs-form">${opt([["mound", "Rounded"], ["upright", "Upright"], ["tree", "Tree"], ["grass", "Grassy"], ["spiky", "Spiky leaves"], ["climber", "Climber"], ["ground", "Ground cover"], ["fern", "Fern"], ["column", "Column"]], preset.form || "mound")}</select></label>
      </div>
      <div class="field-row">
        <label class="field">Height (m)<input type="text" inputmode="decimal" id="cs-h" value="${preset.h || 1}" /></label>
        <label class="field">Flower colour<input type="color" id="cs-flower" value="${preset.flower || "#d9a0c0"}" style="height:44px;width:100%;border:1px solid var(--line);border-radius:10px;background:#fffdf8" /></label>
      </div>
      <div><p class="eyebrow" style="margin-bottom:6px">Flowers in</p><div class="month-toggles">${MON.map((m, i) => `<button type="button" data-m="${i}" aria-pressed="${months.has(i)}">${m}</button>`).join("")}</div></div>
      <button class="btn dark" id="cs-save">Save plant</button>
    </div>`, (body) => {
    body.querySelectorAll("[data-m]").forEach((btn) => btn.addEventListener("click", () => {
      const m = Number(btn.dataset.m);
      months.has(m) ? months.delete(m) : months.add(m);
      btn.setAttribute("aria-pressed", String(months.has(m)));
    }));
    body.querySelector("#cs-save").addEventListener("click", () => {
      const name = body.querySelector("#cs-name").value.trim();
      if (!name) { toast("Give it a name"); return; }
      const h = Math.max(0.05, Number(body.querySelector("#cs-h").value) || 1);
      const sp = normalizeSpecies({ name, latin: "", habit: body.querySelector("#cs-habit").value, form: body.querySelector("#cs-form").value, h, s: h * 0.8, bloom: [...months], flower: months.size ? body.querySelector("#cs-flower").value : "", note: "" }, "custom");
      state.species[sp.id] = sp;
      save();
      onPick(sp.id);
    });
  });
}

function normalizeSpecies(o, source) {
  const hex = (v) => (/^#[0-9a-f]{6}$/i.test(v || "") ? v : null);
  const arr = (v, allowed) => (Array.isArray(v) ? v.filter((x) => allowed.includes(x)) : []);
  const sun = arr(o.sun, ["full", "part", "shade"]);
  const soil = arr(o.soil, ["clay", "loam", "sand", "chalk"]);
  const moist = arr(o.moist, ["dry", "moist", "wet"]);
  return {
    id: uid(source === "claude-idea" ? "idea" : "sp"),
    name: String(o.name || "Unknown plant").slice(0, 80),
    latin: String(o.latin || "").slice(0, 100),
    type: o.type || "",
    habit: ["evergreen", "semi", "deciduous", "herbaceous", "bulb"].includes(o.habit) ? o.habit : "deciduous",
    form: ["mound", "upright", "airy", "spire", "spiky", "grass", "ground", "fern", "tree", "column", "ball", "climber", "bulbs"].includes(o.form) ? o.form : "mound",
    h: Math.min(30, Math.max(0.05, Number(o.h) || 1)),
    s: Math.min(25, Math.max(0.05, Number(o.s) || Number(o.h) * 0.8 || 0.8)),
    rhs: Math.min(7, Math.max(1, Math.round(Number(o.rhs) || 5))),
    sun: sun.length ? sun : ["full", "part", "shade"],
    soil: soil.length ? soil : ["clay", "loam", "sand", "chalk"],
    moist: moist.length ? moist : ["dry", "moist", "wet"],
    bloom: [...new Set((o.bloom || []).map(Number).filter((m) => Number.isInteger(m) && m >= 0 && m <= 11))],
    flower: hex(o.flower),
    foliage: hex(o.foliage) || "#5f7d45",
    autumn: hex(o.autumn),
    stems: null, fruit: null, leaves: null,
    wildlife: false, scent: false,
    note: String(o.why ? `${o.why} ${o.note || ""}` : o.note || "").trim().slice(0, 600),
    source
  };
}

function gardenContext() {
  const s = state.settings;
  return `${s.region}, RHS H${s.hardiness} area, ${s.soil === "unknown" ? "soil type not yet checked" : `${s.soil} soil`}, photographed in ${MONTHS[new Date().getMonth()]}`;
}

async function identifyFlow(onPick, placement = null) {
  const blob = await pickPhoto();
  if (!blob) return;
  identifyFromBlob(blob, onPick, { placement, keepPhoto: true });
}

async function identifyFromBlob(blob, onPick, { placement = null, keepPhoto = false, onNone = null } = {}) {
  if (!apiKey) {
    toast("Add a Claude API key in Settings for photo ID. Search by name for now.", 4000);
    if (onNone) onNone(); else customSpeciesForm(onPick);
    return;
  }
  openSheet(`<h2>Looking closely…</h2><p class="muted">Claude is identifying your plant. This takes a few seconds.</p><div class="brush" style="margin:20px auto"></div>`);
  try {
    const small = await resizeBlob(blob, 1600, 0.85);
    const photoKey = `photo:${uid("plant")}`;
    await putBlob(photoKey, small);
    const result = await ai.identifyPlant(apiKey, await ai.fileToBase64Jpeg(small), gardenContext());
    const candidates = (result.candidates || []).slice(0, 3);
    if (!candidates.length) throw new Error("No identification came back");
    openSheet(`<h2>Is it one of these?</h2>
      <div class="choice-list">${candidates.map((c, i) => `<button class="choice" data-i="${i}"><span style="width:14px;height:14px;border-radius:50%;flex:none;background:${esc(c.flower || c.foliage)}"></span><span><strong>${esc(c.name)} <small style="display:inline">(${esc(c.confidence)} confidence)</small></strong><small><em>${esc(c.latin)}</em> · ${esc(c.clues)}</small></span></button>`).join("")}</div>
      ${result.tip ? `<div class="note-box" style="margin-top:12px">${esc(result.tip)}</div>` : ""}
      <button class="btn" id="id-none" style="margin-top:12px">None of these</button>`, (body) => {
      body.querySelectorAll("[data-i]").forEach((btn) => btn.addEventListener("click", () => {
        const sp = normalizeSpecies(candidates[Number(btn.dataset.i)], "claude-id");
        sp.photoId = photoKey;
        state.species[sp.id] = sp;
        if (keepPhoto && placement) (placement.photos ||= []).push({ id: photoKey, date: new Date().toISOString().slice(0, 10) });
        if (keepPhoto && ui.draft) ui.draft.photoKey = photoKey;
        save();
        onPick(sp.id);
      }));
      body.querySelector("#id-none").addEventListener("click", () => (onNone ? onNone() : customSpeciesForm(onPick)));
    });
  } catch (error) {
    console.error(error);
    openSheet(`<h2>Couldn't identify it</h2><p class="muted">${esc(error.message)}</p><button class="btn" id="id-manual">Add it by name instead</button>`, (body) => body.querySelector("#id-manual").addEventListener("click", () => customSpeciesForm(onPick)));
  }
}

/* ---------- new views & scanning ---------- */
async function newView({ fromSpot = null, fromLink = null } = {}) {
  const blob = await pickPhoto();
  if (!blob) return;
  toast("Adding your view…");
  const resized = await resizeBlob(blob, 1600, 0.86);
  const id = uid("spot");
  await putBlob(`photo:${id}`, resized);
  const fromArea = fromSpot && fromLink ? nearestArea(fromSpot, fromLink.x, fromLink.y) : null;
  const spot = newSpot(id, fromLink?.label || `View ${state.spots.length + 1}`, `photo:${id}`, { light: fromArea?.light, moist: fromArea?.moist });
  if (fromSpot) {
    spot.links.push({ id: uid("link"), x: 0.5, y: 0.93, to: fromSpot.id, label: `Back to ${fromSpot.name}` });
    if (fromLink) fromLink.to = id;
  }
  state.spots.push(spot);
  save();
  await goToSpot(id, fromLink && fromSpot?.id === ui.spotId ? fromLink : null);
  openSheet(`<h2>New view added</h2><p class="muted">Want to find the plants in it? Claude can mark what it sees and split the view into areas. You can confirm or fix each one.</p>
    <div class="sheet-actions"><button class="btn dark" id="nv-scan">${apiKey ? "Find plants in this view" : "Add a Claude key to scan"}</button><button class="btn" id="nv-later">I'll tag them myself</button></div>`, (body) => {
    body.querySelector("#nv-scan").addEventListener("click", () => (apiKey ? scanView(spot) : openSettings()));
    body.querySelector("#nv-later").addEventListener("click", () => { closeSheet(); ui.edit = true; renderWalkHeader(); toast("Edit is on: tap the painting to tag plants"); });
  });
}

async function scanView(spot) {
  if (!apiKey) { openSettings(); return; }
  openSheet(`<h2>Studying this view…</h2><p class="muted">Claude is looking for plants and the light in each part of the view. This can take up to a minute.</p><div class="brush" style="margin:20px auto"></div>`);
  try {
    const blob = await getBlob(spot.photoId);
    const result = await ai.scanGardenPhoto(apiKey, await ai.fileToBase64Jpeg(blob, 1400), gardenContext());
    let added = 0;
    for (const plant of result.plants || []) {
      const sp = normalizeSpecies(plant, "claude-scan");
      state.species[sp.id] = sp;
      state.placements.push({ id: uid("pl"), spotId: spot.id, speciesId: sp.id, status: "existing", x: clamp01(plant.x), y: clamp01(plant.y), r: Math.min(0.3, Math.max(0.02, Number(plant.r) || 0.06)), confirmed: false });
      added += 1;
    }
    if (result.areas?.length) {
      spot.areas = result.areas.map((a) => ({ id: uid("area"), name: a.name, x: clamp01(a.x), y: clamp01(a.y), light: a.light, moist: a.moist, maxH: 3, climbers: true, note: a.note }));
    }
    save();
    closeSheet();
    renderWalk();
    toast(`Found ${added} plants. Dashed pins are still to confirm.`, 4000);
  } catch (error) {
    console.error(error);
    openSheet(`<h2>Scan didn't work</h2><p class="muted">${esc(error.message)}</p>`);
  }
}
const clamp01 = (v) => Math.min(0.98, Math.max(0.02, Number(v) || 0.5));

/* ---------- year view ---------- */
let yearToken = 0;
async function renderYear() {
  const spot = currentSpot();
  const token = ++yearToken;
  $("#year-title").textContent = spot.name;
  const coverage = bloomCoverage(state, spot.id);
  const placeholder = await photoUrl(spot.photoId);
  $("#year-grid").innerHTML = MON.map((m, i) => `<button class="year-cell${i === ui.month ? " active" : ""}" data-ym="${i}"><img src="${placeholder}" alt="" /><span>${MONTHS[i]}</span>${coverage[i] ? `<em>${coverage[i]} in flower</em>` : ""}</button>`).join("");
  renderCalendar(spot, coverage);
  const order = [...Array(12).keys()].sort((a, b) => ((a - ui.month + 12) % 12) - ((b - ui.month + 12) % 12));
  for (const m of order) {
    try {
      const canvas = await composeScene(spot, m, 5 - ((m - ui.month + 12) % 12) * 0.1);
      if (token !== yearToken) return;
      const cell = $(`[data-ym="${m}"]`);
      if (!cell) return;
      const thumb = document.createElement("canvas");
      const tw = 300;
      thumb.width = tw;
      thumb.height = Math.round((canvas.height / canvas.width) * tw);
      thumb.getContext("2d").drawImage(canvas, 0, 0, thumb.width, thumb.height);
      cell.querySelector("img, canvas").replaceWith(thumb);
    } catch (error) { console.error(error); }
  }
}

function renderCalendar(spot, coverage) {
  const nums = numbering(spot.id);
  const rows = state.placements.filter((p) => p.spotId === spot.id).sort((a, b) => nums.get(a.id) - nums.get(b.id));
  $("#calendar-scope").textContent = `${rows.length} plants in this view`;
  let html = `<div></div>${MON.map((m) => `<div class="h">${m[0]}</div>`).join("")}`;
  for (const p of rows) {
    const sp = speciesFor(state, p.speciesId);
    if (!sp) continue;
    html += `<div class="name ${p.status}"><b>${nums.get(p.id)}</b>${esc(sp.name)}</div>`;
    html += MON.map((_, i) => {
      const st = plantState(sp, i);
      if (st.flowering) return `<div class="c${p.status === "planned" ? " planned-bloom" : ""}" style="background-color:${esc(sp.flower)}"></div>`;
      if (st.fruit) return `<div class="c" style="background:${esc(st.fruit)};opacity:.7"></div>`;
      if (st.stems) return `<div class="c" style="background:${esc(st.stems)};opacity:.8"></div>`;
      return `<div class="c${st.leaf > 0.5 ? " leaf" : ""}"></div>`;
    }).join("");
  }
  html += `<div class="name"><strong>In flower</strong></div>${coverage.map((c) => `<div class="count${c ? "" : " gap"}">${c || "–"}</div>`).join("")}`;
  $("#calendar").innerHTML = html;
  const gaps = coverage.map((c, i) => (c ? null : i)).filter((i) => i !== null);
  $("#gap-note").innerHTML = gaps.length
    ? `Nothing flowers in this view in <strong>${monthRange(gaps)}</strong>.<br /><button class="btn small terra" id="fill-gap">Find plants for ${MONTHS[gaps[0]]}</button>`
    : "Something is in flower in this view every month of the year.";
  $("#fill-gap")?.addEventListener("click", () => { ui.gapMonth = gaps[0]; switchView("plan"); });
}

/* ---------- plan view ---------- */
function renderPlan() {
  const spot = currentSpot();
  if (!spot.areas.some((a) => a.id === ui.areaId)) ui.areaId = spot.areas[0]?.id;
  const area = spot.areas.find((a) => a.id === ui.areaId);
  const plannedIn = (a) => state.placements.filter((p) => p.spotId === spot.id && p.status === "planned" && nearestArea(spot, p.x, p.y)?.id === a.id).length;
  $("#area-chips").innerHTML = `${state.spots.length > 1 ? `<select id="plan-spot" style="width:auto;flex:none;padding:7px 10px;border-radius:999px;font-size:13px">${state.spots.map((s) => `<option value="${s.id}"${s.id === spot.id ? " selected" : ""}>${esc(s.name)}</option>`).join("")}</select>` : ""}${spot.areas.map((a) => `<button class="chip${a.id === ui.areaId ? " active" : ""}" data-area="${a.id}">${esc(a.name)}${plannedIn(a) ? ` <small>· ${plannedIn(a)}</small>` : ""}</button>`).join("")}<button class="chip" id="add-area">+ Area</button>`;
  $("#plan-spot")?.addEventListener("change", (e) => { ui.spotId = e.target.value; ui.areaId = null; persistUi(); renderPlan(); });
  if (!area) {
    $("#area-card").innerHTML = `<p class="empty">Add an area of this view to get recommendations.</p>`;
    $("#recs").innerHTML = "";
    renderPlanList();
    return;
  }
  const coverage = bloomCoverage(state, spot.id);
  const maxC = Math.max(1, ...coverage);
  const opt = (map, value) => Object.entries(map).map(([k, v]) => `<option value="${k}"${k === value ? " selected" : ""}>${v}</option>`).join("");
  $("#area-card").innerHTML = `
    <div class="card-head" style="margin-bottom:0"><h2>${esc(area.name)}</h2><button class="btn small ghost" id="area-edit">Edit</button></div>
    <p>${esc(area.note || "")}</p>
    <div class="field-row">
      <label class="field">Sun<select id="pa-light">${opt(LIGHT_LABEL, area.light)}</select></label>
      <label class="field">Moisture<select id="pa-moist">${opt(MOIST_LABEL, area.moist)}</select></label>
    </div>
    ${state.settings.soil === "unknown" ? `<p style="margin:10px 0 0">Soil type not set yet, so only plants that handle both clay and loam are shown. <a href="#" id="set-soil">Set soil</a></p>` : ""}
    <div class="gapbar" aria-label="Plants in flower each month in this view">${coverage.map((c, i) => `<button data-gap="${i}" class="${ui.gapMonth === i ? "active" : ""}" aria-pressed="${ui.gapMonth === i}" aria-label="${MONTHS[i]}: ${c} in flower"><span class="bars"><i class="${c ? "" : "zero"}" style="height:${c ? 6 + (c / maxC) * 28 : 10}px"></i></span>${MON[i][0]}</button>`).join("")}</div>
    <p class="muted" style="margin:8px 0 0">${ui.gapMonth !== null ? `Showing plants that flower in ${MONTHS[ui.gapMonth]}. <a href="#" id="clear-gap">Show all</a>` : "Flowers per month in this view. Tap a month to fill it."}</p>`;
  $("#pa-light").addEventListener("change", (e) => { area.light = e.target.value; save(); renderPlan(); });
  $("#pa-moist").addEventListener("change", (e) => { area.moist = e.target.value; save(); renderPlan(); });
  $("#area-edit").addEventListener("click", () => openAreaSheet(area));
  $("#set-soil")?.addEventListener("click", (e) => { e.preventDefault(); openSettings(); });
  $("#clear-gap")?.addEventListener("click", (e) => { e.preventDefault(); ui.gapMonth = null; renderPlan(); });

  const recs = recommendFor(state, spot, area, { limit: 12, gapMonth: ui.gapMonth });
  $("#recs").innerHTML = recs.length ? recs.map(({ sp, reasons }) => `
    <article class="rec">
      <canvas data-thumb="${esc(sp.id)}" aria-hidden="true"></canvas>
      <div>
        <h3>${esc(sp.name)}</h3>
        <p class="latin">${esc(sp.latin)}</p>
        <ul>${reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
        <div class="facts">${factChips(sp)}</div>
        <div class="rec-actions"><button class="btn small dark" data-place="${esc(sp.id)}">Place in the garden</button><button class="btn small" data-info="${esc(sp.id)}">About</button></div>
      </div>
    </article>`).join("") : `<div class="empty card">Nothing in the catalogue fits all of this spot's conditions${ui.gapMonth !== null ? ` and flowers in ${MONTHS[ui.gapMonth]}` : ""}. Try asking Claude below, or check the conditions are right.</div>`;
  document.querySelectorAll("#recs canvas[data-thumb]").forEach((canvas) => { const s = speciesFor(state, canvas.dataset.thumb); if (s) paintThumb(canvas, s, ui.gapMonth ?? showcaseMonth(s)); });
  renderPlanList();
}

function renderPlanList() {
  const planned = state.placements.filter((p) => p.status === "planned");
  $("#plan-count").textContent = planned.length ? `${planned.length} plants` : "";
  if (!planned.length) { $("#plan-list").innerHTML = `<p class="empty">Nothing planned yet. Place an idea above, or switch on Edit in Walk and tap the painting.</p>`; return; }
  $("#plan-list").innerHTML = state.spots.map((spot) => {
    const nums = numbering(spot.id);
    const here = planned.filter((p) => p.spotId === spot.id);
    if (!here.length) return "";
    return `<p class="eyebrow" style="margin-top:8px">${esc(spot.name)}</p>${here.map((p) => {
      const sp = speciesFor(state, p.speciesId);
      return `<div class="row"><span class="num planned">${nums.get(p.id)}</span><div class="grow"><strong>${esc(sp.name)}</strong><small>${esc(nearestArea(spot, p.x, p.y)?.name || "")} · ${sp.bloom.length ? monthRange(sp.bloom) : sp.habit}</small></div><button class="btn small" data-show="${p.id}">Show</button></div>`;
    }).join("")}`;
  }).join("");
}

function speciesInfoSheet(id) {
  const sp = speciesFor(state, id);
  openSheet(`<h2>${esc(sp.name)}</h2><p class="latin">${esc(sp.latin)}</p>
    <div class="sheet-section"><h3>Through the year</h3>${miniCalendar(sp)}</div>
    <div class="sheet-section"><div style="display:flex;flex-wrap:wrap;gap:4px">${factChips(sp)}</div></div>
    ${sp.note ? `<div class="note-box" style="margin-top:12px">${esc(sp.note)}</div>` : ""}
    <div class="sheet-actions"><button class="btn small dark" id="info-place">Place in the garden</button></div>`, (body) => body.querySelector("#info-place").addEventListener("click", () => startPlacing(id)));
}

function startPlacing(speciesId) {
  closeSheet();
  switchView("walk");
  const sp = speciesFor(state, speciesId);
  setMode({ type: "place", speciesId, status: "planned" }, `Tap where ${sp.name} should go`);
}

async function askClaude() {
  const text = $("#ask-input").value.trim();
  if (!apiKey) { toast("Add your Claude API key in Settings first"); openSettings(); return; }
  const spot = currentSpot();
  const area = spot.areas.find((a) => a.id === ui.areaId);
  if (!area) return;
  const btn = $("#ask-btn");
  btn.disabled = true;
  btn.textContent = "Thinking about your garden…";
  const coverage = bloomCoverage(state, spot.id);
  const gaps = coverage.map((c, i) => (c ? null : i)).filter((i) => i !== null);
  const growing = state.placements.filter((p) => p.spotId === spot.id).map((p) => {
    const sp = speciesFor(state, p.speciesId);
    return `- ${sp.name} (${sp.latin || "unconfirmed"}), ${p.status}${sp.bloom.length ? `, flowers ${monthRange(sp.bloom)}` : ""}`;
  }).join("\n");
  const local = recommendFor(state, spot, area, { limit: 8 }).map(({ sp }) => sp.name).join(", ");
  const s = state.settings;
  const brief = `My garden: ${s.region}; I need plants hardy to RHS H${s.hardiness} or better; soil: ${s.soil === "unknown" ? "not yet tested (assume it could be clay)" : s.soil}; looking out from the house, the garden faces roughly ${ASPECTS[s.aspect]}${s.aspectConfirmed ? "" : " (not yet confirmed)"}.
The spot: "${area.name}" in the view "${spot.name}". Light: ${LIGHT_LABEL[area.light]}. Moisture: ${MOIST_LABEL[area.moist]}. ${area.note || ""} Space for plants up to about ${area.maxH || 2.5}m tall.${area.climbers ? " There is a fence or structure that climbers could use." : ""}
Already in this view:
${growing || "- nothing recorded yet"}
Months with nothing in flower in this view: ${gaps.length ? monthRange(gaps) : "none"}.
What I'd like: ${text || "plants that make this spot look good all year and feel considered, not generic"}.
Suggest 5 plants that genuinely suit this exact spot and work with what is already here. Don't suggest these, which I am already looking at: ${local}.`;
  try {
    const result = await ai.suggestPlants(apiKey, brief);
    const ideas = (result.ideas || []).map((idea) => normalizeSpecies(idea, "claude-idea"));
    ideas.forEach((sp) => { state.species[sp.id] = sp; });
    save();
    renderPlan();
    toast(`${ideas.length} ideas from Claude added to this list`);
    $("#recs").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    console.error(error);
    toast(`Claude couldn't answer: ${error.message}`, 5000);
  } finally {
    btn.disabled = false;
    btn.textContent = "Suggest plants";
  }
}

/* ---------- plants & views ---------- */
async function renderPlants() {
  const rows = await Promise.all(state.spots.map(async (spot) => {
    const here = state.placements.filter((p) => p.spotId === spot.id);
    return `<div class="row"><img class="thumb" src="${await photoUrl(spot.photoId)}" alt="" /><div class="grow"><strong>${esc(spot.name)}</strong><small>${here.filter((p) => p.status === "existing").length} plants · ${here.filter((p) => p.status === "planned").length} planned · ${spot.links.length} paths</small></div><button class="btn small" data-view-act="open" data-id="${spot.id}">Open</button><button class="btn small ghost" data-view-act="more" data-id="${spot.id}" aria-label="More">⋯</button></div>`;
  }));
  $("#views-list").innerHTML = rows.join("");
  const existing = state.placements.filter((p) => p.status === "existing");
  $("#existing-count").textContent = `${existing.length} recorded · ${existing.filter((p) => !p.confirmed).length} to confirm`;
  $("#existing-list").innerHTML = existing.length ? existing.map((p) => {
    const sp = speciesFor(state, p.speciesId);
    const spot = state.spots.find((s) => s.id === p.spotId);
    return `<div class="row"><span class="num${p.confirmed ? "" : " unconfirmed"}">${numbering(p.spotId).get(p.id)}</span><div class="grow"><strong>${esc(sp?.name)}</strong><small>${esc(spot?.name)}${p.confirmed ? "" : " · to confirm"}${sp?.bloom?.length ? ` · flowers ${monthRange(sp.bloom)}` : ""}</small></div><button class="btn small" data-show="${p.id}">Show</button></div>`;
  }).join("") : `<p class="empty">No plants recorded yet.</p>`;
}

function viewMoreSheet(spot) {
  openSheet(`<h2>${esc(spot.name)}</h2><div class="choice-list">
    <button class="choice" data-a="rename"><span><strong>Rename</strong></span></button>
    <button class="choice" data-a="scan"><span><strong>Find plants with Claude</strong><small>Marks plants and areas it can see</small></span></button>
    <button class="choice" data-a="photo"><span><strong>Replace photo</strong><small>Retake it, e.g. after you've planted</small></span></button>
    <button class="choice" data-a="start"><span><strong>Start walks here</strong></span></button>
    ${state.spots.length > 1 ? `<button class="choice" data-a="delete"><span><strong style="color:#a33">Delete this view</strong></span></button>` : ""}
  </div>`, (body) => body.querySelectorAll("[data-a]").forEach((btn) => btn.addEventListener("click", async () => {
    const a = btn.dataset.a;
    if (a === "rename") { const name = await askText("Rename view", spot.name, spot.name); if (name) { spot.name = name; save(); refreshCurrentView(); } }
    if (a === "scan") { ui.spotId = spot.id; switchView("walk"); scanView(spot); }
    if (a === "start") { state.startSpotId = spot.id; save(); closeSheet(); toast("Walks now start here"); }
    if (a === "photo") {
      const blob = await pickPhoto();
      if (!blob) return;
      const key = `photo:${uid("spot")}`;
      await putBlob(key, await resizeBlob(blob, 1600, 0.86));
      spot.photoId = key;
      pixelCache.delete(spot.id);
      [...baseCache.keys()].filter((k) => k.startsWith(`wc:${spot.id}:`)).forEach((k) => baseCache.delete(k));
      await deleteBlobsWithPrefix(`wc:${spot.id}:`);
      save(); closeSheet(); refreshCurrentView(); toast("Photo replaced. Repainting…");
    }
    if (a === "delete") {
      if (!confirm(`Delete "${spot.name}" and its pins?`)) return;
      state.spots = state.spots.filter((s) => s.id !== spot.id);
      state.placements = state.placements.filter((p) => p.spotId !== spot.id);
      state.spots.forEach((s) => s.links.forEach((l) => { if (l.to === spot.id) l.to = null; }));
      if (ui.spotId === spot.id) ui.spotId = state.spots[0].id;
      await deleteBlobsWithPrefix(`wc:${spot.id}:`);
      save(); closeSheet(); refreshCurrentView();
    }
  })));
}

/* ---------- settings ---------- */
function openSettings() {
  const s = state.settings;
  const opt = (pairs, value) => pairs.map(([k, v]) => `<option value="${k}"${String(k) === String(value) ? " selected" : ""}>${v}</option>`).join("");
  openSheet(`<h2>Your garden</h2>
    <div class="stack">
      <label class="field">Garden name<input type="text" id="st-name" value="${esc(s.gardenName)}" /></label>
      <label class="field">Where is it?<input type="text" id="st-region" value="${esc(s.region)}" placeholder="e.g. South London" /></label>
      <label class="field">Coldest winters<select id="st-hardy">${opt([[3, "H3: mild coastal / city centre"], [4, "H4: most of lowland UK (−10°C)"], [5, "H5: cold inland or frost pocket (−15°C)"], [6, "H6: upland / very exposed (−20°C)"]], s.hardiness)}</select></label>
      <label class="field">Soil<select id="st-soil">${opt([["unknown", "Not checked yet"], ["clay", "Clay: sticky, holds a shape when squeezed"], ["loam", "Loam: crumbly, dark"], ["sand", "Sandy: gritty, falls apart"], ["chalk", "Chalky: pale, stony, fizzes with vinegar"]], s.soil)}</select></label>
      <label class="field">Looking out from the house, the garden faces<select id="st-aspect">${opt(Object.entries(ASPECTS).map(([k, v]) => [k, v[0].toUpperCase() + v.slice(1)]), s.aspect)}</select></label>
      ${s.aspectConfirmed ? "" : `<div class="note-box">Stand at the back door facing the garden and check a phone compass. South- and west-facing gardens get the most sun; borders along the far side of a north-facing garden can still be sunny.</div>`}
      <label class="field">Claude API key (for plant ID and ideas)<input type="password" id="st-key" value="${esc(apiKey)}" placeholder="sk-ant-…" autocomplete="off" /></label>
      <p class="muted" style="margin-top:-6px">Stored only on this phone and sent only to Anthropic's API. Photos you scan are sent to Claude for analysis.</p>
      <button class="btn dark" id="st-save">Save</button>
      <div class="sheet-actions"><button class="btn small" id="st-export">Back up garden</button><button class="btn small" id="st-import">Restore backup</button><button class="btn small ghost" id="st-reset">Start over</button></div>
    </div>`, (body) => {
    body.querySelector("#st-save").addEventListener("click", async () => {
      const oldSoil = s.soil, oldHardy = s.hardiness;
      s.gardenName = body.querySelector("#st-name").value.trim() || "My garden";
      s.region = body.querySelector("#st-region").value.trim() || "UK";
      s.hardiness = Number(body.querySelector("#st-hardy").value);
      s.soil = body.querySelector("#st-soil").value;
      s.aspect = body.querySelector("#st-aspect").value;
      s.aspectConfirmed = true;
      apiKey = body.querySelector("#st-key").value.trim();
      await setValue("apiKey", apiKey);
      save();
      closeSheet();
      $("#garden-name").textContent = s.gardenName;
      refreshCurrentView();
      toast(oldSoil !== s.soil || oldHardy !== s.hardiness ? "Saved. Recommendations updated for your conditions." : "Saved");
    });
    body.querySelector("#st-export").addEventListener("click", exportGarden);
    body.querySelector("#st-import").addEventListener("click", () => $("#import-input").click());
    body.querySelector("#st-reset").addEventListener("click", async () => {
      if (!confirm("Delete everything and start again from the first photo?")) return;
      await setValue("state", null);
      await deleteBlobsWithPrefix("");
      location.reload();
    });
  });
}

async function exportGarden() {
  const photos = {};
  const keys = new Set([...state.spots.map((s) => s.photoId), ...Object.values(state.species).map((s) => s.photoId), ...state.placements.map((p) => p.photoId)].filter(Boolean));
  for (const key of keys) {
    const blob = await getBlob(key);
    if (blob) photos[key] = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
  }
  const file = new Blob([JSON.stringify({ app: "ForeverGarden", exported: new Date().toISOString(), state, photos })], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = `forevergarden-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function importGarden(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== "ForeverGarden" || !data.state?.spots) throw new Error("Not a ForeverGarden backup");
    for (const [key, dataUrl] of Object.entries(data.photos || {})) await putBlob(key, await (await fetch(dataUrl)).blob());
    await setValue("state", data.state);
    location.reload();
  } catch (error) {
    toast(`Couldn't restore: ${error.message}`);
  }
}

/* ---------- navigation ---------- */
function switchView(name) {
  ui.view = name;
  document.querySelectorAll(".view").forEach((section) => {
    const active = section.id === `view-${name}`;
    section.classList.toggle("is-active", active);
    section.hidden = !active;
  });
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === name));
  if (name !== "walk") { closeSheet(); ui.playing = false; updateMonthChip(); }
  refreshCurrentView();
  if (name !== "walk") window.scrollTo(0, 0);
}
function refreshCurrentView() {
  if (ui.view === "walk") { renderWalk(); requestAnimationFrame(layoutScene); }
  if (ui.view === "year") renderYear();
  if (ui.view === "plan") renderPlan();
  if (ui.view === "plants") renderPlants();
}

async function setMonth(month, animate = true) {
  ui.month = (month + 12) % 12;
  if (ui.view === "walk") {
    await renderWalk({ animateMonth: animate });
    if (ui.sheetPlacement) openPlacementSheet(ui.sheetPlacement);
  } else refreshCurrentView();
}

async function playYear() {
  ui.playing = !ui.playing;
  updateMonthChip();
  if (!ui.playing) return;
  if (ui.view !== "walk") switchView("walk");
  ui.playing = true;
  while (ui.playing) {
    await setMonth(ui.month + 1);
    updateMonthChip();
    await wait(1300);
  }
  updateMonthChip();
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));
  $("#settings-btn").addEventListener("click", openSettings);
  $("#sheet-close").addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeSheet(); setMode(null); } });
  $("#month-chip").addEventListener("click", playYear);
  $("#seasons").addEventListener("click", (e) => { const btn = e.target.closest("[data-month]"); if (btn) { ui.playing = false; setMonth(Number(btn.dataset.month)); } });
  $("#stones").addEventListener("click", (e) => {
    if (e.target.closest("#add-stone")) { newView(); return; }
    const btn = e.target.closest("[data-spot]");
    if (btn) goToSpot(btn.dataset.spot);
  });
  $("#overlay").addEventListener("click", (e) => {
    const pin = e.target.closest("[data-pin]");
    if (pin) { e.stopPropagation(); if (ui.mode) return; openPlacementSheet(pin.dataset.pin); return; }
    const hot = e.target.closest("[data-link]");
    if (hot) {
      e.stopPropagation();
      const link = currentSpot().links.find((l) => l.id === hot.dataset.link);
      if (ui.edit || !link.to) openLinkSheet(link);
      else goToSpot(link.to, link);
    }
  });
  $("#edit-toggle").addEventListener("click", () => { ui.edit = !ui.edit; renderWalkHeader(); toast(ui.edit ? "Edit on: tap the painting to plan, tag or add paths" : "Edit off"); });
  $("#labels-toggle").addEventListener("click", () => { ui.labels = !ui.labels; persistUi(); renderWalkHeader(); renderOverlay(); });
  $("#compare-toggle").addEventListener("click", () => { ui.photo = !ui.photo; renderWalk(); });
  $("#zoom-reset").addEventListener("click", () => { view.s = 1; view.x = 0; view.y = 0; clampView(); applyView(); });
  $("#back-btn").addEventListener("click", () => { const prev = ui.history.pop(); if (prev) goToSpot(prev, null, { pushHistory: false }); });
  $("#area-chips").addEventListener("click", (e) => {
    if (e.target.closest("#add-area")) { openAreaSheet(null, 0.5, 0.6); return; }
    const chip = e.target.closest("[data-area]");
    if (chip) { ui.areaId = chip.dataset.area; renderPlan(); }
  });
  $("#area-card").addEventListener("click", (e) => { const g = e.target.closest("[data-gap]"); if (g) { const m = Number(g.dataset.gap); ui.gapMonth = ui.gapMonth === m ? null : m; renderPlan(); } });
  $("#recs").addEventListener("click", (e) => {
    const place = e.target.closest("[data-place]");
    if (place) startPlacing(place.dataset.place);
    const info = e.target.closest("[data-info]");
    if (info) speciesInfoSheet(info.dataset.info);
  });
  const showPlacement = (e) => {
    const btn = e.target.closest("[data-show]");
    if (!btn) return;
    const p = state.placements.find((item) => item.id === btn.dataset.show);
    ui.spotId = p.spotId;
    persistUi();
    switchView("walk");
    setTimeout(() => openPlacementSheet(p.id), 250);
  };
  $("#plan-list").addEventListener("click", showPlacement);
  $("#existing-list").addEventListener("click", showPlacement);
  $("#ask-btn").addEventListener("click", askClaude);
  $("#identify-btn").addEventListener("click", () => identifyFlow(async (id) => {
    const sp = speciesFor(state, id);
    closeSheet();
    switchView("walk");
    setMode({ type: "place", speciesId: id, status: "existing" }, `Tap where ${sp.name} grows in this view`);
  }));
  $("#new-view-btn").addEventListener("click", () => newView());
  $("#views-list").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view-act]");
    if (!btn) return;
    const spot = state.spots.find((s) => s.id === btn.dataset.id);
    if (btn.dataset.viewAct === "open") { ui.spotId = spot.id; persistUi(); switchView("walk"); }
    else viewMoreSheet(spot);
  });
  $("#year-grid").addEventListener("click", (e) => { const cell = e.target.closest("[data-ym]"); if (cell) { ui.month = Number(cell.dataset.ym); switchView("walk"); } });
  $("#import-input").addEventListener("change", (e) => { const f = e.target.files?.[0]; if (f) importGarden(f); });
  new ResizeObserver(() => { if (ui.view === "walk") layoutScene(); }).observe($("#stage"));
  setupStageGestures();
}

// First run: the garden starts from a photo taken on this phone. Nothing personal ships with the app.
function onboarding() {
  return new Promise((resolve) => {
    document.body.classList.add("onboarding");
    const panel = $("#onboarding");
    panel.hidden = false;
    const button = $("#onboard-photo");
    button.addEventListener("click", async () => {
      const blob = await pickPhoto();
      if (!blob) return;
      button.disabled = true;
      button.textContent = "Sharpening pencils…";
      try {
        const garden = await buildFirstGarden(await resizeBlob(blob, 1600, 0.86));
        await setValue("state", garden);
        panel.hidden = true;
        document.body.classList.remove("onboarding");
        $("#import-input").onchange = null;
        resolve(garden);
      } catch (error) {
        console.error(error);
        button.disabled = false;
        button.textContent = "Take or choose a photo";
        toast(`Couldn't use that photo: ${error.message}`);
      }
    });
    $("#onboard-restore").addEventListener("click", () => $("#import-input").click());
    $("#import-input").onchange = (e) => { const f = e.target.files?.[0]; if (f) importGarden(f); };
  });
}

async function init() {
  let firstRun = false;
  try {
    state = await getValue("state");
    apiKey = (await getValue("apiKey")) || "";
  } catch (error) {
    console.error(error);
    document.body.innerHTML = `<p style="padding:24px">ForeverGarden couldn't open its storage on this browser: ${esc(error.message)}</p>`;
    return;
  }
  if (!state) { state = await onboarding(); firstRun = true; }
  restoreUi();
  ui.month = new Date().getMonth();
  if (!state.spots.some((s) => s.id === ui.spotId)) ui.spotId = state.startSpotId || state.spots[0].id;
  $("#garden-name").textContent = state.settings.gardenName || "ForeverGarden";
  bindEvents();
  switchView("walk");
  if (firstRun) {
    setTimeout(() => openSheet(`<p class="eyebrow">Welcome to your garden</p><h2>Sketched from your photo</h2>
      <div class="stack" style="font-size:14.5px;line-height:1.55">
        <p style="margin:0"><strong>Find your plants:</strong> let Claude spot them in this photo, or switch on <strong>Edit</strong> and tap a plant to tag it.</p>
        <p style="margin:0"><strong>Grow your walk:</strong> in Edit, tap a corner and choose "Make a path", then take a photo from there.</p>
        <p style="margin:0">Tap the <strong>months</strong> to see the garden change, or press ▶ to play the year.</p>
        <div class="sheet-actions" style="margin-top:4px">
          <button class="btn dark" id="welcome-scan">Find plants with Claude</button>
          <button class="btn" id="welcome-settings">Set soil &amp; aspect</button>
        </div>
      </div>`, (body) => {
      body.querySelector("#welcome-scan").addEventListener("click", () => scanView(currentSpot()));
      body.querySelector("#welcome-settings").addEventListener("click", openSettings);
    }), 900);
  }
}

init();

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(() => {}));
}
