// Daily weather log for the garden from Open-Meteo (free, no key): min/max temperature, rainfall, wind.
// Recent days come from the forecast API (past 92 days); older ranges from the historical archive.
import { getValue, setValue } from "./store.js";

const KEY = "weather";
const DAILY = "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max";

export async function loadWeather() {
  return (await getValue(KEY)) || { days: {}, lastSync: 0, locKey: "" };
}

// Local calendar date (UK), not UTC, so just after midnight is already "today".
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return isoDay(d); };

function merge(log, json) {
  const d = json?.daily;
  if (!d?.time) return 0;
  let added = 0;
  d.time.forEach((date, i) => {
    if (d.temperature_2m_max[i] == null) return;
    if (!log.days[date]) added += 1;
    log.days[date] = {
      tmax: round1(d.temperature_2m_max[i]),
      tmin: round1(d.temperature_2m_min[i]),
      rain: round1(d.precipitation_sum[i] ?? 0),
      wind: round1(d.wind_speed_10m_max[i] ?? 0),
      gust: round1(d.wind_gusts_10m_max[i] ?? 0)
    };
  });
  return added;
}
const round1 = (v) => Math.round(v * 10) / 10;

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather service replied ${res.status}`);
  return res.json();
}

// Bring the log up to date; backfill from `fromDate` (YYYY-MM-DD) if days are missing.
export async function syncWeather(loc, { fromDate = null, force = false } = {}) {
  const log = await loadWeather();
  const locKey = `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;
  if (log.locKey !== locKey) { log.days = {}; log.locKey = locKey; }
  const base = `latitude=${loc.lat}&longitude=${loc.lon}&daily=${DAILY}&timezone=Europe%2FLondon&wind_speed_unit=kmh`;
  let added = 0;
  if (force || Date.now() - log.lastSync > 3 * 3600 * 1000) {
    added += merge(log, await getJson(`https://api.open-meteo.com/v1/forecast?${base}&past_days=92&forecast_days=1`));
    log.lastSync = Date.now();
  }
  if (fromDate) {
    // The archive lags a few days behind; the forecast call above covers the recent gap.
    const archiveEnd = addDays(isoDay(new Date()), -6);
    let start = fromDate;
    while (start <= archiveEnd && log.days[start]) start = addDays(start, 1);
    if (start <= archiveEnd) {
      added += merge(log, await getJson(`https://archive-api.open-meteo.com/v1/archive?${base}&start_date=${start}&end_date=${archiveEnd}`));
    }
  }
  await setValue(KEY, log);
  return { log, added };
}

// Place search: UK postcodes via postcodes.io, anything else via Open-Meteo geocoding.
export async function findPlace(query) {
  const q = query.trim();
  if (/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(q)) {
    const json = await getJson(`https://api.postcodes.io/postcodes/${encodeURIComponent(q)}`);
    const r = json.result;
    return r ? [{ name: `${r.postcode}, ${r.admin_district || r.region || ""}`.replace(/, $/, ""), lat: r.latitude, lon: r.longitude }] : [];
  }
  if (/^[A-Z]{1,2}\d[A-Z\d]?$/i.test(q)) {
    const json = await getJson(`https://api.postcodes.io/outcodes/${encodeURIComponent(q)}`);
    const r = json.result;
    return r ? [{ name: `${r.outcode}, ${(r.admin_district || [])[0] || ""}`.replace(/, $/, ""), lat: r.latitude, lon: r.longitude }] : [];
  }
  const json = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&countryCode=GB`);
  return (json.results || []).map((r) => ({ name: [r.name, r.admin2 || r.admin1].filter(Boolean).join(", "), lat: r.latitude, lon: r.longitude }));
}

export function monthSummary(days, year, month) {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const list = Object.entries(days).filter(([d]) => d.startsWith(prefix)).map(([, v]) => v);
  if (!list.length) return null;
  const avg = (k) => round1(list.reduce((s, v) => s + v[k], 0) / list.length);
  return {
    n: list.length,
    tmax: avg("tmax"),
    tmin: avg("tmin"),
    rain: round1(list.reduce((s, v) => s + v.rain, 0)),
    frost: list.filter((v) => v.tmin < 0).length,
    gust: Math.max(...list.map((v) => v.gust)),
    hottest: Math.max(...list.map((v) => v.tmax)),
    coldest: Math.min(...list.map((v) => v.tmin))
  };
}

export function lastDays(days, n, endIso = isoDay(new Date())) {
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const date = addDays(endIso, -i);
    out.push({ date, ...(days[date] || {}) });
  }
  return out;
}

export { isoDay, addDays };
