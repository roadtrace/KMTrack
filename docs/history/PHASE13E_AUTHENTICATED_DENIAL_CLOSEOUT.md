# Phase 13E authenticated denial closeout

Validated October 3, 2026 (Asia/Manila). **PHASE 13 — PILOT-READY ON VALIDATED DESKTOP BROWSER PATH.** Production photo transport remains disabled. This report supplements PHASE13E_PHOTO_LIVE_VALIDATION.md; it does not erase historical limitations or activate any transport. Stop after closeout; no Phase 13F or Phase 14.

## Baseline and authorization

Read applicable parent/repository AGENTS.md, .codex/HANDOFF.md, project context/architecture/implementation plan and Phase 13E/13C/13D/12 final reports. Independently verified main ec01db3c11e965b160267981f0e99337bfd1222b and read-only GitHub ls-remote confirmed the same pushed main. Source and both isolated browser caches are v234; production gate is false. Preserve unrelated AGENTS.md, .codex/ and references/ work. No staging/commit/push.

User authorized authenticated denial validation against a preserved disposable Phase 13E fixture, with a different authenticated identity whose denial is clearly enforced if an approved different-team account is unavailable. New isolated Edge sessions phase13e-closeout and phase13e-authorized use localhost:8785. All database/Storage writes were blocked except one single-use fixture PATCH and one single-use non-overwriting disposable Storage POST. Auth/profile reads were allowed. Local workspace mismatch protection remained locked; no rebinding or record access was needed for denial SDK requests.

Initial sign-in was the fixture owner's UUID, currently approved Inspector / ams. It was rejected as the separate-identity test, and no mutation probe ran under it. Its profile team differs from the earlier core-validation roadway state. The agent changed no profile, role, approval or team. User then signed in a distinct test identity. Its initial profile was pending / team null; a read returned zero rows and private download returned HTTP400/NoSuchKey, zero bytes. Before mutation probes a fresh profile showed approved=true / team null. This final state is recorded exactly: authenticated approved Inspector with NO assigned team, not an approved different-team account and not a pending account at mutation time. Current helper returns null team, so equality to roadway is false/unknown and access is denied. Profile changes occurred outside agent actions; no profile mutation was performed by this validation.

## Fixture and authenticated identities

- Inspection: 07034a34-1832-4cc2-8514-c6cce644244b, PHASE 13E PHOTO SUCCESS - DO NOT DELETE.
- Owner: 8f590a6a-db13-4c75-8fb8-df9c1786d47c; inspection team: roadway.
- Filename: photo-v1-3e790b2e91e748590afc18c1c1b730bcd0b17f7ff6b27b8fca11d3eb36fd3415.jpg.
- Private object: roadway/07034a34-1832-4cc2-8514-c6cce644244b/photo-v1-3e790b2e91e748590afc18c1c1b730bcd0b17f7ff6b27b8fca11d3eb36fd3415.jpg.
- Denial identity: b5ad1bee-16b6-457a-9ce2-06a94afe691e, Inspector, approved=true, team=null at mutation probes; authenticated getUser and fresh profile verified.
- Authorized verifier: 6e2d9223-b699-43fa-ac3f-0d5a8e308f84, approved roadway Inspector, distinct from owner. Its successful download directly confirms intentional same-team read.
- Baseline/final object: 7663 bytes; full SHA-256 3e790b2e91e748590afc18c1c1b730bcd0b17f7ff6b27b8fca11d3eb36fd3415.

## 1. Authenticated metadata denial — PASS

PATCH /rest/v1/inspections contained only photo_filename/photo_path with the existing values, filtered by exact UUID/owner/team and equality to both existing photo values. HTTP200, zero affected rows, no error. Authorized full-row reread was JSON-identical to baseline, including updated_at. No mutation occurred.

Deliberately did NOT use null/null predicates against the already reserved fixture: that would return zero even for an authorized updater and would be inconclusive. Existing-value predicates matched the authorized baseline, so they did not independently exclude the row. Setting identical values was the safe permission probe; a returned row would have triggered STOP, without intentionally repointing the legitimate object. A new null/null reservation fixture was not created.

## 2. Authenticated Storage upload denial — PASS

POST /storage/v1/object/inspection-photos/roadway/07034a34-1832-4cc2-8514-c6cce644244b/phase13e-closeout-denied-20261003.jpg used a 759-byte synthetic JPEG, contentType=image/jpeg and x-upsert:false. HTTP400, AccessDenied, message new row violates row-level security policy. No object created. No existing object overwrite attempt, Storage UPDATE or DELETE.

The safer alternate filename retains the required team/inspection folder structure and does not target the legitimate existing object. Live policy additionally requires exact row.photo_path, so this probe establishes denial under the full policy, not isolation of the owner predicate from every other predicate. The owner-only requirement is independently confirmed by fresh live catalog inspection below. No reservation was changed to make an alternate path admissible.

## 3. Authenticated private read denial — PASS

