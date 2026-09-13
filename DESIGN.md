---
name: KMTrack
description: Existing mobile road-inspection interface baseline, captured from the working code on 2026-09-07.
colors:
  line-yellow: "#f4b400"
  pothole-light: "#e8b323"
  safety-green: "#2e8b57"
  safety-orange: "#d9772f"
  safety-red: "#c1392b"
  cracks: "#c9c9c9"
  other-defect: "#c1707a"
  error-text-dark: "#e47164"
  action-ink: "#191c1f"
  asphalt: "#14181c"
  asphalt-2: "#1c2126"
  panel: "#252b31"
  panel-raised: "#2b3239"
  surface-soft: "#303840"
  line-white: "#f5f7f8"
  text-muted: "#a7b0b8"
  text-subtle: "#707b84"
  border: "rgba(255,255,255,.10)"
  border-strong: "rgba(255,255,255,.18)"
  asphalt-light: "#f4f5f7"
  asphalt-2-light: "#eceff2"
  panel-light: "#fff"
  panel-raised-light: "#f7f8fa"
  surface-soft-light: "#eef1f3"
  line-white-light: "#23272b"
  text-muted-light: "#696f74"
  text-subtle-light: "#858b90"
  border-light: "rgba(32,42,49,.10)"
  border-strong-light: "rgba(32,42,49,.18)"
  tab-active: "#79cef4"
  tab-active-surface: "rgba(71,169,215,.14)"
  tab-inactive: "#98a7b0"
  tab-active-light: "#1683b6"
  tab-active-surface-light: "#eef7fb"
  tab-inactive-light: "#747b80"
typography:
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "-.005em"
  station:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"
    fontSize: "clamp(34px,10vw,44px)"
    fontWeight: 760
    lineHeight: 1.1
    letterSpacing: "-.035em"
  section-label:
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: ".10em"
  coordinate-label:
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: ".08em"
  coordinate-value:
    fontFamily: "'Courier New', ui-monospace, monospace"
    fontSize: "clamp(11px,3.4vw,16px)"
    fontWeight: 400
    letterSpacing: ".01em"
  entry-title:
    fontSize: "14px"
    fontWeight: 700
  entry-meta:
    fontFamily: "'Courier New', ui-monospace, monospace"
    fontSize: "clamp(9px,2.45vw,11px)"
    lineHeight: 1.5
    letterSpacing: "-.015em"
  tab-label:
    fontSize: "11px"
    fontWeight: 700
rounded:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  full: "9999px"
  restored-bound: "10px"
  restored-panel: "14px"
  restored-readout: "18px"
  restored-station: "20px"
  restored-drawer-bottom: "30px"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-6: "24px"
components:
  lane-pothole:
    backgroundColor: "{colors.line-yellow}"
    textColor: "{colors.action-ink}"
    rounded: "{rounded.md}"
    padding: "12px 2px"
  lane-pothole-light:
    backgroundColor: "{colors.pothole-light}"
    textColor: "{colors.action-ink}"
    rounded: "{rounded.md}"
  lane-shoving:
    backgroundColor: "{colors.safety-orange}"
    textColor: "{colors.action-ink}"
    rounded: "{rounded.md}"
  lane-cracks:
    backgroundColor: "{colors.cracks}"
    textColor: "{colors.action-ink}"
    rounded: "{rounded.md}"
  lane-other:
    backgroundColor: "{colors.other-defect}"
    textColor: "{colors.action-ink}"
    rounded: "{rounded.md}"
  tab-active:
    backgroundColor: "{colors.tab-active-surface}"
    textColor: "{colors.tab-active}"
    rounded: "{rounded.md}"
    padding: "3px 12px"
  tab-active-light:
    backgroundColor: "{colors.tab-active-surface-light}"
    textColor: "{colors.tab-active-light}"
    rounded: "{rounded.md}"
  readout-light:
    backgroundColor: "{colors.panel-light}"
    textColor: "{colors.line-white-light}"
    rounded: "{rounded.restored-readout}"
    padding: "14px 16px"
  entry-card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.line-white}"
    rounded: "{rounded.lg}"
    padding: "10px 12px"
  edit-input:
    rounded: "{rounded.sm}"
    padding: "11px"
---

# Design System: KMTrack

## Overview

