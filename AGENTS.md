# SPOT IT project guidance

## Protect the function

- Preserve inspection logic, storage, exports, GPS and camera behaviour during
  visual changes.

## Process

- Bump `sw.js` for every deployed application change and cache new app assets.
- Run the tests before reporting done.
- Provide a prepared commit message. Do not commit or push unless asked.
- When the user says "handoff" or asks for a new-session continuation prompt, use the global `$handoff` skill at `C:\Users\moise\.agents\skills\handoff\SKILL.md` in the current KMTrack repository.
- For KMTrack handoff requests, the only file to create or replace is `.codex/HANDOFF.md`, unless the user explicitly authorizes other changes. Preserve all existing uncommitted work and inspection data. Do not modify application source, tests, configuration, other documentation, or user data merely to prepare a handoff; do not run live write or destructive operations. Do not stage, commit, push, reset, revert, discard, or clean Git changes. Prior approval for one action does not approve a new or broader action.
- In handoffs, distinguish verified facts and completed work from plans and uncertainty. Local/static checks do not prove browser, device, backend, or production behavior. The next session must read applicable `AGENTS.md` instructions and `.codex/HANDOFF.md`, independently verify repository and Git state, preserve uncommitted work, and resume pending work without restarting completed work; ask before expanding approved scope.

## Design — there is no baseline to preserve

- **Redesign freely.** Colours, typography, radii, spacing, surfaces, layout and
  component shapes are all open. Nothing is frozen.
- `docs/DESIGN.md` is **reference, not a spec**. It records architecture invariants,
  the data model, and traps that cost real time. It does not need to be honoured
  for visual work and does not need updating for visual changes.
- The Base44 / Replit export at `..\REPLIT_KMTrack\` is **not a target to match**.
  Treat it as prior art you may ignore.

## Supabase / offline-first project handover

Before working on authentication, database, photos, permissions, or sync, read `docs/PROJECT_CONTEXT.md`, `docs/SUPABASE_ARCHITECTURE.md`, and `docs/IMPLEMENTATION_PLAN.md`. These document decisions from earlier planning and security testing; verify actual code and live backend state before implementation. Phase 10 Supabase authentication is complete (implementation commit `2571c4f`); Phase 11 inspection data connection is next. Do not treat the current sync queue as an active inspection/photo transport. Keep service-role keys and passwords out of browser assets, logs, commits, and documentation. Preserve local-first field recording and existing GPS/KM/map/camera/export behavior. Present a plan and wait for approval before substantial edits; never commit or push unless asked. Follow this file's existing cache-bump, test, and commit-message instructions.
