# Repository layout migration

29 October 2026, Asia/Manila.

142 tracked files moved into src/, public/, tests/, scripts/ and docs/. The tracked root now contains seven files: .gitattributes, .gitignore, AGENTS.md, README.md, index.html, manifest.json and sw.js.

## Hosting and data compatibility

Serve the repository root as before. There is no framework, dependency installation or build step. Asset URLs include src/ and public/ explicitly. Both site-root and /KMTrack/ hosting were exercised in isolated Chromium.

The service worker remains at sw.js with the same scope; its cache version is v251. The manifest remains at manifest.json with unchanged start_url and scope. Existing storage keys and application origin/base path must remain unchanged to retain installed-app identity and on-device records. This refactor does not transfer, export, clear or migrate inspection data.

GIS, calibration, image, font and vendor file bytes were compared against the pre-move working copies and are unchanged. Hash-verified GIS inputs keep LF checkout attributes at their new paths. Worker fetch URLs resolve relative to src/; page and CSS URLs were adjusted for their respective bases.

## Verification

- Layout verifier passed: HTML resources and inline syntax, service-worker shell, application CSS URLs, worker imports/data URLs, manifest identity and GIS SHA256 checks.
- Full tracked test suite before and after: 968 tests, 892 passed, 76 failed. Failure names match exactly; no additional failures. Existing failures remain work to address separately.
- Isolated browser tests passed at / and /KMTrack/: no page errors or HTTP failures; worker initialization, automatic interchange capture, manual Mainline/Interchange switching and matching snapshots; no horizontal overflow at 390px.
- Offline asset serving passed the service-worker integration check.
- Real GPS, camera, production/backend writes and real inspection storage were blocked during browser simulation. Physical phone behavior and production deployment were not verified.

Original working-copy backups, move inventory and detailed test/browser evidence remain local under output/structure-refactor-20261029/. Existing uncommitted work was preserved; untracked historical/local files were not deleted or folded into application source.
