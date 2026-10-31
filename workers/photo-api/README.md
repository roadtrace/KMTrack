# Photo API test Worker

Steps 7–10 implementation, live migration/deployment status, setup and verification
are documented in [OPERATIONS.md](OPERATIONS.md). That document supersedes the
initial authorization-only notes below. The user will add the encrypted server
credential; it has not been copied, read or configured by the agent.

## Historical Step 5 deployment

Target: `spotit-photo-api-test.mmatriano19.workers.dev`.
Deploy `worker.mjs` as an ES module in the existing test Worker. Keep the existing
`PHOTOS_BUCKET` binding pointed at the test bucket; this stage never accesses it.
No dependencies, secrets, database migration, or service-role key are needed.
The embedded Supabase publishable key is the same public configuration already
shipped by the app. This file is server source, excluded from the app build.

- `GET /health`: public readiness/stage information; never proves authenticated access.
- `GET /v1/inspections/{UUID}/permissions`: validates the bearer JWT through the
  project's Auth `/user` endpoint, then reads the current profile and inspection
  through the caller's JWT and existing RLS. Returns capability booleans only.
- All upload, download, signing, deletion and database mutation routes are absent.
  `can_attach` is a permission decision, not an upload grant. Transport remains false.
- Approved inspectors/supervisors view their team and can attach only to their own
  inspection. Approved administrators view only records returned by their existing
  SELECT policy; they cannot attach. Anonymous Auth users, unapproved profiles,
  invalid sessions and unassigned field users are rejected.
- Exact browser origins: `https://kmtrack.pages.dev` and `https://roadtrace.github.io` (the installed GitHub Pages app). Demo, arbitrary previews and
  localhost origins are rejected. Requests without Origin still require a valid
  bearer session; CORS is not authorization. Credentials never go in query strings.
- Responses are no-store. No tokens, profile names, locations or upstream errors
  are logged or returned. Upstream failures fail closed. Capabilities are not
  cached; future upload/download endpoints must call the guard again themselves.

Run: `node --test tests/photo-worker.test.mjs`.

Before enabling photo operations, implement the metadata/reservation protocol,
size/content validation, idempotency, finalization and cleanup separately. A
permissions response alone must never authorize a later unchecked R2 operation.
Do not enable the browser app's photo transport as part of this step.

Verification status (2026-10-30): 19 local synthetic authorization tests pass.
Deployed through the Cloudflare dashboard to the test Worker, active version
`f0c4eb61`; confirmed `PHOTOS_BUCKET` points at `spotit-inspection-photos-test`.
Live browser checks: `/health` reports `authorization-only` and transport false;
the permissions endpoint without a bearer session returns `session_required`.
Signed-in/real RLS verification remains pending before enabling photo operations.
No production app, bucket content, or database changes were made for this stage.

References: [Supabase JWT validation](https://supabase.com/docs/guides/auth/jwts),
[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
