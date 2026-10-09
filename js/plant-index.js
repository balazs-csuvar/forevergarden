// One searchable catalogue: detailed profiles, garden-centre stock, and every native/naturalised UK plant.
import { PLANTS } from "./plants.js";
import { GARDEN_CENTRE } from "./garden-centre.js";
import { NATIVES_RAW } from "./uk-natives.js";

const GRASS_FAMILIES = new Set(["Poac", "Cype", "Junc"]);
const FERN_FAMILIES = new Set(["Aspl", "Blec", "Denn", "Dryo", "Hyme", "Ophi", "Osmu", "Poly", "Thel", "Wood", "Adia", "Equi", "Lyco", "Sela", "Isoe"]);
const CONIFER_FAMILIES = new Set(["Pina", "Cupr", "Taxa"]);
const EVERGREEN_GENERA = new Set(["Ilex", "Hedera", "Buxus", "Ulex", "Calluna", "Erica", "Vinca", "Daphne", "Juniperus", "Arbutus", "Rhododendron", "Empetrum", "Ruscus", "Viscum", "Cotoneaster", "Prunus laurocerasus", "Ligustrum"]);
const CLIMBER_GENERA = new Set(["Hedera", "Lonicera", "Clematis", "Humulus", "Bryonia", "Convolvulus", "Calystegia", "Tamus", "Fallopia", "Vicia", "Lathyrus", "Rubus"]);
const STATUS_NOTE = {
  N: "Native to Britain.",
  AR: "Ancient introduction, naturalised in Britain for centuries.",
  AN: "Garden plant now naturalised in the British countryside."
};

const slug = (text) => text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function nativeToSpecies([latin, common, current, status, h, lf, woody, L, F, R, fam, spread]) {
  const genus = latin.split(" ")[0];
  let habit = "herbaceous";
  if (lf.startsWith("G")) habit = "bulb";
  else if (woody) habit = CONIFER_FAMILIES.has(fam) || EVERGREEN_GENERA.has(genus) || EVERGREEN_GENERA.has(latin) || lf === "Ch" ? "evergreen" : "deciduous";
  else if (lf === "Ch") habit = "semi";
  let form;
  if (GRASS_FAMILIES.has(fam)) form = "grass";
  else if (FERN_FAMILIES.has(fam)) form = "fern";
  else if (CLIMBER_GENERA.has(genus) && (h > 1.5 || genus === "Hedera")) form = "climber";
  else if (woody && h > 5) form = CONIFER_FAMILIES.has(fam) && genus !== "Taxus" ? "column" : "tree";
  else if (woody) form = "mound";
  else if (habit === "bulb") form = "bulbs";
  else form = h > 0.6 ? "upright" : h < 0.15 ? "ground" : "mound";
  const sun = L >= 7 ? ["full"] : L === 6 ? ["full", "part"] : L === 5 ? ["part", "full"] : L >= 1 && L <= 4 ? ["part", "shade"] : ["full", "part"];
  const moist = F === 0 ? ["moist"] : F <= 4 ? ["dry"] : F === 5 ? ["dry", "moist"] : F === 6 ? ["moist"] : F === 7 ? ["moist", "wet"] : ["wet"];
  const soil = R === 0 ? ["clay", "loam", "sand"] : R <= 3 ? ["loam", "sand", "clay"] : R >= 7 ? ["clay", "loam", "sand", "chalk"] : ["clay", "loam", "sand"];
  return {
    id: `uk-${slug(latin)}`,
    name: common || latin,
    latin: current ? `${latin} (now ${current})` : latin,
    type: { G: "Bulb", Th: "Annual" }[lf[0] === "G" ? "G" : lf] || (woody ? (h > 5 ? "Tree" : "Shrub") : FERN_FAMILIES.has(fam) ? "Fern" : GRASS_FAMILIES.has(fam) ? "Grass" : "Wild flower"),
    habit, form,
    h: Math.max(0.05, Math.min(30, h)),
    s: Math.max(0.05, Math.min(15, woody ? h * 0.7 : h * 0.6)),
    rhs: status === "AN" ? 5 : 7,
    sun, soil, moist,
    bloom: [], flower: null,
    foliage: CONIFER_FAMILIES.has(fam) ? "#3d5a2f" : "#5f7d45",
    autumn: null, stems: null, fruit: null, leaves: null,
    wildlife: status === "N", scent: false,
    note: `${STATUS_NOTE[status] || ""} Flowering time isn't in this catalogue yet: use "Fill in details" to add it.`.trim(),
    source: "uk-native",
    nativeStatus: status,
    spread
  };
}

const latinKey = (latin) => latin.toLowerCase().replace(/[×'"]/g, "").split(/\s+/).slice(0, 2).join(" ");
const curatedLatin = new Set([...PLANTS, ...GARDEN_CENTRE].map((p) => latinKey(p.latin)));
export const NATIVES = NATIVES_RAW.map(nativeToSpecies).filter((p) => !curatedLatin.has(latinKey(p.latin)) || !p.latin.includes(" "));

PLANTS.forEach((p) => { p.source ||= "profile"; });
export const RECOMMENDABLE = [...PLANTS, ...GARDEN_CENTRE];
export const CATALOGUE = [...PLANTS, ...GARDEN_CENTRE, ...NATIVES];
export const BY_ID = new Map(CATALOGUE.map((p) => [p.id, p]));

const norm = (text) => (text || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ");
const TIER = { profile: 38, "garden-centre": 34, "uk-native": 0 };

// Ranked search over common and Latin names; custom species (from tagging or Claude) come first.
export function searchPlants(query, extra = [], limit = 30) {
  const q = norm(query).trim();
  const pool = [...extra, ...CATALOGUE];
  if (!q) return pool.slice(0, limit);
  const tokens = q.split(/\s+/);
  const scored = [];
  for (const p of pool) {
    const name = norm(p.name), latin = norm(p.latin);
    let score = 0;
    for (const t of tokens) {
      const s = name.startsWith(t) ? 100 : latin.startsWith(t) ? 85 : new RegExp(`\\b${t}`).test(name) ? 70 : new RegExp(`\\b${t}`).test(latin) ? 60 : name.includes(t) || latin.includes(t) ? 25 : 0;
      if (!s) { score = 0; break; }
      score += s;
    }
    if (!score) continue;
    score += TIER[p.source] ?? 35;
    if (p.spread) score += Math.min(10, p.spread / 300);
    scored.push([score, p]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map(([, p]) => p);
}

export const SOURCE_LABEL = { profile: "Garden favourite", "garden-centre": "Garden centre", "uk-native": "UK wild plant", custom: "Your plant", "claude-id": "Identified", "claude-scan": "Identified", "claude-idea": "Claude idea", "claude-details": "Your plant" };
