const CACHE_NAME = "forevergarden-v14";
const APP_FILES = [
  "./", "./index.html", "./styles.css", "./manifest.json",
  "./js/app.js", "./js/store.js", "./js/plants.js", "./js/seed.js", "./js/painter.js", "./js/recommend.js", "./js/ai.js", "./js/watercolour-worker.js", "./js/plant-index.js", "./js/garden-centre.js", "./js/uk-natives.js", "./js/segment.js", "./js/weather.js", "./js/guided.js", "./js/exif.js", "./js/align.js", "./js/photo-input.js", "./js/camera.js",
  "./icons/icon-192.png", "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // App files: network first so updates arrive, cache when offline.
  if (url.origin === self.location.origin) {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) { const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)); }
      return response;
    }).catch(() => caches.match(request)));
    return;
  }
  // Fonts: cache first.
  if (url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com")) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      return response;
    })));
  }
});
