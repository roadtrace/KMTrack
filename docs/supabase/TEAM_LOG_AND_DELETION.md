# Team Log summary and permanent deletion

The user reported successfully applying this migration on 30 October 2026. Live permissions and production behavior have not been independently verified by the agent.

## Release order

1. Run `migrations/20261030_team_log_and_deletion.sql` in the project's Supabase SQL Editor. This is a **new migration**, separate from the already applied owner-name migration.
2. Publish the app update after the migration succeeds. No deployment or database changes were performed while preparing this feature.
3. Verify on two approved test accounts: Team totals, inspector selection, date filtering, automatic next-page loading, and denial of colleague deletion. Use explicitly disposable test inspections for the live deletion check.

The SQL transaction adds summary/page functions and an own-record deletion function. It does not grant ordinary profile access or general inspection DELETE permissions. All functions check the authenticated profile on the server. Guest, unapproved and cross-team callers cannot read the Team dataset. The admin read scope stays limited to their assigned team, matching this app's current Team view.

## Record browsing

The Team landing screen groups all submitted inspections by owner and includes current approved inspectors/supervisors with zero submissions. Historical owners and legacy ownerless records remain counted and labelled separately. Totals come from the database, not loaded pages. They are a query snapshot rather than a real-time subscription.

Selecting an inspector or applying any other filter requests matching records online. Filtering and total counting happen in PostgreSQL, including Philippine calendar date boundaries. Each network response contains at most 50 inspections; further pages load when the user scrolls near the end. Keyset pagination preserves microsecond timestamps, timestamp ties and null dates. The list keeps earlier pages during that browsing session. No Team records are written to localStorage or IndexedDB. The existing Map read store remains separate.

Opening Team records refreshes the summary. Returning to the app after a minute refreshes the visible Team view. No normal manual refresh/load-more controls are shown. Failed requests provide a retry action, and the next-page control has a fallback for browsers without IntersectionObserver. The optional local inspector identity is still available for Guest/device records and exports.

## Permanent deletion

An approved inspector or supervisor may permanently delete only their own submitted inspection in their current team. The app offers the action in submitted details and on a submitted local record's view screen. It requires an explicit irreversible confirmation. The server re-checks the caller and ownership, locks the row, and deletes it atomically. Colleagues and administrators receive no new engineering deletion privilege. Bulk/device deletion remains local-only.

A private deletion receipt retains only inspection UUID, owner UUID, team and deletion time. It contains no defect, location, photo or inspection content. Its purpose is to make lost-acknowledgement retries idempotent and reject an old device trying to re-insert the same UUID. The app does not create an audit view for these receipts and clients cannot read them directly.

After an acknowledged deletion, the matching own record is removed from the active local workspace, and this app instance invalidates its My/Team/Map cloud views. A local persistence failure is reported separately from server success; the receipt still prevents re-submission. Offline copies on other devices cannot be remotely erased. Existing uploaded photo objects are not deleted by this SQL: secure storage cleanup requires a separately authorized storage operation; deleting storage metadata directly is not a substitute. Existing photo access policies are preserved.

## Verification

- `node --test tests/team-log.test.js tests/cloud-records.test.js tests/team-records.test.js tests/my-records.test.js tests/log-register.test.js tests/presentation.test.js tests/stationing-review-integration.test.js tests/team-workspace.test.js tests/inspection-sharing.test.js` — 152 tests passed.
- Mobile browser check used the real app with an isolated fake SDK, ephemeral storage, denied native device permissions and no live backend. Verified summary counts, zero-count inspector, automatic 50+15 pages, inspector/date controls at 390/320 widths, both themes, no duplicate actions, peer-deletion denial, cancelled confirmation and acknowledged own deletion.
- `node tests/team-log-sql.cjs` ran the actual migration twice in a synthetic PostgreSQL database. Checked role grants, profile isolation, team totals, zero counts, historical/null owners, 50+14 pages, microseconds/null dates, Philippine dates, search, own-only deletion, retry idempotence, anonymous/pending/admin/peer denial, and blocked re-insertion.
- Local SQL test engine: PGlite 0.5.3, installed only under ignored `output/team-log-qa-pg/`. No runtime dependency added. Repository: https://github.com/electric-sql/pglite. Dual Apache 2.0/PostgreSQL license; latest upstream commit checked `a197da04ffd5a04a944d7ee28a41a94c3d899b35`, 28 October 2026. Node 24 successfully ran the test. Set `KMTRACK_SQL_TEST_ENGINE` to a separately installed module path to repeat elsewhere.

Live schema/policies have not been independently inspected in this session. The local test schema follows the repository's documented table columns and authorization model; it does not prove live hosting, Safari rendering, or production database behavior. Rehearse the filter sheet on an actual iPhone after release.

The implementation follows the schema-qualified functions, restricted grants and transaction guidance in [Supabase database functions](https://supabase.com/docs/guides/database/functions) and [PostgreSQL CREATE FUNCTION](https://www.postgresql.org/docs/current/sql-createfunction.html).
