# KMTrack / SPOT IT

Offline-first roadway inspection app with KM stationing, interchange selection, photographs, maps and exports.

## Repository map

- `src/`: application JavaScript modules and styles.
- `public/`: GIS/calibration datasets, images, fonts and bundled vendor libraries.
- `tests/`: tests, synthetic fixtures and test helpers.
- `scripts/`: development and verification tools.
- `docs/`: architecture, planning, [feature guides](docs/guides/README.md) and [implementation history](docs/history/README.md).
- `index.html`: application entry page.
- `sw.js` and `manifest.json`: root-scoped offline/PWA configuration.

## Development

Read [AGENTS.md](AGENTS.md) first. References: [project context](docs/PROJECT_CONTEXT.md), [architecture](docs/SUPABASE_ARCHITECTURE.md), [implementation plan](docs/IMPLEMENTATION_PLAN.md), [design](docs/DESIGN.md), [product](docs/PRODUCT.md).

No install or build step is needed. Static hosting serves this repository root; keep the same origin and base path to preserve existing on-device records and installed-app identity. The directory named `public` is part of each asset URL, not a framework build directory.

Run focused checks with Node.js:

```sh
node --test tests/manual-location.test.js tests/capture-location.test.js tests/stationing-review-integration.test.js tests/stationing-review.test.js
node scripts/verify-layout.cjs
```

Run all tracked tests with `node scripts/test.cjs`. Historical failures exist; [the structure migration report](docs/REPOSITORY_LAYOUT.md) records the before/after comparison.

For isolated UI simulation, run `node scripts/dev-server.cjs 8787` and open the printed localhost URL. This launcher blocks real GPS, camera, persistent storage and external/write transport. Never use simulation results as proof of phone field behavior.
