# Design

The visual design system for Instatic — principles, tokens, surfaces, components.

The design is a **two-layer color model** on the "Deep Ocean" palette: a cold slate-neutral base (surfaces, borders, default text — all one hue family, no competing temperatures) with a deliberate functional color layer on top (the **brand sky accent** for primary actions / focus / active indicators, numbered accents for identity, state tokens for meaning, canvas neon for selection). Everything is tokenized in `src/styles/globals.css`. Every primitive lives in `src/ui/components/`.

---

## TL;DR

- **Base is one neutral slate family; color is the layer on top.** Surfaces, borders, and default text are Deep Ocean neutrals sharing a single hue temperature. Chromatic color is used to convey **interaction** (`--brand-*`: primary actions, focus rings, links, active nav), **identity** (`--accent-1..10`) and **state** (danger, warning, success, info, canvas selection / hover). Color is never decorative — every colored pixel carries meaning.
- **Borderless tile cards.** Dashboard widgets and equivalent surfaces sit on a darker parent (`--bg-surface`) with a 1px grid gap, no border, `--card-radius` (16px). The gap reveals the parent and reads as a divider. Hover lifts the surface tone, never the border. Canonical implementation: `src/ui/components/Widget/Widget.module.css`.
- **Bordered transparent inputs.** Inputs have a 1px white-alpha border, transparent background, and a pill 1em radius. Focus adds an inset achromatic glow.
- **Floating overlay panels.** Spotlight, popovers, and modals use direct globals: `--bg-surface`, `--overlay-10`, `--panel-radius`, `--panel-blur`, and `--shadow-panel`.
- **Editor controls** (toolbar buttons, chips) use `--radius` (6px) for default and `--radius-sm` (3px) for tight badges.
- **One source of truth: `src/styles/globals.css`.** No hardcoded hex / rgb / hsl in admin / ui CSS modules — gated by `css-token-policy.test.ts`. Admin font sizes use the fluid `--text-*` scale, and admin spacing uses the fluid `--space-*` scale — gated by `admin-typography-token-policy.test.ts` and `admin-spacing-token-policy.test.ts`.
- **CSS Modules only.** No Tailwind utility classes — gated by `noTailwindUtilities.test.ts`. No Tailwind ecosystem deps — gated by `no-tailwind-deps.test.ts`.
- **Every interactive control goes through a UI primitive** from `src/ui/components/`. Bare `<button>` is gated.
- **Icons come from `pixel-art-icons`.** Deep-imported for tree-shaking. No `lucide-react`, no inline SVG strings.

---

## Principles

### 1. The base disappears, the meaning appears

The chrome is dark, cold-neutral, and quiet so the user's content and the system's signals are the only things competing for attention. Surfaces, borders, default text — all drawn from one slate hue family. Color is reserved for things that mean something: a sky-filled button says "this is the action", a green dot says "saved", a peach widget header says "this card is about posts", a neon ring says "the canvas selected this node".

If a color isn't carrying information, it doesn't belong in the chrome.

### 2. Two layers, sharp separation

```text
┌────────────────────────────────────────────────────────────────┐
│  Layer 2 — FUNCTIONAL COLOR                                    │
│  brand sky (--brand-*: primary action, focus, links, active),  │
│  numbered identity accents, state (danger/warning/             │
│  success/info), canvas neon (selection/hover)                  │
├────────────────────────────────────────────────────────────────┤
│  Layer 1 — DEEP OCEAN NEUTRAL BASE (one slate hue family)      │
│  --bg-body / --bg-surface / --bg-surface-2..5                    │
│  --text-bright / --text / --text-muted / --text-subtle           │
│  --border-subtle / --border-muted / --border / --border-strong   │
│  --overlay-* / --scrim-* / --kbd-*                               │
└────────────────────────────────────────────────────────────────┘
```

Both layers are tokenized. Layer 1 is the base every primitive paints itself with. Layer 2 is added by the primitive when there's a reason — a tint dot on a widget title, a colored row on a panel rail, a status pill, a focus ring on the canvas.

### 3. Surfaces have a hierarchy

The base layer uses six surface tones to convey depth without shadows or gradients on inline content. Lighter surfaces are higher in the stack:

```text
--bg-body        #050b14   ← page bottom (root, behind everything)
--bg-surface     #0a1120   ← darker parent of tile cards / sidebar fill
--bg-surface-2   #111827   ← tile cards themselves, panel bodies
--bg-surface-3   #1f2937   ← hover state for tiles, nested controls
--bg-surface-4   #374151   ← active state
--bg-surface-5   #4b5563   ← active + focused
```

Borders have their **own ramp** (`--border-subtle` → `--border-strong`), offset half a step above the surface scale so a hairline is visible against both the surface it sits on and the one below it. Never reuse a surface token as a border color.

Hover and active states change **tone**, not border. Reach for the closest tone above the current surface; skip levels only with intent.

### 4. Cards are tiles, not boxes

The dashboard pattern — and any surface that wants to read as a unit — is a **borderless tile** sitting on a darker parent with a 1px grid gap. The gap reveals the parent and visually separates the cards without a stroke. The card has no border, just a background and a 16px radius. Hover lifts the surface, never the edge.

