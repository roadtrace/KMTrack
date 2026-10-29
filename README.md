# KMTrack / SPOT IT

Offline-first roadway inspection app with KM stationing, interchange selection, photographs, maps and exports.

## Repository map

- Root HTML, JavaScript and CSS: application and tests; existing paths preserved for static hosting and offline caching.
- Root JSON/GeoJSON: calibration, interchange and map datasets.
- `fonts/` and `vendor/`: bundled assets and licenses.
- `test-fixtures/`: synthetic test inputs.
- [Feature guides](docs/guides/README.md).
- [Implementation history](docs/history/README.md).
- `docs/supabase/`: historical backend snapshots; verify current state before backend work.

## Development

Read [AGENTS.md](AGENTS.md) first. Root planning references: [project context](PROJECT_CONTEXT.md), [architecture](SUPABASE_ARCHITECTURE.md), [implementation plan](IMPLEMENTATION_PLAN.md), [design](DESIGN.md), [product](PRODUCT.md).

Focused location checks (Node.js, repository root):

```sh
node --test manual-location.test.js capture-location.test.js stationing-review-integration.test.js stationing-review.test.js
```

Synthetic checks do not start real GPS or prove phone field behavior.
