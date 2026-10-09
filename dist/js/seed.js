// First-run garden, built from the photo the person picks on their own phone.
// Nothing personal ships with the app: the photo and everything after it stays in on-device storage.
import { putBlob } from "./store.js";

export function newSpot(id, name, photoId, { light = "part", moist = "moist" } = {}) {
  return {
    id,
    name,
    photoId,
    horizon: 0.36,
    perspective: 0.67,
    areas: [{ id: `area-${id}`, name: "This part of the garden", x: 0.5, y: 0.7, light, moist, maxH: 3, climbers: true, note: "Set its light and moisture so ideas fit." }],
    links: []
  };
}

export async function buildFirstGarden(photoBlob) {
  await putBlob("photo:spot-first", photoBlob);
  return {
    version: 2,
    settings: { gardenName: "My garden", region: "UK", hardiness: 4, soil: "unknown", aspect: "S", aspectConfirmed: false },
    startSpotId: "spot-first",
    species: {},
    spots: [newSpot("spot-first", "My first view", "photo:spot-first")],
    placements: [],
    backdrop: {}
  };
}