This is the baseline of the existing M_KMTrack working tree as of 2026-09-07, including the bottom-navigation keyboard and inspection accessibility refinements. It documents the implemented interface, not a redesign or an accessibility certification. Descriptions are literal: no new creative metaphor, palette, tonal ramp, or component styling has been invented.

KMTrack combines a centered road-marking logo, blue/navy gradient surroundings, translucent instrument panels, and a prominent green kilometer-station card. The interface is compact and practical, with strong defect-color coding and large lane targets. Light mode retains the dark branded header and green station card while surrounding panels become white and pale gray.

**Key Characteristics:**

- Layered gradients, translucency, soft offset shadows, and thin borders.
- Inter interface text with selective monospace measurement metadata.
- Restored, component-specific curves with a rectangular bottom navigation tray.
- Compact phone layouts that expand into a landscape inspection dashboard.

Sources: `index.html` (inline styles and markup), followed in cascade order by `radius-system.css`, `sharing.css`, and `photo-viewer.css`; behavior in their JavaScript companions. `AGENTS.md`, `PRODUCT.md`, and `BORDER_RADIUS_RULES.md` supply preservation constraints. Rendered styles were sampled at 390 × 844 and 1280 × 800 in both themes. Frontmatter aliases ending in `-light` describe theme overrides; aliases beginning `restored-` describe existing literal overrides, not newly implemented CSS variables.

**The Existing Cascade Rule.** Preserve the final computed appearance. Later theme rules, selector specificity, and the restored corner stylesheet take precedence over earlier declarations. Do not apply every root token indiscriminately.

## Colors

### Primary

Road yellow (`line-yellow`) marks potholes, selected direction controls, export actions, and focus treatments. The light-theme pothole/export fill uses `pothole-light`. Selected direction buttons retain `linear-gradient(145deg,#ffc000,#f2ad00)` in both themes.

### Secondary

Green is the station/readiness family. The station surface is not the flat `safety-green` token: its exact fill is `linear-gradient(135deg,rgba(27,139,98,.92),rgba(23,102,82,.88)) padding-box`, over `linear-gradient(125deg,rgba(210,255,236,.58),rgba(107,211,184,.28) 52%,rgba(235,255,248,.72)) border-box`, with a transparent 2px border. Dataset readiness uses a luminous green dot (`#45e3a0`); pending data uses amber (`#d39a26`).

### Tertiary

