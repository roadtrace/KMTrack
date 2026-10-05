# Phase 14A.1 — scoped cloud record data layer and presentation merge

October 5, 2026 (Asia/Manila). Implemented only the approved read-data/projection increment. Not staged, committed or pushed.

## 1. Summary

Added guarded My/Team queries, memory-only paginated state and a pure UUID-based My presentation projection. Integrated module loading and immediate invalidation hooks; **no new UI consumes this store and no automatic read is scheduled**. Existing Phase 11 cloud panel remains unchanged. No Log/Team tab, Tools migration, cloud photo viewer, Map/export change, clustering, Realtime, schema/RLS/index change or live data write. Production photo transport remains disabled. Cache v237 loads/caches both new modules.

## 2. Backend read-only recheck

Fresh Supabase dashboard inspection of RoadTrace Pilot/main after connectivity was restored:

- `public.inspections` and `public.profiles`: RLS enabled, not forced.
- Inspection SELECT policies (no applicable ALL policy): authenticated permissive `is_admin()` and authenticated permissive `team = current_user_team()`.
- Profile SELECT: authenticated own `auth.uid() = id`; authenticated administrator `is_admin()`. Teammate names are not generally readable.
- Both anon/authenticated hold SELECT table grants; grants alone do not bypass RLS. No anon SELECT policy was present on these tables.
- Effective authenticated `public` schema USAGE and SELECT on both tables are true. EXECUTE on both read helpers is true.
- `current_user_team()` is STABLE SECURITY DEFINER with empty search_path and explicitly qualified `public.profiles`/`auth.uid()`, restricted to `approved = true`.
- `is_admin()` is STABLE SECURITY DEFINER with empty search_path; requires authenticated profile role administrator and approval true.
- Only btree UUID primary-key indexes exist: `inspections_pkey(id)` and `profiles_pkey(id)`. No team/owner/time compound indexes.
- `inspected_at` is nullable timestamptz; user_id/team and most display fields are also nullable. The data layer handles null times and nullable Team owner instead of demanding a schema change.
- Two **EXPLAIN without ANALYZE**, as dashboard postgres with synthetic predicates and four projected columns, showed Seq Scan -> Sort -> Limit. My estimate cost14.64, Team22.10..22.23. Planner cost units are not milliseconds. These do not execute inspection retrieval or measure authenticated RLS/API latency.

Existing permissions suffice for this read-only implementation. No required migration or weakening was found. Compound indexes may become useful at scale, but were neither required for correctness nor changed; a future performance migration requires separate approval.

## 3. Cloud record data model

`SPOTITCloudRecords.createStore({client, verify, context, key, online, now})` provides `load(view,{refresh})`, `snapshot(view)`, `syncScope()` and `invalidate()`.

Each collection contains retained pages, continuation cursor, hasMore, loaded/loading, generic error code, first/refresh time, revision and evicted-window flag. Snapshots contain detached frozen scalar rows, source flag `cloud_source`, view and a frozen scope identity tuple. `coverage` is loaded-pages or retained-window; counts represent retained data, not all team records.

Rows explicitly select the existing inspection columns plus updated_at. No profile joins or teammate-name promises. No image bytes, photo acknowledgements, session credentials or durable cache are added. Scope `token` means a serialized identity tuple, **not an Auth access token**. Never persist snapshots. Old references held by a consumer cannot be erased from that consumer; the future UI must discard them and use fresh-context projection on invalidation.

The instantiated store is dormant: no My/Team load at launch, verification, online or visibility in this phase. A new store/reload starts empty. Existing sync runner and Phase 11 reads continue independently.

## 4. Exact My query

After successful fresh online account/profile verification, matching getUser and full scope guards:

```js
client.from('inspections')
  .select(COLUMNS)
  .eq('team', scope.team)
  .eq('user_id', scope.userId)
  // .or(cursorFilter) on continuation only
  .order('inspected_at', { ascending: false, nullsFirst: false })
  .order('id', { ascending: false })
  .limit(51)
```

`COLUMNS` is exactly:

```text
id,created_at,user_id,team,inspected_at,defect_type,latitude,longitude,latitude_dmm,longitude_dmm,expressway,direction,lane_number,lane_other,km_station,interchange_exit,interchange_segment,photo_filename,photo_path,updated_at
```

My is current owner AND current assigned team, including administrator. No all-team owner history fallback.

## 5. Exact Team query

Same select/order/continuation/limit and authorization, with `.eq('team', scope.team)` only, without owner equality. RLS remains authoritative. Response rows must still have the exact requested team. Nullable legacy Team owner is allowed as read-only data; My rejects unowned rows. Administrator is explicitly narrowed to assigned team; no-team administrator cannot load either collection. No new write/edit permission is granted.

