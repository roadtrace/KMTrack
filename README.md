<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/spot%20it%20header%20logo%20dark%20mode.svg">
  <img src="public/spot%20it%20header%20logo%20light%20mode.svg" alt="SPOT IT" width="300">
</picture>

# Road observations. In context.

**KMTrack ? SPOT IT** is a mobile-first roadway inspection app that brings location, kilometer stationing, defect records, and photo evidence into one field workflow.

**Offline-first ? Installable PWA ? GIS-aware capture ? Structured exports**

[Features](#built-for-field-inspection) ? [Field workflow](#from-roadway-to-record) ? [Run locally](#run-locally) ? [Documentation](#documentation)

</div>

---

## Built for field inspection

Roadway inspections happen where connectivity is inconsistent and location alone is not enough. SPOT IT combines device GPS with calibration and GIS datasets to help inspectors record **what they observed, where it belongs, and the evidence behind it**.

Designed around NLEX roadway inspection, the app keeps records on the device, supports review in a log and on a map, and exports inspections for sharing and reporting.

| Capability | What it does |
| :--- | :--- |
| **Mainline & Interchange modes** | Inspector-controlled location selection: calibration-based KM for Mainline, or the nearest available interchange GIS line for Interchange. |
| **Defect capture** | Record defect type, lane, direction, coordinates, time, road context, notes, and inspector attribution. |
| **Photo evidence** | Capture inspection photos with location metadata, with single-shot review and continuous lane-based capture workflows. |
| **Inspection log** | Review, search, and filter records without losing their location and provenance. |
| **Map context** | Inspect record locations alongside interchange and bridge information, with light and dark basemaps. |
| **Offline operation** | Cache the application and supporting assets; retain records locally and photos in IndexedDB. |
| **Import & export** | Exchange supported SPOT IT Excel workbooks and Photos ZIP archives, with validation, duplicate/conflict handling, and import-batch provenance. |
| **Account & team views** | Guest/local recording and account-aware workflows, with authorized My/Team record views where available. |

## From roadway to record

1. **Open the app and allow location access.** Load the app and datasets online before relying on offline operation.
2. **Choose the road context.** Select **Mainline** for KM stationing or **Interchange** for the nearest GIS interchange. The selection is remembered; nearby interchange alternatives are offered when available.
3. **Record the observation.** Choose a defect and lane, confirm direction, and optionally attach a photo. Capture uses the selected location for both the record and photo metadata.
4. **Review the inspection.** Use the log and map to check records and their spatial context.
5. **Export or exchange records.** Export device records, optionally with photographs, or import supported SPOT IT exports from colleagues.

> **Location integrity:** a manual mode selects the type of road context; it does not bypass fresh-GPS checks. Mainline captures store KM stationing. Interchange captures store the interchange and segment with KM left blank. GIS proximity and calibration estimates do not establish surveyed accuracy, physical carriageway, legal access, or engineering connectivity.

## Offline by design

The application shell is cached by a service worker. Inspection records and preferences are kept in browser-local storage; photographs are stored separately in IndexedDB.

- **Guest/local mode** supports on-device field recording without requiring an account.
- **Offline capture** remains dependent on previously loaded assets, available datasets, and a usable GPS fix.
- **Online features** such as authentication, authorized history, and basemap requests need connectivity when their resources are not already available.
- **Exports cover device records.** Loaded cloud/team history is a separate view and is not automatically included in device exports.

**Keep the same origin and browser profile.** Browser data is tied to its origin; a new hostname, cleared site storage, or another browser does not carry inspections across automatically. Export important device records before changing devices or clearing storage.

Cloud availability is not a substitute for a device backup. Photo transport is currently disabled in the application; do not assume locally captured photographs have been uploaded.

## Run locally

SPOT IT uses **plain JavaScript, HTML, and CSS**. There is no framework build step or package installation requirement for the application.

### Isolated development preview

With Node.js installed, run from the repository root:

```sh
node scripts/dev-server.cjs 8787
```

Open the localhost URL printed by the launcher.

This preview runs the actual interface with **simulated location inputs**. It blocks native GPS, camera access, persistent storage, and external/write transport, making it suitable for UI checks without touching field records. It is not a live field-capture server.

### Static hosting

Serve the **repository root** over HTTPS for normal application use. Keep these paths together:

```text
index.html
manifest.json
sw.js
src/
public/
```

The `public/` directory is part of the asset URLs and is served directly. Hosting only `public/` will not serve the app. Both site-root and repository-subpath layouts are supported by relative resource paths.

Keep the existing hostname and base path when updating an installed app. The root service worker and manifest preserve the application's existing scope and launch URL.

## Project structure

```text
KMTrack/
??? src/          Application modules and styles
??? public/       GIS datasets, images, fonts, and vendor libraries
??? tests/        Automated tests, synthetic fixtures, and helpers
??? scripts/      Local development and verification tools
??? docs/         Architecture, guides, planning, and implementation history
??? index.html    Application entry page
??? manifest.json PWA identity and installation metadata
??? sw.js         Offline caching and service-worker lifecycle
```

The GIS/calibration assets are kept separate from application code. Selected evidence files are checked by SHA-256 when loaded by the location worker; their exact bytes and line endings matter.

## Verification

Check resource paths, offline-shell assets, PWA scope, worker dependencies, and GIS hashes:

```sh
node scripts/verify-layout.cjs
```

Run focused location and Capture checks:

```sh
node --test tests/manual-location.test.js tests/capture-location.test.js tests/stationing-review-integration.test.js tests/stationing-review.test.js
```

Run the complete test collection:

```sh
node scripts/test.cjs
```

The full suite contains known historical failures; see the [repository migration verification](docs/REPOSITORY_LAYOUT.md) for its recorded baseline. Synthetic replays and desktop browser checks do not replace testing on the intended phone in field conditions.

## Documentation

| Start here | Reference |
| :--- | :--- |
| Working rules and contribution boundaries | [AGENTS.md](AGENTS.md) |
| Product purpose and operating context | [Product notes](docs/PRODUCT.md) |
| Application handover and background | [Project context](docs/PROJECT_CONTEXT.md) |
| Engineering decisions and implementation traps | [Design notes](docs/DESIGN.md) |
| Authentication, data, and access boundaries | [Supabase architecture](docs/SUPABASE_ARCHITECTURE.md) |
| Import/export behavior | [Sharing inspections](docs/guides/SHARING.md) |
| Map and landmark behavior | [Map landmarks](docs/guides/MAP_LANDMARKS.md) |
| Layout and migration verification | [Repository layout](docs/REPOSITORY_LAYOUT.md) |
| Earlier implementation and validation reports | [Implementation history](docs/history/README.md) |

Planning and history documents describe their own point in time. Check current source and configuration before treating an older status statement as current behavior.

## Contributing

Read [AGENTS.md](AGENTS.md) before making changes. Keep changes focused, preserve existing inspection data, and validate the affected workflow.

- Keep location readouts, saved records, and photo metadata consistent.
- Preserve local-first capture, account/workspace isolation, and permission boundaries.
- Update service-worker cache versioning and asset entries for deployed application changes.
- Never include credentials, private inspection exports, browser profiles, or local evidence folders in a commit.
- Report checks performed and distinguish simulation results from field verification.

## Third-party notices

Bundled libraries and fonts retain their license and attribution files under [public/vendor](public/vendor) and [public/fonts](public/fonts). Those notices apply to their respective components; this repository does not currently declare a repository-wide license.
