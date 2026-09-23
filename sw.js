// SPOT IT — service worker
// Caches the app shell (HTML, icons, logo) so the app itself opens with
// zero network. calibration.json is handled separately (network-first)
// since the app already manages its own offline copy of that file and
// the in-app "Reload dataset" button needs a real network attempt.

const CACHE_VERSION = 'v212'; // bump this string whenever you deploy changes, to force an update
const CACHE_NAME = `spotit-shell-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './entry-model.js',
  './sync-queue.js',
  './map-config.js',
  './swipe-actions.js',
  './entry-filters.js',
  './map-overlays.js',
  './map-overlays.css',
  './map-landmarks.json',
  './interchanges.json',
  './inspection-sharing.js',
  './sharing-ui.js',
  './log-controls.js',
  './sharing.css',
  './radius-system.css',
  './design-system.css',
  './photo-viewer.css',
  './photo-zoom.js',
  './photo-viewer.js',
  './location-resolver.js',
  './manifest.json',
  './bridges.json',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/LICENSE',
  './fonts/InterVariable.woff2',
  './fonts/SpaceGrotesk-300_700-latin.woff2',
  './fonts/SpaceGrotesk-300_700-latinext.woff2',
  './fonts/DMMono-400-latin.woff2',
  './fonts/DMMono-400-latinext.woff2',
  './fonts/DMMono-500-latin.woff2',
  './fonts/DMMono-500-latinext.woff2',
  './spot it app icon.svg',
  './spot it header logo dark mode.svg',
  './spot it header logo light mode.svg',
  './spot it header map logo dark mode.svg',
  './spot it header map logo light mode.svg',
  './spot-it-app-icon-v2-180.png',
  './spot-it-app-icon-v2-192.png',
  './spot-it-app-icon-v2-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if(event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Only handle same-origin requests — let everything else (if any) pass through normally.
  if(url.origin !== self.location.origin) return;

  // calibration.json: always try the network first (respects the app's own
  // no-store reload requests), falling back to whatever we've cached before
  // only if the network is unavailable.
  if(url.pathname.endsWith('calibration.json')){
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if(response && response.status === 200){
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else (the app shell): cache-first, so it loads instantly with
  // zero network, and falls back to fetching + caching anything new.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if(cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if(response && response.status === 200){
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Nothing cached and no network — for a page navigation, fall back
          // to the shell itself rather than showing a browser error page.
          if(event.request.mode === 'navigate') return caches.match('./index.html');
        });
    })
  );
});
