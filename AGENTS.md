# KMTrack project guidance

- Read `DESIGN.md` before UI work. It records the current visual baseline; preserve it and update it deliberately when an approved visual change alters the system.
- Read `BORDER_RADIUS_RULES.md` before editing or reviewing UI styles.
- Preserve the existing light/dark gradients, translucent panels, and brand appearance. The user rejected the flat color-system restyle; do not reapply it or remove gradients unless explicitly requested.
- Preserve the explicitly restored pre-system corner values in `radius-system.css`. The user prefers these original curves over the later formula-derived radius system.
- Keep the bottom navigation tray rectangular while retaining rounded selected-tab highlights.
- Rounded swipe rows and their flush cards share one radius. Keep actions clipped.
- Full rounding is for circles or guaranteed single-line shapes; wrapping controls use fixed tokens. Edge-attached sides remain square.
- Prefer parent clipping for images, and native offset outlines for concentric focus rings. Do not clip a whole interactive panel simply to round a child image.
- Do not modify vendored library styles to satisfy application radius linting; override a visible third-party component only when needed.
- Preserve inspection logic, storage, exports, GPS and camera behavior during visual changes.
- Bump `sw.js` for every deployed application change, cache new app assets, run tests, and provide a prepared commit message. Do not commit/push unless asked.
