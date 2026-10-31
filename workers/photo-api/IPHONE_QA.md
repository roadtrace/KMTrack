# iPhone pilot acceptance checklist

Status: device pilot underway. The main application's R2 flag remains disabled.

## Reported device results — 2026-10-31

User confirmed the anywhere device screen uploaded a photo, privately displayed
the submitted photo, and retained the locally saved photo after airplane-mode
reload. These are user-reported phone results, not an agent-observed capture.
The device screen uses an existing inspection reference and does not insert or
edit inspection rows. No synthetic GPS is needed.

Remaining device gate: attempt a fresh test photo upload while offline, restore
connectivity, reconnect the account, and retry after any displayed backoff.
Confirm private viewing succeeds afterward and the original stays local.
Mid-upload interruption across app closure remains separately unverified.
Do not clear site data or delete originals for these checks.
The standalone `/pilot` console generates synthetic images; it does not test the
app's camera, local persistence, or offline retry. Do not treat console success
as completion of this checklist.

## Entry conditions

- Confirm scheduled deletion acknowledgements and absence of the approved test
  pair in R2. Keep production photos and existing legacy references unchanged.
- Prepare an isolated HTTPS app pilot with the existing test Worker and explicit
  pilot flag. Authorize only its exact origin; do not widen CORS to wildcard.
- Use an approved test inspector and a designated disposable inspection. Do not
  create fictional records in normal research/operational statistics.
- Preserve originals on the phone. Do not clear Safari website data to simulate
  interruption: that destroys the local evidence this test is meant to protect.

## On-device checks (user operates the iPhone)

1. Capture a non-sensitive test image. Confirm it opens locally before uploading.
2. With airplane mode on, reopen its details: local image must remain viewable;
   an upload attempt must report pending/failure without claiming completion.
3. Restore connectivity and retry explicitly. Confirm one current photo, correct
   orientation, legible details, and a working thumbnail/full image.
4. On a fresh test capture, interrupt connectivity during upload, reopen the app,
   and retry. Confirm the same intent recovers without duplicate current photos.
5. After successful upload, reopen the app and view the private photo online.
   Check that the original remains available locally offline.
6. Check portrait/landscape and light/dark modes. Record iPhone model, iOS version,
   Safari versus installed PWA, observed result, and any error text (no tokens).

Removal/replacement testing requires a clearly designated disposable photo and
confirmation before permanent deletion. Physical deletion is checked separately
after the grace period; a hidden photo alone is not proof of storage erasure.

Do not enable production transport until cleanup and on-device checks pass.