Defect categories retain orange for shoving, gray for cracks, and muted rose for other defects. The same accents identify log-entry left borders in both themes. Safety red remains the deletion/fill token. Dark GPS error text uses `error-text-dark`; light error text retains safety red. Shoving lane labels use action ink in both themes. Direction hints use the existing muted-text token; the light Bound label does too. Light GPS waiting guidance uses the existing brown (#765300). Navigation uses the separate blue active-tab colors in frontmatter; this blue does not replace category coding.

### Neutral

Root asphalt/panel tokens supply controls, dialogs, and log cards. The actual dark page is a layered background: `radial-gradient(circle at 7% 40%,rgba(24,132,178,.27) 0,transparent 38%)`, `radial-gradient(circle at 82% 28%,rgba(61,67,145,.19) 0,transparent 40%)`, and `linear-gradient(155deg,#102231 0%,#141a27 46%,#07111a 100%)`.

Light mode uses `radial-gradient(circle at 8% 28%,rgba(42,132,173,.055) 0,transparent 38%)` over `linear-gradient(180deg,#f7f8fa 0%,#f1f3f5 100%)`. Both page backgrounds are fixed.

The dark header uses `radial-gradient(circle at 16% 10%,rgba(31,112,158,.24),transparent 46%)` over `linear-gradient(145deg,rgba(27,48,64,.98),rgba(15,27,38,.98))`. Its light-theme counterpart uses `radial-gradient(circle at 16% 10%,rgba(51,137,185,.30),transparent 46%)` over `linear-gradient(145deg,#1b4057,#102a3d)`.

Dark readouts use `linear-gradient(180deg,rgba(30,41,49,.92),rgba(17,30,39,.92))`; raised compact controls/dataset drawers use the same stops at `.98` opacity. Map panels use `.94`. Light readouts and dataset drawers are white; bound panels use the light raised-panel token. These are contextual treatments, not one universal card fill.

**The Gradient Identity Rule.** Retain both theme backgrounds, the branded header, and the green station treatment. The previously rejected flat color-system restyle is not the baseline.

## Typography

Inter is self-hosted through `fonts/InterVariable.woff2`, with weights 100–900, normal style, `font-display:swap`, and `font-synthesis:none`. The logo is the existing image asset `KMTrack.png`, not a substitute display font. Preserve `KMTrack_logo.png` for the app identity.

The body inherits the browser's default size (16px in the inspected browser); its authored line-height and tracking are in frontmatter. This is a compact UI rather than a single modular type scale. Many labels and secondary controls are intentionally smaller than body text in the current implementation.

| Role | Existing treatment |
| --- | --- |
| Station number | Frontmatter `station`; tabular numerals. The late rule caps it at 44px even in wide landscape, overriding earlier 58px declarations. |
| Nearby bridge name | 15px/800, line-height 1.25; 13px at ≤380px; landscape ≥700px uses clamp(19px,2.1vw,24px), with 16px at 700–900px. |
| Station caption | 11px/700, uppercase; tracking .12em on phones and 2.2px in wide landscape (1.5px at 700–900px). |
| Section label | Frontmatter `section-label`, uppercase. |
| Coordinates | Monospace `coordinate-value`; becomes 12px at ≤390px. Labels use `coordinate-label`. |
| Lane number | 15px/700 on phones; 20px in wide landscape, 18px at 700–900px; focused-category mode uses 28px. |
| Log title / metadata | Entry titles are 15px/800 (14px on narrow phones); imported attribution is inline at 12px/400 (11px narrow). Timestamps and road context use matching 12px muted text (11px narrow) with tabular numerals for dates and KM values. |
| Header status | 11px/450 with .035em tracking. |
| Navigation | Frontmatter `tab-label`; icon above label. |

The variables named `--mono` and `--sans` both resolve to the UI font. Only explicit `--font-readout` overrides produce Courier New. Station values, timestamps, GPS status, and camera metadata use tabular-number settings where declared.

## Layout

The phone inspection column is centered, max-width 520px, with 14px side/bottom padding and 12px top padding. A sticky top shell contains the header and overlapping dataset drawer. The drawer is at most 560px wide, or viewport minus 20px at ≤600px. Its internal two-column grid becomes one column at ≤390px.

At ≤360px, the direction panel stacks below a two-equal-column measurement grid; direction buttons form a wrapping row. Above that width, the readout pairs a two-column measurement grid with a direction panel (132px basis, 112px at ≤390px). The final readout padding remains 14px 16px and bound-panel padding 10px 12px because the restored stylesheet overrides narrower earlier padding. The station card uses two columns, separated by a fine vertical line, with 17px 18px padding and a 14px gap on ordinary phones.

Lane controls form five shrinkable equal columns with 5px gaps. Standard phone rows are restored to a consistent 60px height; numbered lanes use 15px text while the Other-lane label and explanation use 9px and 8px so they do not enlarge the full row. Focused-category mode changes to two columns with 12px gaps, and the Other lane spans both with larger targets. Shared spacing tokens are listed in frontmatter, but the existing interface also uses 5, 6, 7, 10, 14, 18, 20, and 22px locally; do not silently snap these to a new scale.

Inspection entries are independent rounded cards separated by a 6px gap. Each card has two compact information lines: defect type and imported-inspector attribution align with the timestamp above; expressway, KM station, bound, and lane align with the optional View Photo action below. The defect-color stripe remains on the leading edge. In selection state, a yellow inset ring and trailing checkbox appear without replacing the stripe. The select-all control shares the same one-line row as the two dates and filter button on phone widths.

Landscape ≥700px expands main to 1180px with 12px 18px padding. The top grid is `minmax(250px,1fr) minmax(135px,.48fr) minmax(360px,1.5fr)` with a 16px column gap. GPS, direction, and station align at the top with no extra margin on direction/station; defects span the width in two columns. At 700–900px the grid becomes `minmax(215px,1fr) minmax(120px,.5fr) minmax(320px,1.5fr)` with 12px gaps. The readout wrapper becomes `display:contents`; its inner GPS panel is the visible card.

The fixed bottom tray is at most 560px wide and 56px tall plus bottom safe-area inset; body reserves matching space. The map fills `100dvh - 56px - bottom safe area`, with a 420px minimum height. Its top and lower filter panels sit 12px from the sides; lower filters sit 30px from the bottom. Dates use shrinkable grid tracks and centered native date text. Entry filters use `minmax(0,1.15fr) auto minmax(0,1.15fr) minmax(0,1fr) auto` with 6px gaps.

Map inspection entries use bound-colored dots with compact KM-station labels placed immediately beside, above, or below their respective dots. Leader lines and arrows are not used. Labels avoid the map header, legend, filter panel, and each other; when density leaves no nearby collision-free position, the label is suppressed until zooming reveals enough space while the dot remains visible and interactive.

Map landmark labels distinguish formally identified interchanges from ordinary exits and append the station without a redundant `KM` prefix, for example `Dau Interchange · 83+353` and `Libtong Exit · 19+550`.

Landmark pins use a compact 22 × 28px visible symbol, comparable to map point-of-interest markers, centered within a 44 × 44px touch target. The tooltip offset follows the smaller visual pin rather than leaving the previous oversized gap.

Inspection touch sizes: ordinary lane buttons are 60px high; navigation, theme, bridge, camera category, export, select, focus select, and inspection date/filter controls are at least 44px. Map date/filter controls remain 38px. The two inspection dates, separator, filter, and select-all control remain on one compact row down to common 390px phone widths. Camera topbar controls are 36px, or 34px at ≤380px. These are measured patterns, not a claim that every control meets a uniform target size.

## Elevation & Depth

Depth comes from translucent gradient fills, thin borders, offset shadows, and selective backdrop blur. Preserve the combined treatments instead of imposing a flat or shadow-only system.

| Surface | Existing shadow / blur |
| --- | --- |
| Shared dark card token | `0 10px 28px rgba(0,0,0,.18)` |
| Shared light card token | `0 7px 20px rgba(38,48,56,.09)` |
| Dark readout | `0 12px 24px rgba(0,0,0,.22), inset 0 1px rgba(255,255,255,.035)`; 14px blur |
| Station card | `0 14px 34px rgba(0,0,0,.24), inset 0 1px rgba(255,255,255,.08)`; 12px blur |
| Compact dark raised control | `0 7px 16px rgba(0,0,0,.20)` |
| Map panel | `0 8px 22px rgba(0,0,0,.24)`; 12px blur; light shadow `0 7px 20px rgba(38,48,56,.13)` |
| Bottom tray | `0 -8px 24px rgba(0,0,0,.24)`; light `0 -7px 22px rgba(38,48,56,.11)` |

Dataset dots intentionally have glow. General controls transition transform/filter over 120ms and background/border/shadow over 160ms, using ease. Lane controls use 100ms transform/filter and 140ms shadow; pressed state scales to .97 and darkens to .9 brightness. Swipe rows use 180ms ease, with a 900ms preview animation after 250ms. Existing reduced-motion overrides cover swipe previews/transitions, dataset chevrons, theme toggle, tabs, and photo-image optimization; there is no blanket removal of all control transitions.

## Shapes

The nominal radius tokens do not describe every final component. Preserve the explicitly restored pre-system overrides in `radius-system.css`.

| Component | Final corner treatment |
| --- | --- |
| Header / dataset drawer | Square top; 24px / 30px lower corners |
| Dataset panel / reload button | 14px / 10px |
| GPS readout / direction panel / direction button | 18px / 10px / 12px |
| Station / bridge menu / menu option | 20px / 14px / 9px |
| Edit modal / its inputs and action buttons | 12px / 8px |
| Edit photo thumbnail | 10px parent clipping; image 0 |
| Camera lane picker / its fields | 10px / 7px |
| Select toggle / export | 999px |
| Bottom tray / tab highlight | 0 / 12px |
| Map panels / date controls | 14px / 10px |
| Photo card / image | 8px parent clipping / 0; fullscreen zoom is square |
| Sharing dialog / inner controls | 24px / computed 7px (24 − 16 padding − 1 border) |

**The Restored Corners Rule.** Do not replace these values with a formula-derived scale. Use parent clipping for photo corners and offset outlines for focus; do not clip an entire interactive panel to round a child image.

Swipe wrappers and their cards share 8px corners in dark mode and 16px in light mode. Focus select is also theme-specific: 12px dark and 16px light.

## Components

### Header and dataset drawer

Keep the centered image logo and compact timestamp/saved-count line. The default logo height is 64px, 48px at ≤600px, and 58px in landscape ≥700px. Dataset status is an overlapping disclosure drawer with a colored dot, uppercase status text, and circular chevron. Preserve native disclosure behavior and the loaded/pending states.

### Station and direction controls

The green station card is the signature component: large station number, small unit, adjacent nearby-bridge text, classification filter, and compact segment/ramp tags. The bridge filter keeps a 44px tap target but renders a centered 28px visible control aligned with the Nearby Bridge heading so it cannot overlap the bridge name. Segment tags have translucent black fill, 5px 12px padding, 12px bold text, and 16px corners; ramp tags use translucent blue with a blue border. Direction buttons form a vertical pair and use the yellow gradient when active.

### Defect and utility buttons

Keep the five-lane category rows and distinct defect colors. Native checkbox overlays support the existing haptic interaction. Camera category buttons use the raised panel gradient and a masked camera icon; hover lightens the gradient. The log header contains Import and the conditional Imported files menu. A sticky action footer above the bottom navigation contains the entry/selection count, Select/Cancel, and Export/Export selected. Selection mode exposes Select all and Delete selected above the records. Import uses the existing panel surface; Export uses safety green. The single Export action opens a native dialog with the current selected/filtered/saved count and choices for Excel only or workbook plus photos ZIP. Both choices reuse existing export handlers and inspector attribution. Disabled controls retain their current muted/opacity treatments. Do not invent additional hover effects for controls that have none.

### Log entries

Records share a single bordered list with separators and no gaps. Each row keeps 10px 12px padding, a bold defect title and a 4px defect-colored edge. Wide screens use aligned selection, Type, Date, Expressway/Segment, KM, Bound and Lane columns; at ≤760px the title/date sit above wrapping road context. Outer list corners remain rounded; interior rows are square. Photos retain their existing view/remove actions. Full timestamps and coordinates remain available in entry details. Selected entries have an inset yellow outline; light selection uses `#fff5cf`. Swipe actions expose blue editing and red deletion, with a floating undo message. Preserve the category border through light-mode overrides and keep revealed actions clipped.

The Inspection Log heading carries the current filtered result count in a compact red notification badge tucked against the title's upper-right corner. The badge is 24px tall, uses a restrained glow, stays circular for short counts and expands into a fully rounded capsule for longer, comma-formatted counts; the old count/filter-result row stays hidden. The sticky log action area uses a stable two-column grid. Normally Select and Export form its only action row. In selection mode, equal-width Select all and Delete selected appear as the temporary top row while the persistent Select-to-Cancel and Export controls move together to the bottom row, preserving their positions and meaning. All four controls are 44px tall with identical 8px corners, one-pixel border geometry and no inherited shadow, nested inside the panel's 16px corners and 8px padding. Their fill colors may differ by purpose, but their shapes must not. Select enters selection mode without choosing any records and changes its text to Cancel. Row checkboxes render a 28px rounded square with an 8px radius centered inside an unchanged 44px tap target. Empty boxes use a transparent fill with a muted blue-gray 2px outline; checked boxes use the app's warm yellow fill with a dark navy, geometrically centered SVG-mask check. Selected rows retain the yellow inset outline. Record IDs remain the selection keys, and row checkboxes are keyboard-operable.

### Inputs, filters, and dialogs

Inspection dates remain visible beside a 44px funnel disclosure. Inspection-log, map-entry and nearby-bridge filters all use the same filled funnel artwork. Active filters use the same yellow icon, yellow border and restrained yellow glow; the bridge version retains its smaller visible footprint inside a 44px tap target. Defect type and Clear filters sit inside the inspection popup; the funnel indicates active filters and closes after choosing a type, clearing filters, Escape, or an outside click. Source and inspector fields share the funnel popup with defect type. A compact three-line Imported files control sits beside Import and opens a newest-first list of import batches. Each batch detail shows its filename, inspection date range, import timestamp and remaining entry count; its inspector name can be edited for the full batch, or the batch and its photos can be deleted after confirmation without affecting own inspections. The text-based Select control sits beside Export in the sticky log action area. Controls wrap on narrow phones; at 320px the log heading occupies its own row. The map filter disclosure opens a vertical, scrollable options panel capped at 50dvh. Edit fields use 16px text and at least 48px height; sharing controls use at least 42px. The native sharing dialog is at most 420px wide (viewport minus 32px), 85dvh high, padded 16px, with a dark `.6` backdrop. Preserve existing semantic labels, disabled states, validation, and modal behavior.

### Bottom navigation and map

Two equal tabs place 21px outlined SVG icons above text. The tray stays rectangular and highlights remain rounded. Selected tabs expose `aria-selected`, and only the selected tab has a normal tab stop. Left/Right wrap; Home/End select the endpoints. The new tab focus outline is 2px `currentColor` with 2px offset. Checkbox-backed lane controls now expose focus on their visible label with a 3px yellow outline and 2px offset. Browser zoom is no longer capped by viewport metadata. General buttons/inputs/selects still have the more specific inline 3px translucent-yellow focus outline; swipe cards use an inset outline. Do not describe the lower-specificity 2px global fallback as overriding all of these.

Map controls reuse translucent panels and circular 44px locate/theme actions. Map landmark labels use compact native system typography with a restrained map-style halo. The legend represents landmarks with a miniature version of the same yellow interchange/location pin used on the map, not an abstract diamond. The curated landmark catalog omits General T. de Leon, Parada and Libis Baesa; uses Mindanao Exit and R10 Ramp; and locates Caloocan Interchange and C-3 Road Exit at their respective named central OSM motorway-junction nodes rather than centroids spanning unrelated ramps. KM labels use the same transparent, unboxed typography with a subtle bound tint applied only to the text: blue for NB, red for SB, yellow for EB, purple for WB and neutral gray for Other/unset, matching their dots while preserving light/dark contrast. The map filter includes bound alongside defect type, source and inspector. Pressing All dates fills the visible From and To controls with the oldest and newest saved inspection dates and gives the button an active yellow state; manually changing either date clears that state. Preserve existing light/dark map tiles, attribution, and entry markers.

### Photo and camera surfaces

Camera controls sit over the live viewfinder with safe-area spacing; landscape rearranges lane controls and review actions horizontally. Photo previews clip inside their own card; fullscreen zoom removes card rounding and exposes compact dark translucent zoom controls (42px minimum, 10px corners). Preserve pinch/pan, capture, review, and close behavior.

## Do's and Don'ts

### Do:

- Do preserve both themes, the existing logo assets, gradients, and translucent panels.
- Do use the final cascade and restored corner values as the baseline.
- Do retain defect-color associations across capture controls and log entries.
- Do preserve native controls, keyboard focus, safe-area spacing, and inspection workflows.
- Do update this baseline deliberately when an approved visual change alters the system.

### Don't:

- Don't reapply the rejected flat color-system restyle.
- Don't round the bottom navigation tray or square its selected highlights.
- Don't normalize existing sizes, radii, or typography merely to fit a new scale.
- Don't invent palette ramps, claims, or new visual patterns and label them as existing.
- Don't modify GPS, camera, storage, import/export, or offline behavior during visual refinement.

## Map entry and landmark overlays (2026-09-10)

The map displays saved entries by default, honoring its existing date, defect, source, and inspector filters. Direction colors are NB cyan #00b9f2, SB red #ef4444, EB yellow #f4b400, WB violet #b18cff, and other/unset gray #a7b0b8. These map-only colors do not change inspection defect colors. The upper-right legend lists directions in the filtered entries.

Each visible entry has its saved KM station in a callout joined to its geographic dot by a direction-colored leader. Missing KM values read KM n/a. Labels stagger when space permits and use 44px minimum hit heights; dots have transparent 44px hit targets. Clicking either opens the same entry editor used by the inspection log, resolving the entry by stable ID.

Yellow map pins identify interchanges and Pulilan/Tibag Underpass. Names appear from zoom 12, with details on click. Existing bridge coordinates remain authoritative for existing assets; supplementary OSM landmark data is bundled and cached offline. See MAP_LANDMARKS.md for source provenance and coverage. Basemaps, gradients, fonts, and bottom navigation retain their existing design.
