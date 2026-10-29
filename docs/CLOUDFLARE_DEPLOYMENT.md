# Cloudflare Pages migration

Target arrangement: private GitHub source, public inspector-facing app, existing application authentication unchanged. Cloudflare hosting alone does not hide frontend JavaScript or GIS files delivered to browsers, or replace database access controls.

## Build configuration

Create a new Pages project for KMTrack; do not reuse the isolated experimental GPS Preview project.

| Setting | Value |
| --- | --- |
| GitHub repository | `roadtrace/KMTrack` |
| Production branch | `main` |
| Framework preset | None |
| Root directory | Repository root |
| Build command | `node scripts/build-cloudflare.cjs` |
| Output directory | `output/cloudflare-pages` |

The builder includes the runtime shell, calibration, required MapTiler assets and license notices. It preserves asset bytes, rejects unexpected output files, and does not deploy. Tests, documentation, Git metadata, local profiles, reports and inspection exports are excluded. No secrets are required to build; public browser configuration remains visible by design.

## Cutover sequence

1. Connect Cloudflare to this repository with the narrowest repository access available. Verify the generated site before changing the current hosting or repository visibility.
2. Verify current deployment hashes, service-worker assets, Mainline/Interchange behavior, photo workflow and authenticated access. Do not start GPS or use real inspection records during remote checks.
3. Check MapTiler allowed HTTP origins. The checked-in configuration describes a restriction to `roadtrace.github.io`; add the exact chosen Cloudflare origin while retaining the old origin through the transition. Do not remove origin restrictions.
4. Verify Supabase site/redirect settings for email confirmation and account flows against the new address. Preserve RLS, account approval, workspace isolation and existing transport gates.
5. Plan device-record transfer before cutover. `https://roadtrace.github.io/KMTrack/` cannot be hosted by Cloudflare. A new origin has separate local storage, photos, login sessions and installed-app identity. Existing records stay at the old origin; they do not move automatically. Use supported exports/imports and verify them before retiring the old origin. This document does not authorize exporting or clearing records remotely.
6. After the replacement is verified and the old-origin data transition is agreed, make the GitHub repository private and retire GitHub Pages as appropriate. Making a repository private may disable GitHub Pages depending on the account plan. Existing public clones and copies cannot be recalled.

## Current status

The user deployed https://kmtrack.pages.dev/ on 29 October 2026. Read-only HTTPS verification found all 86 public app assets exactly match committed source at e039593. The root page returns HTTP 200; no-cache applies to the root page and service worker, and the configured nosniff and referrer-policy headers are present. Requests for README.md, .git/config and a test file return the application HTML fallback rather than those files.

MapTiler initially returned HTTP 403 with "Key usage restricted" for the Cloudflare origin. The user subsequently confirmed the map works. The origin restriction fix has not been independently rechecked; preserve the existing key restrictions and old GitHub origin during the transition.

No GPS, sign-in, real inspection writes, repository visibility changes, DNS changes, or data transfer were performed during verification. Supabase email/account flows and phone field behavior remain unverified. Cloudflare dashboard access is still unavailable to this session. Retain the old site until the data and account transition is agreed.

## References

- [Cloudflare Git integration, including private repositories](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [Cloudflare static HTML hosting](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)
- [MapTiler API-key origin restrictions](https://docs.maptiler.com/guides/developer/credentials/api-key/)