```text
Parent surface  ── --bg-surface
                   ┌──────────┐ ┌──────────┐ ┌──────────┐
                   │  tile 1  │ │  tile 2  │ │  tile 3  │   ← --bg-surface-2
                   └──────────┘ └──────────┘ └──────────┘
                   ▲           ▲           ▲
                   └────── 1px grid gap ───┘
                   (no border, just a sliver of the parent showing through)
```

This is implemented by `Widget` (`src/ui/components/Widget/`) and `DashboardGrid` (`src/admin/pages/dashboard/components/DashboardGrid.module.css`). Use the same pattern for any equivalent tile surface.

### 5. Inputs wear their borders. Cards don't.

Inputs are the inverse of cards: transparent background with a 1px white-alpha border. Pill radius (1em ≈ 16px). On focus, the border warms to the brand hue (`--border-focus`) and a soft brand glow appears (`--shadow-input-focus`) — the same treatment on `Input`, `Select`, and `SearchBar`, so "I am focused" always looks identical. The border is what defines the input; no fill.

This split (cards = filled & borderless, inputs = unfilled & bordered) is the load-bearing visual distinction between containers and controls.

### 5b. One interactive accent: the brand sky

`--brand` (#38bdf8) is the single interactive accent. It marks exactly four things: the **primary action** of a view (`Button variant-primary` — brand fill + `--brand-ink` dark text, ≥8:1), the **focus ring** (`--focus-ring`, 2px), **links / active-state text** (`--brand-text` on dark surfaces), and **active navigation indicators**. If two elements on one screen both shout brand, one of them is wrong — demote it to `secondary`/`ghost`.

### 6. Identity is a color, not a label

Categories of things have an associated color drawn from the numbered **accent** scale. Each widget category has a tint; each panel rail icon has a tint; each storage breakdown segment has a tint. Color is the at-a-glance label that lets the eye sort the screen.

| Token              | Hex       | Role                                                    |
|--------------------|-----------|---------------------------------------------------------|
| `--accent-1` | `#8ee6c8` | "Saved / system / status" categories                    |
| `--accent-2`| `#c8b6ff` | "Pages / structure" categories                          |
| `--accent-3`  | `#9bdcff` | "Storage / data / configuration" categories             |
| `--accent-4`| `#ffc7a8` | "Posts / media / activity" categories                   |
| `--accent-5` | `#ffb6cd` | Secondary warm identity tint                          |
| `--accent-6` | `#b8f28b` | Secondary green identity tint                         |
| `--accent-7` | `#f7df72` | Secondary yellow identity tint                        |
| `--accent-8` | `#83e7ff` | Secondary blue identity tint                          |
| `--accent-9` | `#f0a6ff` | Secondary violet identity tint                      |
| `--accent-10` | `#ff9f9f` | Secondary red identity tint                          |

Accent tokens don't live in `src/styles/globals.css` to be decorative — they're part of the design system. Panel rails assign these accents automatically using `assignRailAccents` (multi-item surfaces, avoids repeats inside the visible group) or `railAccent` (single item) from `src/ui/railAccent.ts`. Primitives like `Widget` can still accept an explicit tint when the category is product-defined. New identity colors are added by extending the `--accent-*` group, not by inlining a color.

### 7. The canvas owns its own palette

The canvas — where the user's page renders — has three chromatic rings used purely as affordance:

- `--canvas-selection-ring` (neon green `#39ff14`) — node selected by the user
- `--canvas-hover-ring` (neon pink `#ff2bd6`) — node hovered
- `--canvas-selector-ring` (neon orange `#ff8800`) — match sweep when hovering a selector rule in the Selectors panel

These are bright on purpose so they read against any user content, including content that itself uses the chrome palette.

A shared diagonal-stripe placeholder (`--canvas-placeholder-bg`) marks empty modules across every block type — image, video, content, loop, container, slot-outlet, VC reference. Edit once, retune everywhere.

### 8. Motion respects the reader

Animations are short, purposeful, and never block content. The `@media (prefers-reduced-motion: reduce)` rule in `globals.css` zeroes animation and transition durations and disables smooth scroll for users who opt out. This is a non-negotiable accessibility floor (Constraint #189), not a polish item.

---

## Tokens

All tokens live in `src/styles/globals.css`. Anywhere you need a color, radius, shadow, font, spacing value, or z-index, use a token. If the right token doesn't exist, **add one to `globals.css`** — never inline a value.

### Color tokens

```text
Base surfaces (Deep Ocean slate):
  --bg-body,
  --bg-surface, --bg-surface-2..5
  --border-subtle, --border-muted,
  --border, --border-strong,
  --border-focus (brand-tinted input focus border)
  --scrollbar-track, --scrollbar-thumb,
  --scrollbar-thumb-hover

Base text (slate neutrals):
  --text-bright, --text, --text-muted,
  --text-subtle, --text-disabled

Brand (the ONE interactive accent):
  --brand, --brand-hover, --brand-active,
  --brand-ink (dark text ON brand fills),
  --brand-text (brand-tinted text on dark surfaces),
  --brand-10, --brand-20

Motion:
  --duration-fast, --duration, --duration-slow,
  --ease, --ease-out

Font weights:
  --weight-regular, --weight-medium,
  --weight-semibold, --weight-bold

Fluid admin typography scale:
  --text-3xs, --text-2xs, --text-xs, --text-s, --text-m,
  --text-l, --text-xl, --text-2xl, --text-3xl, --text-4xl,
  --text-5xl, --text-6xl, --text-7xl

Fluid admin spacing scale:
  --space-px, --space-4xs, --space-3xs, --space-2xs,
  --space-xs, --space-s, --space-m, --space-l, --space-xl,
  --space-2xl, --space-3xl, --space-4xl, --space-5xl,
  --space-6xl, --space-7xl, --space-8xl, --space-9xl,
  --space-10xl, --space-11xl, --space-12xl

Overlay scale (white alpha):
  --overlay, --overlay-5, --overlay-10, --overlay-20, --overlay-30,
  --overlay-40, --overlay-50, --overlay-60, --overlay-70, --overlay-80,
  --overlay-90

Identity accents (categorical identity layer):
  --accent-1, --accent-2, --accent-3, --accent-4,
  --accent-5, --accent-6, --accent-7, --accent-8,
  --accent-9, --accent-10

Semantic state (meaning layer):
  --danger, --danger-light, --danger-lighter,
  --danger-text, --danger-10, --danger-20
  --warning, --warning-text, --warning-10,
  --warning-30
  --success, --success-bright,
  --success-text, --success-text-muted, --success-10
  --info-text
  --accent-1-10 through --accent-10-10

Canvas (selection / hover affordances):
  --canvas-chrome-shadow           (shared shadow for canvas notch chrome)
  --canvas-selection-ring          (inset 1px neon green)
  --canvas-hover-ring              (inset 1px neon pink)
  --canvas-selection-ring-color    (bare colour for outline / border-color)
  --canvas-hover-ring-color
  --canvas-placeholder-bg          (diagonal-stripe pattern for empty modules)

Keycap (Kbd / ShortcutKeys — scoped to those primitives):
  --kbd-face-top, --kbd-face-bottom
  --kbd-face-top-hover, --kbd-face-bottom-hover
  --kbd-border, --kbd-text
  --kbd-highlight, --kbd-inner-shadow, --kbd-edge, --kbd-drop

Code editor (GitHub Dark inspired — used inside CodeMirror only):
  --syntax-keyword, --syntax-entity,
  --syntax-property, --syntax-variable,
  --syntax-string, --syntax-constant,
  --syntax-comment, --syntax-operator, --syntax-invalid

Charts:
  --chart-default-tint (= --accent-4)
  --chart-series-min / --chart-series-min-glow
  --chart-series-max / --chart-series-max-glow
  --chart-segment-empty, --chart-segment-empty-border
  --chart-track-bg
```

### Text tokens — meaning hierarchy

| Token                       | Hex       | Means                          |
|-----------------------------|-----------|--------------------------------|
| `--text-bright`      | `#f7fafd` | Titles, headings, KPIs         |
| `--text`             | `#e8edf5` | Primary body text              |
| `--text-muted`   | `#a9b3c6` | Labels, secondary UI           |
| `--text-subtle`       | `#8b96ab` | Muted labels / placeholders (AA on surfaces up to `-3`) |
| `--text-disabled`      | `#5d6675` | Disabled state ONLY — never content |

These five are the entire text palette. Add a new tone only by adding a new token. `--text-disabled` is exempt from contrast requirements because it may only mark disabled controls; if you're tempted to use it for real content, use `--text-subtle`.

### Typography tokens — fluid size scale

Admin UI font sizes use a Core Framework-style fluid scale: `--text-3xs` through `--text-7xl`. CSS Modules in `src/admin/` and `src/ui/` should set font sizes with `font-size: var(--text-s)` or the closest scale step, never a hardcoded pixel value. The ranges are intentionally narrow for dense admin chrome, with larger display steps reserved for page headings and KPI-style values.

These are admin tokens. The published-site Framework engine also emits short text-size tokens such as `--text-s`; that is a separate scope. Editor chrome injected into the canvas iframe maps admin sizes to `--chrome-text-*` before using them so it does not overwrite the site's Framework typography.

### Spacing tokens — fluid size scale

Admin UI spacing uses a Core Framework-style fluid scale: `--space-px`, then `--space-4xs` through `--space-12xl`. CSS Modules in `src/admin/` and `src/ui/` should use the scale for `margin`, `padding`, `gap`, `row-gap`, `column-gap`, and CSS-authored SVG dimensions, never a hardcoded pixel value. `--space-px` stays fixed for true 1px hairline gaps.

These are admin tokens. The published-site Framework engine also emits short spacing tokens such as `--space-s`; that is a separate scope. Editor chrome injected into the canvas iframe maps admin spacing to `--chrome-space-*` before using it so it does not overwrite the site's Framework spacing.

### Radius

| Token                | Value | Use                                                          |
|----------------------|-------|--------------------------------------------------------------|
| `--radius-sm` | 3px   | Tight chips, micro-badges, segmented control inner indicator |
| `--radius`    | 6px   | Default editor controls, toolbar buttons, ghost menu items   |
| `--radius-lg` | 8px   | Compact buttons (`size-xs`), tree rows, list tiles           |
| `--panel-radius`     | 12px  | Floating overlay panels (Spotlight, modals, popovers)        |
| `--card-radius`      | 16px  | Tile cards (Widget, dashboard cells, module inserter tiles)  |
| `--input-radius`     | 1em   | Pill-shaped inputs, classes / property chips                 |
| `--tooltip-radius`   | 6px   | Tooltips                                                     |
| `--radius-pill`      | 999px | Fully-round pills whose height varies (badges, toggles, dots-as-capsules) — height-independent, unlike `--input-radius: 1em` |

Do not introduce ad-hoc radius values. Tile-card surfaces use `--card-radius`. Circles use `50%`; a zero corner is `0`.

Raw `border-radius` in `src/admin/` and `src/ui/` CSS modules is gated by `radius-motion-token-policy.test.ts` — `var(…)`, `calc(…)`, `0`, and `%` are always allowed, everything else must be a token. The gate carries a frozen baseline of the off-scale radii (7px, 9px, 10px, …) that predate it; those numbers only ever shrink, and new code adds none.

### Scrollbar chrome

Editor scrollbars are global chrome and stay achromatic. `globals.css` owns `--scrollbar-size`, `--scrollbar-radius`, `--scrollbar-track`, `--scrollbar-thumb`, and `--scrollbar-thumb-hover`; use those tokens for both `scrollbar-color` and `::-webkit-scrollbar` styling.

### Shadow and elevation

| Token                       | Use                                                     |
|-----------------------------|---------------------------------------------------------|
| `--focus-ring`       | Brand 2px focus ring (`0 0 0 2px` brand @60%) — visible on every surface of the dark ramp |
| `--shadow-panel`            | Composite for floating panels: bottom-inset shadow + drop shadow |
| `--shadow-panel-inset-bottom`| Sub-token: bottom inner shadow                         |
| `--shadow-panel-drop`       | Sub-token: drop shadow                                  |
| `--shadow-input-focus`      | Focused-input composite: 1px brand inset + 3px brand halo. Pairs with `--border-focus`. |
| `--shadow-tooltip`          | Tooltip drop + inner highlight                          |
| `--shadow-premium` / `--shadow-premium-hover` | Glass hero tiles (Widget, onboarding bento) — see "Glass tiles" below |

Use `--shadow-panel` directly when you need a floating-panel feel; don't recompose from the sub-tokens.

### Typography

```css
--font-sans: "Inter Variable", system-ui, sans-serif;
--font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
```

Font **weights** come from the four weight tokens — `--weight-regular` (400), `--weight-medium` (500), `--weight-semibold` (600), `--weight-bold` (700). Do not write raw weights, and do not invent optical in-betweens (560/620/650): if a label looks too heavy, step the size down or use a muted text token.

The recurring type patterns:

- Uppercase micro-labels (widget titles, dialog eyebrows, group headers): `--text-xs`/`--text-2xs`, `--weight-semibold`, letter-spacing **0.07em**, color `--text-subtle` — one metric set everywhere
- Widget KPI values: very large (~48–72px), `--weight-semibold`, color `--text-bright`
- Body text: `--text-l`, `--weight-regular`, color `--text`
- Captions / labels: `--text-s`, `--weight-medium`, color `--text-muted`
- Buttons: `--weight-semibold`
- Monospace (paths, code chips): same size as surrounding text, `--font-mono`, often with `--bg-surface-3` background

If a size recurs across three or more primitives, promote it to a token.

### Z-index

```text
--z-dropdown:           20
--spotlight-z-index:  9000
--toast-z-index:     10000
--tooltip-z-index:   10001
```

Use these for all dropdowns, tooltips, and the command palette. The visual editor has additional raw z-index values for the layout chrome (sidebars, floating panels) and a separate internal ladder inside the canvas's isolating stacking context — those are intentional exceptions documented in [`docs/reference/design-tokens.md`](reference/design-tokens.md) → "Z-index layers".

### Spotlight

The Cmd+K command palette uses the same global panel, overlay, accent, state, and skeleton tokens as the rest of the admin chrome. Only its layout layer stays spotlight-scoped: `--spotlight-z-index` and `--spotlight-width`.

---

## Surface systems

The editor composes four kinds of surfaces. Each has its own token group, geometry, and rules.

### 1. Tile cards (`--bg-surface-2` on `--bg-surface`)

The dashboard pattern. Borderless tiles on a darker parent, 1px grid gap, 16px radius.

```css
.parent {
  background: var(--bg-surface);
  display: grid;
  gap: 1px;              /* the gap that becomes the visual divider */
}

.tile {
  background: var(--bg-surface-2);
  border: 0;
  border-radius: 16px;
  /* hover lifts the tone, never the border */
}
.tile:hover {
  background: var(--bg-surface-3);
}
```

Each tile usually carries:

- A **title row** with a small accent dot (7px, `--radius-sm`) + uppercase 11px label
- A **value** rendered large with `--text-bright`
- Optional micro-trend, chart, or list body

This is what reads as the Instatic dashboard aesthetic. Same pattern is used by the storage breakdown, posts widget, activity feed, etc. The "Add block" tile uses `box-shadow: inset 0 0 0 1px ...` to convey emptiness without breaking the borderless rule.

#### Glass tiles (hero variant)

Dashboard widgets and the onboarding bento use the **glass** variant of the tile: `--glass-surface` fill (a surface-2 alpha) + `--glass-blur` backdrop + a faint `--glass-border` + `--shadow-premium`. Hover lifts the fill one tone (`--glass-surface-hover`, a surface-3 alpha), warms the border with the brand hue (`--glass-border-hover`) and raises the card 2px. Glass is reserved for hero/dashboard tiles — panel bodies, lists, and workspace chrome stay flat. All five `--glass-*` tokens derive from the surface ramp so glass reads as the same material lifted, not a second palette. Canonical implementation: `src/ui/components/Widget/Widget.module.css`.

### 2. Floating Overlay Panels

Spotlight, popovers, modals, and command palettes. These sit above the editor with a blur backdrop:

```css
.panel {
  background: var(--bg-surface);              /* rgb(30 30 30) */
  border: 1px solid var(--overlay-10);    /* rgba(255,255,255,0.10) */
  border-radius: var(--panel-radius);       /* 12px */
  backdrop-filter: blur(var(--panel-blur)); /* 24px */
  box-shadow: var(--shadow-panel);          /* composite */
}
```

Floating panels are the only surface that uses a visible border + blur — they're explicitly stacked above the editor, so they advertise themselves with the border and the slight transparency that the blur reveals.

### 3. Inputs

Bordered, transparent, pill-shaped:

```css
.input {
  background: transparent;              /* transparent */
  border: 1px solid var(--overlay-20);    /* rgba(255,255,255,0.20) */
  border-radius: var(--input-radius);       /* 1em */
  color: var(--text);
}
.input:hover  { border-color: var(--overlay-30); }
.input:focus  { border-color: var(--border-focus); box-shadow: var(--shadow-input-focus); }
```

The border is the input's identity. Don't fill them. Don't square the corners. The focus pair (`--border-focus` + `--shadow-input-focus`) is identical on `Input`, `Select`, and `SearchBar` — never invent a per-control focus style.

### 4. Panel rail (the colored sidebar)

42px-wide vertical rail of icon buttons. Each button carries a `data-accent` identity and a `--rail-icon-tint` custom property from the automatic rail-accent helper. The CSS derives the icon color, semi-transparent hover/active background, and glow from that token:

```css
.railButton {
  --rail-icon-tint: var(--accent-1);
  --rail-icon-color: var(--rail-icon-tint);
  --rail-icon-active-bg: color-mix(in oklab, var(--rail-icon-tint) 16%, transparent);
}
```

Icons in the rail get a `drop-shadow` glow matching their tint. The active rail item has a 2px tinted indicator on its left edge. Canonical CSS implementation: `src/admin/pages/site/sidebars/PanelRail/PanelRail.module.css`. Accent assignment logic: `src/ui/railAccent.ts` (`assignRailAccents` for multi-item groups, `railAccent` for single items).

This pattern (automatic per-item rail tint plus `data-accent` for inspection) is the recipe for any equivalent sidebar — media sidebar, data sidebar, content sidebar, etc.

### 5. Scrollbar chrome

Scrollable admin surfaces use a shared, quiet scrollbar: transparent track, muted achromatic thumb, and a slightly brighter hover state. Scrollbar styling lives in `src/styles/globals.css` so Firefox (`scrollbar-color`) and WebKit/Blink (`::-webkit-scrollbar`) stay visually aligned. Panel layouts that place a rail beside scrollable content should reserve a stable gutter so the scrollbar never covers rail icons.

---

## Components

Every interactive control in the admin and editor goes through a primitive from `src/ui/components/`. Bare `<button>` in `src/admin/*` is gated by `button-primitive-usage.test.ts` — the allowlist in that file documents the §8 exceptions.

| Primitive            | When to use                                                                 |
|----------------------|-----------------------------------------------------------------------------|
| `Button`             | Every action button. Variants for primary / secondary / ghost / danger.     |
| `Input`              | Single-line text input. Pill radius, transparent fill, bordered.            |
| `Switch`             | Boolean toggle.                                                             |
| `Checkbox`           | Boolean within a list / form.                                               |
| `Select`             | Dropdown selection of fixed options.                                        |
| `SearchBar`          | Search input with magnifier icon and clear affordance.                      |
| `ColorInput`         | Color picker with swatch + hex.                                             |
| `FileUpload`         | Drop-zone + browse for file inputs.                                         |
| `DateTimePicker`     | Date / time inputs.                                                         |
| `RangeTabs`          | Tabbed numeric range selectors (e.g. spacing scales).                       |
| `SegmentedControl`   | A few mutually exclusive options shown inline.                              |
| `Tabs`               | Top-level tab navigation within a workspace.                                |
| `Separator`          | Visual divider between sections.                                            |
| `Section`            | Titled section block in panels.                                             |
| `ControlRow`         | Standard label + control row in property panels.                            |
| `ContextMenu`        | Right-click and `…` overflow menus.                                         |
| `FilterBar`          | Compound filter row (type + folder + date + query).                         |
| `TagPill`            | Compact tinted labels, selector chips, removable tag pills. It derives a token-backed tint from the first meaningful alphanumeric character. |
| `FloatingActionBar`  | Multi-select bulk-action bar.                                               |
| `EmptyState`         | Empty-list / empty-page placeholder.                                        |
| `Dialog`             | Modal dialog with a title and content.                                      |
| `Tooltip`            | Hover and cursor-anchored tooltips. Replaces the native `title` attribute (gated). |
| `Toast`              | Transient confirmation / error notifications.                               |
| `DataTable`          | Tabular data with sorting and selection.                                    |
| `Widget`, `WidgetList`| Borderless tile card (the dashboard pattern). Accepts a `tint`.            |
| `Image`              | Image with built-in blurhash fallback.                                      |
| `CanvasModulePlaceholder`| Diagonal-stripe placeholder for empty modules.                          |
| `ErrorBoundary`      | Component-level error containment.                                          |
| `SkeletonBlock`, `SkeletonCards`, `SkeletonRows`, `SkeletonTree` | Loading-state shimmer primitives. Four named shapes cover nearly every loading region. `SkeletonTree` renders depth-indented placeholder rows with cascading shimmer for tree panels (Layers, Selectors). Shimmer uses `--bg-surface-3/4` tokens. |
| `Kbd`, `ShortcutKeys` | Keyboard keycap and shortcut-sequence primitives. `Kbd` renders a single keycap; `ShortcutKeys` splits a full label ("⌘K", "Ctrl+Shift+P") into per-key `Kbd` spans. Single canonical style across all keyboard hint surfaces (Spotlight footer, module inserter legend, keybindings help screen). |

For tree-shaped controls (DOM panel, layers panel, site tree), use `Tree*` from `src/admin/pages/site/ui/Tree/`.

### Composition helper

Class composition uses `cn` from `@ui/cn` — a 3-line helper in `src/ui/cn.ts`. **Do not** add `clsx`, `tailwind-merge`, `class-variance-authority`, or `@radix-ui/*`. Gated by `no-tailwind-deps.test.ts`.

```ts
import { cn } from '@ui/cn'

<button className={cn(styles.btn, isActive && styles.active, props.className)} />
```

---

## Icons

Icons are TSX components from the vendored `pixel-art-icons` package. Each icon is its own file; deep-import so only used icons enter the module graph:

```tsx
import { ChevronRightIcon } from 'pixel-art-icons/icons/chevron-right'

<ChevronRightIcon />
```

Rules:

- No barrel import (`import { X } from 'pixel-art-icons'`) — always `pixel-art-icons/icons/<name>`.
- No `lucide-react`, `heroicons`, `phosphor-icons`, or other catalogs. Gated by `no-third-party-icons.test.ts`.
- No inline SVG strings in components. Gated by `direct-icon-imports.test.ts`.
- Icons in the panel rail or equivalent identity surfaces are colored via `--rail-icon-color` (which is derived from `--rail-icon-tint`). Don't hardcode `color` on the icon itself.
- Adding a new icon: import it normally, then run `bun run icons:sync`. The vendored set is gated for freshness by `vendor-icons-fresh.test.ts`.

The full set (~4,053 icons) lives in the sibling repo `../pixel-art-icons`; the CMS vendors only the icons it actually imports.

Production builds fold those imported icon modules into one `pixel-art-icons-*`
chunk. That keeps source imports tree-shakeable while avoiding dozens of
sub-1 KB emitted icon chunks.

---

## CSS rules

### CSS Modules only

Files named `Component.module.css` next to `Component.tsx`. Class names are `camelCase`. No Tailwind utility classes in `src/admin/`, `src/modules/`, or `src/ui/` — gated by `noTailwindUtilities.test.ts`. Tailwind ecosystem dependencies are banned outright — gated by `no-tailwind-deps.test.ts`. This includes all palette names (`bg-zinc-100`, `text-blue-400`, etc.), arbitrary-value syntax (`min-h-[44px]`), and `@tailwind` / `@apply` directives.

```text
src/ui/components/Button/
├── Button.tsx
├── Button.module.css
└── index.ts
```

### No hardcoded colors in admin / ui CSS modules

Every color, gradient, and shadow in `src/admin/`, `src/admin/pages/site/`, and `src/ui/` CSS modules is a `var(--*)` reference. If the right token doesn't exist, add it to `globals.css` first. Gated by `css-token-policy.test.ts`.

❌ `color: #ededed;`
✅ `color: var(--text);`

**Exception:** `src/modules/*` is intentionally exempt — those CSS files ship to the published page output where admin tokens are not guaranteed to exist.

### Server-rendered admin surfaces transcribe their tokens

The Hub portal (`server/hub/portalPage.ts`) is admin chrome that lives outside the Vite build: a standalone document served on its own host (`app.*` / `hub.*`), so it cannot import `globals.css`. It still speaks the same language — glass tile, one input focus recipe, brand fill for the single dominant action, aurora page shell.

`server/hub/theme.ts` carries the subset of tokens the portal uses, transcribed from `globals.css`. Never invent a value there; copy it. `hub-theme-tokens.test.ts` fails the build when a transcribed value drifts, when the portal reads a `var(--x)` the theme never declares, when the theme declares a token nothing uses, or when the markup carries a raw hex.

Any future server-rendered admin surface follows the same shape: transcribe, then gate.

### No hardcoded spacing in admin / ui CSS modules

Admin spacing values in `margin*`, `padding*`, `gap`, `row-gap`, `column-gap`, and CSS-authored SVG dimensions use `var(--space-*)` tokens from `src/styles/globals.css`. Gated by `admin-spacing-token-policy.test.ts`.

❌ `padding: 12px 0;`
✅ `padding: var(--space-l) 0;`

**Exception:** `src/modules/*` is intentionally exempt — those CSS files ship to the published page output where admin tokens are not guaranteed to exist.

### No `var(--name, fallback)` in admin / ui CSS modules

Use bare `var(--name)` — never `var(--name, fallback)`. A fallback is either dead code (the token exists — drop the fallback) or a mask for a missing token (define the token in `globals.css` instead). Defaults for JS-driven custom properties belong in a CSS rule (`[data-x]` selector or `:root`), not scattered in every `var()` reader. Gated by `no-css-var-fallbacks.test.ts`.

❌ `color: var(--text-disabled, var(--text-subtle));`
✅ `color: var(--text-disabled);`

**Exception:** `src/modules/*` is exempt — those styles ship to published pages where fallbacks may be the only sensible default.

### No inline `style={{...}}` (with one exception)

Inline `style` is banned. The only legitimate use is **dynamic CSS custom properties** that the static module reads back via `var(--*)`:

```tsx
<div
  className={styles.module}
  style={{ '--module-min-height': `${minHeight}px` } as CSSProperties}
/>
```

```css
.module { min-height: var(--module-min-height); }
```

### No `!important`

Banned in component CSS modules. The only legitimate exceptions are:

- `globals.css` for the `prefers-reduced-motion` override
- `Button.module.css` for specificity reset on variant overrides

If you find yourself reaching for `!important`, the cascade is wrong — fix the selector.

---

## Accessibility

### Reduced motion

`@media (prefers-reduced-motion: reduce)` in `globals.css` zeroes animation / transition durations and disables smooth scroll. Every animated component must respect this — see `Widget.module.css`, `DashboardGrid.module.css`, and `PanelRail.module.css` for the pattern. Non-negotiable (Constraint #189).

### Focus

The focus ring is `--focus-ring` — a 2px brand-tinted ring visible on every surface of the dark ramp. Inputs pair `--border-focus` with the `--shadow-input-focus` glow. Never remove focus indicators without replacing them with a visible alternative.

### Color contrast

The content text tokens (`--text-bright` → `--text-subtle`) pass WCAG AA (≥4.5:1) on every surface up to `--bg-surface-3`. `--text-disabled` is exempt because it may only mark **disabled states** — never use it for content, labels, or placeholders (placeholders use `--text-subtle`). The semantic state tokens have a `*-text` variant (e.g. `--danger-text`, `--success-text`) chosen for use **on a tinted background** — use those instead of pairing a raw `--danger` with `--bg-body`. `--brand-ink` is the only approved text color on brand fills.

### No native browser dialogs

`alert()`, `confirm()`, `prompt()` are banned — gated by `no-native-browser-dialogs.test.ts`. Use the `Dialog` primitive or component state with `role="alert"` / `role="status"`.

### No native title tooltips

The HTML `title` attribute is banned for hover hints — gated by `no-native-title-tooltips.test.ts`. Use the `Tooltip` primitive.

---

## Forbidden patterns

| Pattern                                                  | Use instead                                              |
|----------------------------------------------------------|----------------------------------------------------------|
| `<button>` in editor / admin code                        | `<Button>` from `src/ui/components/Button`               |
| `color: #ededed;` (hardcoded color)                      | `color: var(--text);`                             |
| `border: 1px solid #333;` (hardcoded border)             | `border: 1px solid var(--border);`                |
| `var(--text, #ededed)` (var with fallback)        | `var(--text)` — define the token in `globals.css` |
| `className="text-zinc-400"` (Tailwind utility)           | CSS Module class                                         |
| `className="bg-blue-500"`, `min-h-[44px]`, etc.          | CSS Module class with a token                            |
| `import { cn } from 'clsx'`                              | `import { cn } from '@ui/cn'`                            |
| `import { X } from 'lucide-react'`                       | `import { XIcon } from 'pixel-art-icons/icons/<name>'`   |
| `style={{ color: 'white' }}`                             | CSS Module class — `style` is only for CSS custom properties |
| `!important` in a component CSS module                   | Restructure selectors                                    |
| `alert('Saved!')`                                        | Toast or `role="status"` element                         |
| `<input title="Help text">` (hover hint)                 | `<Tooltip>` primitive                                    |
| Inline SVG icon string                                   | `pixel-art-icons/icons/<name>`                           |
| Card with a colored border                               | Borderless tile on a darker parent (1px gap pattern); glass hero tiles use `--glass-border` only |
| Hover that recolors a flat card's border                 | Hover that lifts the surface tone (`-surface-2` → `-3`); only glass hero tiles may warm the border via `--glass-border-hover` |
| Raw `font-weight: 560/620/650`                           | The four `--weight-*` tokens                             |
| Ad-hoc `transition: ... 0.1s ease` (gated)               | `var(--duration-fast/-/slow)` + `var(--ease)` / `var(--ease-out)`. `radius-motion-token-policy.test.ts` gates raw `transition` durations against a frozen baseline; `animation` loop periods and reduced-motion sentinels are exempt |
| Raw `border-radius: 8px` (gated)                         | A radius token (`--radius-sm` … `--card-radius`, `--radius-pill`); `var()` / `calc()` / `0` / `%` are exempt |
| A second chromatic accent for actions                    | `--brand-*` is the only interactive accent — demote the rest |
| Filling an input with a tinted background                | Transparent fill, white-alpha border                     |
| Inventing a one-off color for a category                 | Use `assignRailAccents` / `railAccent` from `@ui/railAccent`, or add a new tint token in `globals.css`|

---

## Adding a new design token

1. Add the CSS custom property to `src/styles/globals.css` in the appropriate group.
2. Add a one-line comment if the meaning isn't obvious from the name.
3. Use it via `var(--*)` in CSS modules.
4. If it represents a new concept (not a variation of an existing group), update [docs/reference/design-tokens.md](reference/design-tokens.md).

## Adding a new UI primitive

1. Create `src/ui/components/<Name>/<Name>.tsx`, `<Name>.module.css`, and `index.ts`.
2. Re-export from `src/ui/components/index.ts` so consumers import from `@ui/components`.
3. The primitive must work with the existing tokens — do not introduce new colors, radii, font sizes, or spacing values to support it. If you need new tokens, see "Adding a new design token" first.
4. If it replaces a bare HTML control (`button`, `input`, etc.), update the matching architecture test's allowlist or gate.
5. Document it in the components table above and (if it has non-obvious usage) write a short [docs/reference/ui-primitives.md](reference/ui-primitives.md) entry.

## Adding a new tile-card surface

1. Use `--bg-surface` on the parent container with `display: grid` and `gap: 1px`.
2. The tile body is `background: var(--bg-surface-2)`, `border: 0`, `border-radius: var(--card-radius)`.
3. Hover lifts to `--bg-surface-3` — never recolor the border.
4. Add a title row with an accent dot (7px, `--radius-sm` (3px), `background: var(--tint)`).
5. Use `assignRailAccents` from `@ui/railAccent` for multi-item surfaces (avoids repeats in the visible group) or `railAccent` for a single item. Skip if the surface has a product-defined category.
6. Reuse `Widget` from `src/ui/components/Widget/` unless the surface fundamentally differs.

---

## Related

- [docs/CONVENTIONS.md](CONVENTIONS.md) — how docs in this repo are structured
- [docs/architecture.md](architecture.md) — system overview
- [docs/reference/design-tokens.md](reference/design-tokens.md) — complete token catalog
- [docs/reference/ui-primitives.md](reference/ui-primitives.md) — primitive usage cookbook
- Source-of-truth files:
  - `src/styles/globals.css` — all tokens
  - `src/ui/components/` — all primitives
  - `src/ui/cn.ts` — class composition helper
  - `src/ui/railAccent.ts` — rail accent assignment helpers (`railAccent`, `assignRailAccents`, `railTintVar`, `RAIL_ACCENTS`, `RailAccent`)
  - `src/ui/components/Widget/Widget.module.css` — canonical tile-card implementation
  - `src/admin/pages/dashboard/components/DashboardGrid.module.css` — canonical 1px-gap grid
  - `src/admin/pages/site/sidebars/PanelRail/PanelRail.module.css` — canonical tinted rail CSS
  - `vendor/pixel-art-icons/` — vendored icon set
- Gate tests:
  - `src/__tests__/architecture/css-token-policy.test.ts` — no hardcoded colors in admin / ui CSS modules
  - `src/__tests__/architecture/admin-spacing-token-policy.test.ts` — admin / ui margin, padding, gap, and CSS-authored SVG dimensions use fluid `--space-*` tokens
  - `src/__tests__/architecture/no-css-var-fallbacks.test.ts` — no `var(--name, fallback)` in admin / ui CSS modules
  - `src/__tests__/architecture/scrollbar-chrome.test.ts` — scrollbar tokens declared in `globals.css`; both Firefox and WebKit/Blink implementations use them; properties panel uses `scrollbar-gutter: stable`
  - `src/__tests__/architecture/noTailwindUtilities.test.ts` — no Tailwind utility classes (covers all palette names)
  - `src/__tests__/architecture/no-tailwind-deps.test.ts` — no Tailwind ecosystem dependencies
  - `src/__tests__/architecture/button-primitive-usage.test.ts` — every button goes through `Button`
  - `src/__tests__/architecture/ui-primitives-location.test.ts` — primitives live in `src/ui/components/`
  - `src/__tests__/architecture/no-third-party-icons.test.ts` — icons come from `pixel-art-icons`
  - `src/__tests__/architecture/direct-icon-imports.test.ts` — no inline SVG strings
  - `src/__tests__/architecture/vendor-icons-fresh.test.ts` — vendored icon set is fresh
  - `src/__tests__/architecture/no-native-browser-dialogs.test.ts` — no `alert` / `confirm` / `prompt`
  - `src/__tests__/architecture/no-native-title-tooltips.test.ts` — no `title=` hover hints
  - `src/__tests__/architecture/close-icon-correctness.test.ts` — close icons render the right glyph
