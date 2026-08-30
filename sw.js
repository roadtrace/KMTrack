// Road Trace — service worker
// Caches the app shell (HTML, icons, logo) so the app itself opens with
// zero network. calibration.json is handled separately (network-first)
// since the app already manages its own offline copy of that file and
// the in-app "Reload dataset" button needs a real network attempt.

const CACHE_VERSION = 'v42'; // bump this string whenever you deploy changes, to force an update
const CACHE_NAME = `kmtrack-shell-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './bridges.json',
  './KMTrack_logo.png',
  './KMTrack.png'
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