The same final authenticated approved/no-team identity downloaded the existing exact private path using the SDK authorized client: GET HTTP400, NoSuchKey, zero photo bytes. Earlier pending state produced the same result. Authorized roadway client downloaded the existing object before and after, with matching size/full hash. This is masked denial, not proof of absence. No public URL or signed URL workaround.

## 4. Owner / team policy confirmation

Fresh SELECT-only dashboard pg_policies/pg_proc inventory before and after probes verified all effective inspection and storage.objects policies, helper definitions and fixture object catalog:

- Storage INSERT: inspection.user_id = auth.uid(), inspection.team = current_user_team(), team/UUID folder match, exact inspection.photo_path = object name, private bucket, and approved Inspector OR Supervisor helper.
- Approved Inspector can upload its own matching inspection photo; approved Supervisor can upload its own matching inspection photo. Supervisor cannot upload teammate-owned photo even though inspection UPDATE permits supervisor/team metadata edits. These role statements derive from the live rule; new Supervisor writes were not performed.
- Storage SELECT follows the exact referenced inspection visible through inspection RLS. Approved team members may read teammate photos. Cross-team/no-team/non-approved identities have no team visibility; administrators have inspection SELECT through is_admin.
- Inspector metadata UPDATE requires owner and current team; Supervisor UPDATE requires current team. Only Storage INSERT/SELECT policies exist, no UPDATE/DELETE/ALL policies.
- current_user_team reads the authenticated profile team with approved=true. No-team approval does not grant roadway access.
- No schema, RLS, helper, Storage setting, role or app architecture change by the agent; no service-role key.

## 5. Network / backend evidence

All denial attempts target inspection 07034a34-1832-4cc2-8514-c6cce644244b / roadway, with final identity category authenticated approved Inspector/no assigned team unless noted.

| Operation | HTTP / result | Row changed | Object created | Photo bytes returned |
| --- | --- | --- | --- | --- |
| Initial pending fixture SELECT | GET200 / zero visible rows | No | No | 0 |
| Initial pending private download | GET400 / NoSuchKey | No | No | 0 |
| Guarded existing-value photo metadata update | PATCH200 / zero affected rows | No | No | 0 |
| Disposable alternate-path upload | POST400 / AccessDenied RLS | No | No | 0 |
| Exact private photo download | GET400 / NoSuchKey | No | No | 0 |
| Authorized baseline/final row reread | GET200 / matching complete row | No | No | N/A |
| Authorized baseline/final private download | GET200 / full hash match | No | No | 7663 each |

Final SELECT-only catalog: one inspection row, exactly one object under target inspection folder, identical object ID cfb78b51-92a2-40a9-82ab-861b8bcd5e73, metadata/ETag/size/lastModified unchanged. Therefore alternate probe object count zero. Zero Storage UPDATE/DELETE, zero inspection INSERT/DELETE, zero successful database/Storage mutations. Guards closed both single-use allowances in finally. Ignored harness scripts and regression TAP are under output/playwright/phase13e-closeout-*. No credentials/tokens recorded in this report; never stage private browser/CLI logs.

## 6. Fixture integrity — PASS

Authorized complete row unchanged including timestamps and photo metadata; authorized private bytes/hash unchanged. Catalog row count1/object count1 before/after and no alternate object. All preserved Phase 13 fixtures remain intact; no cleanup.

## 7. Remaining unverified items

Physical mobile/camera/GPS and installed PWA field validation; published v234 runtime; broader actual device/network failures, exhaustive background-tab/concurrency, quota/readback and live source-divergence/attempt-exhaustion scenarios remain pilot follow-up. Approved distinct non-null different-team identity and authenticated Supervisor owner-versus-teammate upload execution were not tested in this closeout. Live no-team authenticated fallback and policy inventory satisfy the explicitly permitted unauthorized-identity closeout path. Full suite not rerun; historical legacy surface failures remain documented. Production transport stays disabled.

## 8. Phase 13 final status

**PHASE 13 — PILOT-READY ON VALIDATED DESKTOP BROWSER PATH.** Core desktop success/recovery/locking/claim evidence plus authenticated unauthorized metadata/upload/read denials and authorized fixture integrity satisfy this closeout. This is bounded desktop readiness, with physical mobile/PWA field validation and broader device/network scenarios pending. No production activation or Phase 13F/14 work.

## 9. Tests / checks

Focused 14-file regression rerun: 479 tests, 479 passes, zero failures/skips/cancellations. Existing application source unchanged, cache v234 and disabled gate independently verified. Final git diff --check passed; report whitespace check passed. No app-code or test-source change.

## 10. GitHub Desktop handoff

Only new reviewable file: PHASE13E_AUTHENTICATED_DENIAL_CLOSEOUT.md. Commit title: Document authenticated Phase 13E denial closeout. Description: Record distinct authenticated no-team metadata/upload/private-read denial, fresh owner/team policy confirmation, unchanged authorized fixture and bounded desktop pilot readiness. Select only this report; leave unrelated AGENTS.md, .codex/ and references/ unselected. Ignore harness/profile/log artifacts. Agent did not stage, commit or push. Test-only windows closed after verification; original user windows/fixtures preserved. Browser route guards are ephemeral and must be recreated for any newly authorized live work.
