# KMTrack project guidance

## Protect the function

- Preserve inspection logic, storage, exports, GPS and camera behaviour during
  visual changes.

## Process

- Bump `sw.js` for every deployed application change and cache new app assets.
- Run the tests before reporting done.
- Provide a prepared commit message. Do not commit or push unless asked.

## Design — there is no baseline to preserve

- **Redesign freely.** Colours, typography, radii, spacing, surfaces, layout and
  component shapes are all open. Nothing is frozen.
- `DESIGN.md` is **reference, not a spec**. It records architecture invariants,
  the data model, and traps that cost real time. It does not need to be honoured
  for visual work and does not need updating for visual changes.
- The Base44 / Replit export at `..\REPLIT_KMTrack\` is **not a target to match**.
  Treat it as prior art you may ignore.
