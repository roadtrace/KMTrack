// SPOT IT — service worker
// Caches the app shell (HTML, icons, logo) so the app itself opens with
// zero network. calibration.json is handled separately (network-first)
// since the app already manages its own offline copy of that file and
// the in-app "Reload dataset" button needs a real network attempt.

const CACHE_VERSION = 'v286'; // bump this string whenever you deploy changes, to force an update
const CACHE_NAME = `spotit-shell-${CACHE_VERSION}`;

const APP_SHELL = [
  './src/private-thumbnails.js',
  './src/action-feedback.js',
  './src/inspection-actions.js',
  './src/r2-photos.js',
  './src/team-map.js',
  './src/responsive.css',
  './src/team-log.js',
  './src/submitted-delete.js',

  './public/vendor/maptiler/maptiler-sdk.css',
  './public/vendor/maptiler/maptiler-sdk.umd.min.js',
  './public/vendor/maptiler/leaflet-maptilersdk.js',
  './src/manual-location.js',
  './src/capture-lanes.js',
  './src/capture-location.js',
  './public/stationing-reconstruction-evidence-user-edits-20261020.json',
  './public/network-stop-coverage.json',
  './public/network-stop-gates.geojson',
  './public/network-stop-context.json',
  './src/network-stop-gates.js',
  './',
  './index.html',
  './src/entry-model.js',
  './src/photo-upload-state.js',
  './src/photo-cloud-api.js',
  './src/photo-sync.js',
  './src/photo-pilot.js',
  './src/local-entry-store.js',
  './src/preapproval-review.js',
  './src/guest-claim.js',
  './src/auth-config.js',
  './src/auth.js',
  './src/inspection-api.js',
  './src/cloud-records.js',
  './src/record-presentation.js',
  './src/my-records.js',
  './src/team-records.js',
  './src/map-records.js',
  './src/cloud-photo-viewer.js',
  './public/vendor/supabase/supabase-js-2.117.1.umd.js',
  './public/vendor/supabase/LICENSE',
  './src/sync-queue.js',
  './src/sync-runner.js',
  './src/foreground-sync.js',
  './src/inspection-wakeup.js',
  './src/map-config.js',
  './src/swipe-actions.js',
  './src/entry-filters.js',
  './src/map-overlays.js',
  './src/map-overlays.css',
  './public/map-landmarks.json',
  './public/interchanges.json',
  './src/inspection-sharing.js',
  './src/sharing-ui.js',
  './src/log-controls.js',
  './src/log-register.js',
  './src/log-register.css',
  './src/more.css',
  './src/more.js',
  './src/presentation-config.js',
  './src/presentation-launcher.js',
  './src/sharing.css',
  './src/radius-system.css',
  './src/design-system.css',
  './src/photo-viewer.css',
  './src/photo-zoom.js',
  './src/photo-viewer.js',
  './src/legacy-matcher.js',
  './src/location-resolver.js',
  './src/stationing-review-controller.js',
  './src/stationing-review-worker.js',
  './src/stationing-reconstruction-review.js',
  './src/stationing-review.js',
  './manifest.json',
  './public/bridges.json',
  './public/vendor/leaflet/leaflet.css',
  './public/vendor/leaflet/leaflet.js',
  './public/vendor/leaflet/LICENSE',
  './public/fonts/InterVariable.woff2',
  './public/fonts/SpaceGrotesk-300_700-latin.woff2',
  './public/fonts/SpaceGrotesk-300_700-latinext.woff2',
  './public/fonts/DMMono-400-latin.woff2',
  './public/fonts/DMMono-400-latinext.woff2',
  './public/fonts/DMMono-500-latin.woff2',
  './public/fonts/DMMono-500-latinext.woff2',
  './public/spot it app icon.svg',
  './public/spot it header logo dark mode.svg',
  './public/spot it header logo light mode.svg',
  './public/spot it header map logo dark mode.svg',
  './public/spot it header map logo light mode.svg',
  './public/spot-it-app-icon-v2-180.png',
  './public/spot-it-app-icon-v2-192.png',
  './public/spot-it-app-icon-v2-512.png'
];

importScripts('./src/inspection-wakeup.js');
self.addEventListener('sync', event => {
  if(event.tag===SPOTITInspectionWakeup.TAG){
    event.waitUntil(SPOTITInspectionWakeup.notifyClients(self.clients,self.location.href));
  }
});

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
        names.filter((n) => n.startsWith('spotit-shell-') && n !== CACHE_NAME).map((n) => caches.delete(n))
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
  if(url.pathname.endsWith('public/calibration.json')){
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