## 6. Pagination design

- Page50 plus one-row lookahead; hasMore derived without exact-count request.
- Order inspected_at DESC NULLS LAST, id DESC.
- Non-null cursor expression:
  `inspected_at.lt.T,and(inspected_at.eq.T,id.lt.UUID),inspected_at.is.null`
- Null cursor expression: `and(inspected_at.is.null,id.lt.UUID)`.
- The cursor is the last **consumed server row**, before cross-page display UUID dedup. Lookahead is not consumed.
- Timestamp cursor preserves PostgreSQL microseconds, normalizes offset to UTC and never truncates to milliseconds. Cursor values are validated; arbitrary filter text cannot be interpolated.
- Validate response size, scope, scalar fields, strict server order and forward cursor progress. Invalid page is never partially committed. Malformed/unsupported timestamps fail the page rather than skip records or guess cursor positions.
- Coalesce concurrent load-more for each collection. Explicit refresh supersedes older requests and atomically replaces pages on success; failed non-auth refresh retains prior valid pages with error metadata.
- Retain five pages/250 server rows per collection. Further load-more evicts oldest retained page while preserving continuation; coverage indicates the partial retained window. Duplicate UUIDs in overlapping pages display once, using the later page's observation.
- This is a changing dataset, not a transactional snapshot. Remote edits can move records across a cursor; delayed inserts above it require refresh. Refresh resets continuation/eviction. No offset pagination or fetch-all.

