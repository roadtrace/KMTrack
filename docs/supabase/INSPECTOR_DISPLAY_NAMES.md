# Inspection owner display names

Run migrations/20261030_inspection_owner_names.sql in the project's Supabase SQL Editor, then refresh Team records after publishing the app update.

The function returns only inspection ID, owner ID and the owner's current profile full_name for up to 50 requested inspection IDs. Approved inspectors/supervisors are limited to their assigned team's inspections; approved administrators can read across teams, consistent with documented inspection visibility. Guests, signed-out and unapproved callers get no names. Existing profile policies remain unchanged. This is a current profile display name, not a historical name snapshot.

The app performs a GET RPC after reading each authorized inspection page. It validates both returned IDs, holds names only in the scoped in-memory record store, and rejects late results after scope changes. Name lookup failure leaves inspections readable. For own records, the verified own profile is a fallback; saved local inspector text is used only when no profile name is available. No owner ID is inferred from the local Inspector identity field.

The user reported successfully applying this migration on 30 October 2026. The agent has not independently verified live execution or permissions; no backend administration connection was available. Verify two approved colleagues can see each other's inspection owner names and that unapproved/cross-team callers receive no rows after deployment. Do not change RLS to enable this feature.
