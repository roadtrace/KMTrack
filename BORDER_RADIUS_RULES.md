# Border-Radius System Rules

Use these rules whenever writing or reviewing CSS/styles that involve
`border-radius`. Treat corner rounding as a *system* driven by fixed
formulas and a shared scale — never hardcode one-off radius values.

## 0. Core scale (define once, reuse everywhere)

Define a single radius scale as tokens/variables and reference it
everywhere. Do not introduce new radius values outside this scale.

```css
:root {
  --radius-xs: 4px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-full: 9999px;
}
```

Every rounded element in the app should map to one of these tokens.
If a design calls for a value outside the scale, flag it and either
snap to the nearest token or add it to the scale deliberately — never
inline a random number.

## 1. Nested corners: `inner = outer − padding`

When a rounded element sits inside another rounded element (card in a
tray, button in a toolbar, image in a card), the two radii must share
the same center point. Otherwise the nesting looks visually "off."

**Formula:** `inner_radius = outer_radius − padding`

```css
.tray   { border-radius: 12px; padding: 8px; }
.card   { border-radius: 4px; } /* 12 - 8 = 4 */
```

If padding changes, recompute the inner radius — don't leave it fixed.

## 2. Scale: radius follows size

Bigger components generally take larger radii; small controls take
smaller ones — but always from the fixed scale in §0, never arbitrary
values. Consistency across similar components matters more than any
single "perfect" number.

## 3. Pill / full radius is a shape, not a number

`border-radius: var(--radius-full)` (e.g. `9999px`) only works
correctly on content that is **exactly one line tall** — chips,
avatars, toggles, single-line buttons/badges.

The moment content can wrap to multiple lines (cards, multi-line
containers), full radius breaks down (it just clips at whatever the
element's height happens to be). Use a real value from the scale
(`--radius-md` / `--radius-lg`) instead.

**Rule of thumb:** if the component's height is fixed/intrinsic to a
single line of content → full radius OK. If height can vary/wrap →
use a fixed token, not full radius.

## 4. Edges: a corner touching an edge gets no radius

If an element touches the edge of its container or the screen (a
bottom sheet, a full-bleed dropdown, a side panel), don't round the
corner(s) on the touching side(s). A corner needs open space beyond
it to visually read as rounded — rounding a corner flush against an
edge just looks clipped.

```css
/* Bottom sheet: rounded top, flush bottom */
.bottom-sheet { border-radius: 16px 16px 0 0; }

/* Dropdown flush against left edge */
.side-panel { border-radius: 0 16px 16px 0; }
```

## 5. Rings / focus outlines: `outer = inner + gap`

For a concentric ring, border, or focus outline drawn around a
rounded shape (selection state, focus ring), the ring's radius must
equal the inner shape's radius **plus** the gap between them, or the
ring will visually pinch at the corners instead of running parallel
to the shape it wraps.

**Formula:** `ring_radius = inner_radius + gap`

```css
.card         { border-radius: 8px; }
.card:focus-visible {
  outline-offset: 2px;      /* gap */
  outline-color: var(--focus-color);
  /* outline radius conceptually = 8 + 2 = 10px; if using a pseudo-element
     ring instead of outline, set its border-radius explicitly: */
}
.card__ring   { border-radius: 10px; } /* 8 + 2 */
```

## 6. Images inside cards: clip, don't double-radius

Prefer letting the parent container clip the image rather than
rounding the image element itself:

```css
.card  { border-radius: 12px; overflow: hidden; }
.card img { border-radius: 0; display: block; }
```

If the image must carry its own radius (no `overflow: hidden` on the
parent), apply rule §1 — subtract the card's padding:

```css
.card    { border-radius: 12px; padding: 8px; }
.card img{ border-radius: 4px; } /* 12 - 8 = 4 */
```

## Quick checklist (apply to every rounded UI element)

- [ ] **Nested** — inner = outer − padding, shared center
- [ ] **Scale** — radius value comes from the defined token scale
- [ ] **Pill** — full radius only on single-line content
- [ ] **Edges** — no radius on sides flush against a container/screen edge
- [ ] **Ring** — ring/outline radius = inner radius + gap
- [ ] **Images** — clipped by parent (`overflow: hidden`) or radius = outer − padding

## When to deviate

These are strong defaults, not hard constraints. Treat them as
lint-level guidance for new or changed code — not a mandate to
retroactively rewrite existing `border-radius` values across the
codebase, since some may already reflect deliberate design decisions
this doc doesn't know about.

- **Rules §1 (Nested), §5 (Ring), and §6 (Images)** are pure geometry
  — the math has to be consistent for corners to actually align.
  There's essentially no valid reason to deviate from these; if a
  design spec seems to contradict them, flag it rather than silently
  matching it.
- **Rule §3 (Pill)** is a rendering fact for content that wraps, but
  some products intentionally use very large radii on multi-line
  elements for a soft/playful aesthetic. That's a legitimate
  stylistic choice. Apply the pill rule by default, but defer to an
  explicit design spec that calls for full radius on multi-line
  content.
- **Rules §2 (Scale) and §4 (Edges)** are standard design-system
  hygiene. Follow them by default; if a one-off value is genuinely
  needed, prefer adding it to the token scale deliberately over
  inlining a random number.
- When in doubt: apply the rule to new code, note the deviation if an
  existing value conflicts with it, and let a human confirm before
  changing anything that's already shipped.

## Source
Summarized from a design-systems reel on border-radius usage
(@designmotionhq), adapted into implementation rules for use as
project-level styling guidance (e.g. in `CLAUDE.md` / `AGENTS.md` or
a component-library README).