The pinned Supabase JS2.117.1 builder was exercised with intercepted fetch, proving GET filters, ordering and the precise continuation expression. Reference syntax: [order](https://supabase.com/docs/reference/javascript/order), [or](https://supabase.com/docs/reference/javascript/or), [limit](https://supabase.com/docs/reference/javascript/limit).

## 7. Scope invalidation rules

Cloud access requires online, approved freshly verified state, unlocked own bound workspace, matching Auth/profile/workspace UUIDs, recognized role, nonempty assigned team and explicit session/scope generations. Scope includes user, workspace owner/key, team, role and both generations.

Capture scope/epoch before verify; guard after verify, getUser and query awaits and before commit. New scope, invalid access or manual invalidate discards BOTH collections. Session invalidation, auth-render scope transitions, offline, auth/binding/identity/Guest storage events and reload immediately invalidate the store. Accessor/load also rechecks current scope. Same-account return cannot revive a request from an older epoch. Superseded refresh cannot overwrite newer data. Verification/getUser failures, HTTP401/403, RLS42501 and JWT errors clear both views. Out-of-scope response rows fail closed. Generic non-auth read failure retains only still-valid earlier data.

Server profile changes can be detected only on a subsequent verification; this adds no continuous permission monitoring. New cloud requests always reverify. The future UI must supply fresh context, not saved scope objects.

## 8. Presentation merge rules

`SPOTITRecordPresentation.projectMy({localEntries,page,context,workspaceKey,online})` derives fresh scope and calls the pure projection. Input localEntries must be **the currently unlocked account workspace**, never the Guest array. Bound local recording remains available offline/pending/verification-required with no cloud inclusion. Guest/locked/mismatched workspace exposes no account projection.

- Normalize UUID keys; one card per UUID, distinct local/cloud references, no entries mutation/copy-to-storage.
- Exclude imports/cloud-source local arrays, malformed local UUIDs and explicit other-owner local rows. Imported history stays a separately presented device archive in later UI.
- Keep local array insertion order; append cloud-only rows in server order. UI sorting remains future work.
- Acknowledged local with valid original snapshot, unchanged submitted content and no holds can choose current cloud display, retaining local/photo references.
- Divergent/held/unacknowledged/unmappable local stays device-primary with secondary submittedDetails reference.
- Duplicate local UUIDs give one device-primary card, retain localCopies and mark duplicateLocal; do not repair/overwrite either copy.
- Guest original and explicitly claimed copy remain distinct UUIDs; this projection performs no claim or identity assignment.
- Cloud-only cards are readonly. `readOnly` describes cloud display, not authorization to edit local data; existing action guards remain required.

## 9. Divergence handling

Metadata records localChanged/cloudChanged, field lists versus original submission snapshot, current local-vs-cloud field differences, unknown comparison, held/acknowledged flags and primary selection. Missing or invalid baseline/unmappable local is unknown, not equality. Local coordinate comparison remains exact; cloud comparison accommodates the existing 15-significant-digit PostgreSQL float serialization contract. Strict transport `matchesSnapshot` is unchanged.

Reused existing `submissionContent` as an exported pure mapping helper; it grants no permission and performs no write. It does not clear any hold or forge an approved role. The original snapshot and retry/reconciliation logic are untouched.

Photo-reference changes are separate metadata. Server photo path is not proof of bytes, required photo, upload success or a durable acknowledgement. Notes/inspector/local photo IDs/claim-review metadata remain explicitly local-only references. No merge result releases a hold, queues a write, edits snapshots or marks inspection/photo synced.

## 10. Performance results

Synthetic Node, 3 warmups +9 samples, exact-input preservation/card-count assertions, bounded loaded-cloud comparison:

| Local records | Loaded cloud | Median merge | Maximum sample |
| --- | --- | --- | --- |
| 100 | 100 | 7.04ms | 7.92ms |
| 1000 | 250 | 22.30ms | 28.76ms |
| 5000 | 250 | 21.00ms | 25.42ms |

Not monotonic timings are normal sampling/JIT noise; no linear field-time guarantee. UUID grouping is O(local + retained cloud); divergence mapping is limited to combined loaded records; snapshot cloud ordering is bounded at250. No repeated whole-workspace storage reads and no DOM/photo/network work in this benchmark. No mobile rendering/backend latency benchmark. Server limit bounds returned rows, **not scan cost**; primary-key-only backend can scan/sort the table. EXPLAIN figures above are estimates under postgres, not authenticated production timings.

Ignored reproducible script: `node output/playwright/phase14a1-benchmark.cjs`. Not an application dependency.

## 11. Test/check results

- Focused18-file regression **569 passed, zero failed/skipped/cancelled**, including62 new data/projection tests and prior507 safeguards.
- Pinned SDK actual query builder/fake network GET validation; timestamp ties/microseconds/nulls, cursor progress/lookahead/eviction/overlap, detached rows, scope transitions at async boundaries, offline/no-team/admin/Supervisor, same-account return, auth denial, refresh races, holds/divergence/duplicates/photo non-ack and no-write contracts.
- Syntax29 application JS +2 inline scripts passed; new module/test syntax passed. Final whitespace diff check passed.
- Additional eight-file legacy preservation set:37 pass/16 fail out of53. Independently extracted committed HEAD eb56f72 into ignored baseline and ran identical set:37 pass/16 fail, identical16 failing titles. No new failing test. Existing styling/export/GPS/map test debt was not repaired outside scope. **Do not call full suite passing.**
- No physical browser/mobile/UI/live account read matrix was performed for this data-only increment. No preserved profiles reopened.

## 12. Backend contact

Exactly two catalog SELECT statements and two EXPLAIN without ANALYZE through existing authenticated dashboard postgres access. Catalogs: pg_class, pg_policies, pg_indexes, pg_proc/pg_namespace, information_schema grants/columns and has_*_privilege functions. Synthetic predicates only in plans; no inspection/photo contents retrieved. Audit tab closed; dashboard can retain SQL query history/private snippet metadata.

Zero app inspection SELECTs against the live backend in validation; SDK test intercepted all requests. Zero inspection INSERT/PATCH/DELETE, Storage requests, profile changes, migrations, grants/policies/index alterations or Realtime activation. No credentials copied to new files/storage. No test fixture recovery/cleanup.

## 13. Remaining 14A.2 prerequisites

Separate approval for My Log UI/status/sorting/detail integration and integration tests. Use fresh-context projectMy and discard old snapshots on invalidation; preserve existing local actions/export/Map and offline account behavior. Validate second-device own reads/Team scope denies with approved disposable accounts in isolation before claiming end-to-end UI readiness. Legacy imported archive, missing teammate names and unknown photo-required semantics remain design constraints. Cloud photo viewing, Team tab/Tools migration, clustering, Realtime, remote exports and backend performance migrations remain separate scope.

## 14. GitHub Desktop handoff

Commit message: **Add scoped cloud record data layer and My presentation merge**

Description: Add fresh-authorized current-team My/Team read pages with microsecond-safe nullable keyset cursors, memory-only bounded state and full scope invalidation. Add pure UUID presentation merge and divergence metadata without changing local records or transport safeguards. Cache assets at v237 and document read-only backend audit, focused validation and existing legacy baseline failures. Leave UI, photos, Map, exports, Realtime and backend settings unchanged.

CHECK these14 files only:

- cloud-records.js
- cloud-records.test.js
- record-presentation.js
- record-presentation.test.js
- inspection-api.js
- index.html
- sw.js
- foreground-sync.test.js
- guest-claim.test.js
- photo-pilot.test.js
- photo-sync.test.js
- preapproval-review.test.js
- sync-runner.test.js
- PHASE14A1_SCOPED_CLOUD_RECORDS.md

UNCHECK unrelated AGENTS.md, .codex/, references/ and all ignored output/profiles/logs/baseline archive/scripts. Source/report changes are local and unstaged; user handles commit/push. Stop after14A.1.
