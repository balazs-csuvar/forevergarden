import { BY_ID, RECOMMENDABLE } from "./plant-index.js";

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LIGHT = { full: "full sun", part: "part shade", shade: "shade" };
const MOIST = { dry: "dry", moist: "moist but drained", wet: "damp" };

export function monthRange(months) {
  if (!months || !months.length) return "";
  const sorted = [...new Set(months)].sort((a, b) => a - b);
  // Handle runs that wrap over the new year (e.g. Nov–Feb).
  const runs = [];
  let start = sorted[0], prev = sorted[0];
  for (const m of sorted.slice(1)) {
    if (m === prev + 1) { prev = m; continue; }
    runs.push([start, prev]); start = m; prev = m;
  }
  runs.push([start, prev]);
  if (runs.length > 1 && runs[0][0] === 0 && runs[runs.length - 1][1] === 11) {
    const first = runs.shift();
    runs[runs.length - 1][1] = first[1];
  }
  return runs.map(([a, b]) => (a === b ? MON[a] : `${MON[a]}–${MON[b]}`)).join(", ");
}

export function nearestArea(spot, x, y) {
  let best = null, bestD = Infinity;
  for (const area of spot.areas || []) {
    const d = (area.x - x) ** 2 + ((area.y - y) * 1.3) ** 2;
    if (d < bestD) { bestD = d; best = area; }
  }
  return best;
}

export function bloomCoverage(state, spotId) {
  const counts = new Array(12).fill(0);
  for (const placement of state.placements) {
    if (spotId && placement.spotId !== spotId) continue;
    const sp = speciesFor(state, placement.speciesId);
    if (!sp) continue;
    for (const m of sp.bloom || []) counts[m] += 1;
  }
  return counts;
}

export function speciesFor(state, id) {
  return state.species[id] || BY_ID.get(id) || null;
}

export function fitsConditions(sp, area, settings) {
  const reasons = [];
  if (sp.rhs < settings.hardiness) return { ok: false, why: `Only hardy to RHS H${sp.rhs}; your garden needs H${settings.hardiness}+` };
  if (!sp.sun.includes(area.light)) return { ok: false, why: `Wants ${sp.sun.map((s) => LIGHT[s]).join(" or ")}, this spot is ${LIGHT[area.light]}` };
  if (!sp.moist.includes(area.moist)) return { ok: false, why: `Needs ${sp.moist.map((s) => MOIST[s]).join(" or ")} soil` };
  const soil = settings.soil;
  if (soil === "unknown" ? !(sp.soil.includes("clay") && sp.soil.includes("loam")) : !sp.soil.includes(soil)) return { ok: false, why: soil === "unknown" ? "Fussy about soil: check your soil type first" : `Doesn't like ${soil} soil` };
  if (sp.form === "climber" && !area.climbers) return { ok: false, why: "Needs a fence, wall or arch to climb" };
  if (area.climbersOnly && sp.form !== "climber") return { ok: false, why: "This spot is for climbers" };
  if (area.maxH && sp.h > area.maxH && sp.form !== "climber") return { ok: false, why: `Grows to ${sp.h}m, too big for this spot` };
  return { ok: true, reasons };
}

export function recommendFor(state, spot, area, { limit = 12, gapMonth = null, exclude = [], likeOf = null } = {}) {
  const coverage = bloomCoverage(state, spot.id);
  const inGarden = new Set(state.placements.map((p) => p.speciesId));
  const evergreenCount = state.placements.filter((p) => p.spotId === spot.id && ["evergreen", "semi"].includes(speciesFor(state, p.speciesId)?.habit)).length;
  const pool = [...RECOMMENDABLE, ...Object.values(state.species).filter((sp) => sp.source === "claude-idea")];
  const results = [];
  for (const sp of pool) {
    if (exclude.includes(sp.id)) continue;
    const fit = fitsConditions(sp, area, state.settings);
    if (!fit.ok) continue;
    if (likeOf) {
      const ratio = sp.h / likeOf.h;
      if (ratio < 0.4 || ratio > 2.5) continue;
      if ((likeOf.form === "climber") !== (sp.form === "climber")) continue;
      if ((likeOf.form === "tree") !== (sp.form === "tree")) continue;
    }
    let score = 0;
    const reasons = [];
    const gaps = (sp.bloom || []).filter((m) => coverage[m] === 0);
    if (gaps.length) { score += gaps.length * 2.2; reasons.push(`Flowers ${monthRange(gaps)}, when nothing else in this view does`); }
    else if (sp.bloom?.length) { score += sp.bloom.length * 0.4; reasons.push(`In flower ${monthRange(sp.bloom)}`); }
    if (gapMonth !== null) { if (sp.bloom.includes(gapMonth)) score += 8; else score -= 6; }
    if (sp.habit === "evergreen" && evergreenCount < 4) { score += 2; reasons.push("Evergreen: keeps this corner alive in winter"); }
    if (sp.stems) { score += 2; reasons.push("Coloured winter stems"); }
    if (sp.autumn) { score += 1; reasons.push("Good autumn colour"); }
    if (sp.fruit) { score += 1; reasons.push("Berries or fruit for birds"); }
    if (area.light === "shade" && area.moist === "dry" && sp.sun.includes("shade") && sp.moist.includes("dry")) { score += 3; reasons.push("One of the few plants that copes with dry shade under trees"); }
    if (sp.wildlife) { score += 1; reasons.push("RHS Plants for Pollinators"); }
    if (sp.scent) { score += 0.8; reasons.push("Scented"); }
    if (sp.rhs >= 6) reasons.push(`Fully hardy (RHS H${sp.rhs})`);
    if (inGarden.has(sp.id)) { score -= 4; reasons.push("Already in your garden: repeating it gives rhythm"); }
    results.push({ sp, score, reasons: reasons.slice(0, 4) });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function describeConditions(area, settings) {
  return `${LIGHT[area.light]} · ${MOIST[area.moist]} · ${settings.soil === "unknown" ? "soil not checked" : `${settings.soil} soil`} · RHS H${settings.hardiness}+`;
}
