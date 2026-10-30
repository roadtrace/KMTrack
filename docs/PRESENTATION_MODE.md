# SPOT IT Presentation Mode

The presentation is built separately from the field app. It uses the current app interface, Guest capture, resolver, local editing, photo viewer and workbook exports. Synthetic positions enter through a substituted geolocation provider; no native location or camera is opened.

## Preview locally

Run `node scripts/presentation-server.cjs`, then open http://127.0.0.1:8790/. The app starts in an isolated Guest workspace with a presentation banner. Open Controls for the guided walkthrough, scenario selection, speed, pause, simulated GPS loss, sample evidence, link/QR sharing and demo reset. A paused journey continues emitting stationary fresh fixes so an inspection can still be demonstrated.

`node scripts/build-presentation.cjs` prepares `output/presentation-pages/`. No ZIP or deployment is performed. Publish that folder to its **own Cloudflare Pages project/hostname**, never over `kmtrack.pages.dev` or under the live site's path. The separate project uses the same repository and build command above, with output `output/presentation-pages`.

After publishing and verifying the demo, put its HTTPS URL in `src/presentation-config.js` to enable the live app's More > Presentation launch link. Until then the live app explains that its public demo link is pending; localhost offers a working local-preview link. The demo generates a QR for its actual URL; a localhost QR is explicitly labelled local-only.

## Isolation and honest demonstration

- All storage access is namespaced, including local/session storage and IndexedDB photo databases. A separate origin provides another boundary. Reset clears only that demo namespace and its photo store.
- Production auth configuration and Supabase SDK are excluded. Guest permissions remain real; no fake approval or scope is injected. The Sample team card and simulated submission animation are explicitly fictional and cannot upload anything.
- Fetch/XHR allow only GETs to the demo origin and the existing raster basemap hosts. WebSocket and beacon writes are blocked. Deployment headers further restrict connections, forms, camera, microphone and geolocation. No production worker is registered.
- Prepared scenarios select the app's existing Mainline/Interchange mode for a reliable walkthrough. Inspectors can turn its manual switch off to explore the real automatic engine. No resolver result, capture eligibility or KM value is fabricated directly.
- Category camera actions use a visibly labelled, code-drawn sample illustration. Photos use the real isolated IndexedDB store and existing stamp function. New records identify `DEMO - Guest inspector`; export filenames carry `DEMO_`.
- Sample Team records are kept separate from Guest inspections. Simulated sync never changes Guest records into genuine submitted records.

Street-map tiles need internet. The route overlay and local controls do not depend on third-party map tiles, but offline reload is not guaranteed; this build intentionally has no service worker. Rehearse on the presenter's actual iPhone and venue connection. Keep a screen recording as a backup.

Verification must use isolated browser contexts with denied device permissions, synthetic records and no production sign-in. Test capture/edit/photo/export, reset and independent audience sessions before sharing. Do not treat demo traces or sample records as research observations.
