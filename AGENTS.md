# KMTrack project guidance

- Read `BORDER_RADIUS_RULES.md` before editing or reviewing UI styles.
- Preserve the existing light/dark gradients, translucent panels, and brand appearance. The user rejected the flat color-system restyle; do not reapply it or remove gradients unless explicitly requested.
- Use the radius scale declared once in `index.html`: xs=4, sm=8, md=12, lg=16, xl=24, full=9999px. The deliberate xl extension lets dataset/readout panels retain rounded nested corners with comfortable padding. No one-off literal radii in application styles.
- Maintain nested geometry in `radius-system.css`. Derive inner radii from the parent radius minus padding and border inset, clamped to zero. Share padding variables with the actual layout, including responsive overrides.
- Rounded swipe rows and their flush cards share one radius. Keep actions clipped.
- Full rounding is for circles or guaranteed single-line shapes; wrapping controls use fixed tokens. Edge-attached sides remain square.
- Prefer parent clipping for images, and native offset outlines for concentric focus rings. Do not clip a whole interactive panel simply to round a child image.
- Do not modify vendored library styles to satisfy application radius linting; override a visible third-party component only when needed.
- Preserve inspection logic, storage, exports, GPS and camera behavior during visual changes.
- Bump `sw.js` for every deployed application change, cache new app assets, run tests, and provide a prepared commit message. Do not commit/push unless asked.
