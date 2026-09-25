# SPOT IT project guidance

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

## Supabase / offline-first project handover

Before working on authentication, database, photos, permissions, or sync, read `PROJECT_CONTEXT.md`, `SUPABASE_ARCHITECTURE.md`, and `IMPLEMENTATION_PLAN.md`. These document decisions from earlier planning and security testing; verify actual code and live backend state before implementation. Phase 10 Supabase authentication is complete (implementation commit `2571c4f`); Phase 11 inspection data connection is next. Do not treat the current sync queue as an active inspection/photo transport. Keep service-role keys and passwords out of browser assets, logs, commits, and documentation. Preserve local-first field recording and existing GPS/KM/map/camera/export behavior. Present a plan and wait for approval before substantial edits; never commit or push unless asked. Follow this file's existing cache-bump, test, and commit-message instructions.
