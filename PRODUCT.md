# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

SPOT IT is primarily for road inspectors working on-site, including NLEX inspection teams. Inspectors use a phone while travelling or stopping along the roadway to capture accurate, attributable defect records. Colleagues and supervisors may review or exchange exported inspection records.

## Product Purpose

SPOT IT is a mobile-first, installable road-inspection web app. It combines live GPS with network calibration data so an inspector can identify the current kilometer station, nearby bridge, direction, lane, and defect type; attach a photo; and retain a structured inspection log. Success means inspectors can record trustworthy field observations quickly, review their spatial context, and exchange complete records without re-entering data.

## Positioning

SPOT IT turns a device's live location into road-network inspection context—including kilometer station and nearby classified bridges—at the moment a defect is logged. It keeps that calibrated context, the photo, and provenance together through review, mapping, import, and export.

## Operating Context

- Used primarily on phones during roadway inspection, where controls must remain readable, compact, and easy to operate outdoors.
- Connectivity may be unreliable or unavailable. The installable PWA and cached calibration datasets support on-device use after assets have loaded.
- GPS and camera permissions are core to field capture.
- Inspectors can review entries in a log or as map markers, filter them by date, defect type, source, inspector, and bridge classification, and distinguish their own records from imported batches.
- Teams exchange inspections through SPOT IT Excel workbooks and Photos ZIP archives. Optional inspector names preserve attribution.

## Capabilities and Constraints

- Logs geotagged road defects with timestamps, coordinates, kilometer station, expressway/segment, bound, lane, type, notes, and an optional photo.
- Uses local calibration, ramp, and bridge datasets; bridge results can be filtered by classification.
- Shows the current position and inspection entries on a CARTO/OpenStreetMap-based map with light and dark basemaps.
- Stores the inspection log and preferences locally and stores photos separately in IndexedDB.
- Supports light and dark themes, responsive phone layouts, standalone PWA installation, and service-worker caching.
- Imports only supported SPOT IT `.xlsx` and `.zip` exports, validates them, preserves provenance, skips duplicates/conflicts, and can undo the latest import batch.
- Must preserve existing GPS, camera, storage, offline, import/export, and inspection behavior during interface work.
- Every deployed application change must bump the service-worker cache version and cache any new application assets.

## Brand Commitments

- Product name: SPOT IT.
- Preserve the current brand identity: the navy/orange SPOT IT palette, the SPOT IT mark and lockup (`spotit-mark.svg`, `spotit-logo-on-dark.svg`, `spotit-logo-on-light.svg`), and safety-color accents. The pre-2026-09-17 marks `KMTrack.png` and `KMTrack_logo.png` are retained but no longer used.
- Preserve the restored corner treatment: existing curved panels, a rectangular bottom navigation tray, and rounded selected-tab highlights.
- Interface language should be direct, compact, and practical for field work.

## Evidence on Hand

- Existing production interface and behavior: `index.html` and its companion CSS/JavaScript modules.
- PWA identity and platform description: `manifest.json`.
- Network and structure datasets: `calibration.json` and `bridges.json`.
- Product marks: `spotit-mark.svg` and the two `spotit-logo-on-*.svg` lockups, plus the PWA icon PNGs. `KMTrack.png` and `KMTrack_logo.png` are retained as prior-identity assets.
- Import/export contract and operational limits: `SHARING.md`.
- Working rules and process: `AGENTS.md`. There is no design baseline to
  preserve, and no separate radius rules file — both were retired on 2026-09-18.
- No testimonials, performance benchmarks, customer claims, or formal accessibility certification are established; future work must not fabricate them.

## Product Principles

1. Optimize for fast, low-friction capture in the field.
2. Keep location, road context, photo, and inspector provenance trustworthy and connected.
3. Remain useful with weak or absent network connectivity.
4. Preserve interoperability and data integrity when inspections move between colleagues.
5. Refine the established SPOT IT identity without disrupting proven inspection workflows.

## Accessibility & Inclusion

Controls and information must remain legible and operable across common phone sizes, in both light and dark modes, with clear touch targets, visible focus/state cues, semantic labels, and layouts that tolerate mobile safe areas.
