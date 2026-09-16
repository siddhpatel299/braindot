# Braindot — Design System

Recorded from the shipped code on 2026-09-16, rewritten from scratch after the
pass that brought the workspace into the entry world. Every value below was read
out of the build. Contrast ratios were computed from the hex in the stylesheets,
not estimated. Where a direction contract and the build disagree, the build is
recorded and the divergence is named in §9.

Sources of truth, in precedence order:

1. `src/app/glass-tokens.css` — the shared token layer: ground, ink, accent, the
   three glass grades, elevation, radii, faces, motion, the `.world-ink`
   browser-surface rules, and the self-hosted `@font-face` declarations.
2. `src/app/globals.css` — the workspace's semantic palette (three theme
   blocks), the chrome material, the state tokens, the scrim, the luminance
   field, and the `.auth*` rules. It `@import`s glass-tokens.css.
3. `src/app/landing/landing.html` + `src/app/landing/route.ts` — the Persuade
   page and the token-inlining arrangement.
4. `src/components/second-brain/*` — how the material is actually applied.

---

## 0. One world, two registers

Braindot ships **one** visual world: **midnight ink**. A blue-black ground, an
iron-gall indigo accent, and glass as a specific, budgeted material. The
workspace's former "slip-box" world — warm graphite and warm paper — is
**retired**; no token, palette or rule from it survives in the build, and the
header comments in both stylesheets say so.

The world runs in two registers. A register is a set of constraints on the same
materials, not a different world.

| | **Persuade** | **Operate** |
|---|---|---|
| Surfaces | `/landing`, `/auth` | the workspace app, `/demo`, published pages |
| Theme | always night; `color-scheme: dark` is declared in the landing `<head>` | `[data-theme="dark"]` and `[data-theme="light"]`, reader's choice |
| Ground | `--ink-0 #05070d` | `--bg` `#06080f` (dark) / `#eef1f7` (light) |
| Type | Manrope throughout; mono for measured values and key caps only | JetBrains Mono chrome; a reader-chosen prose face for prose |
| Glass | full-bleed — CHROME, PANE and WELL over a live force-directed graph | chrome **only**; never the page someone writes or reads on |
| Motion | one arrival animation, then still | state or nothing |

**What holds them together** is the accent and the ground family. `#6f63e0` is
`--accent` in the token layer and `--acc` in the workspace's dark theme — the
same hex, the one piece of this that is brand rather than styling. The blinking
block-caret wordmark is the other: `.caret` on `/landing`, `.sb-caret` in the
Next app.

**One token file, two consumers.** `glass-tokens.css` is `@import`-ed by
`globals.css` for the bundler, and read off disk and inlined by
`src/app/landing/route.ts` at the `/*@design-tokens@*/` marker for the raw-HTML
route. `/landing` is served outside the Next layout because the app's `body` is
`height:100dvh; overflow:hidden` and a marketing page must scroll, so it cannot
import a bundler-owned stylesheet. The route **throws** rather than serving an
unstyled page if the marker is missing. Add a shared token to
`glass-tokens.css` and nowhere else — the hand-copied palette that preceded it
is how `/landing` ended up a generation behind the app.

---

## 1. Ground and ink

### 1.1 The shared ground (`glass-tokens.css`)

Blue-black, never neutral. A neutral grey ground under a white-alpha glass fill
turns the glass grey too; the blue is what leaves the `saturate()` in the
backdrop filter something to lift.

| Token | Value | Job |
|---|---|---|
| `--ink-0` | `#05070d` | the page itself |
| `--ink-1` | `#0a0e18` | a raised field |
| `--ink-2` | `#111726` | a well's floor |
| `--ink-3` | `#1a2133` | a hairline, a track, a disabled fill |
| `--ink-t1` | `#f2f4f9` | primary ink — 18.3:1 on `--ink-0` |
| `--ink-t2` | `#a8b0c4` | secondary — 9.28:1 on `--ink-0` |
| `--ink-t3` | `#757f9b` | quiet tier — 5.05:1 on `--ink-0`, 4.84:1 on `--ink-1`, 4.48:1 on `--ink-2` |

### 1.2 The workspace palette (`globals.css`)

Three blocks ship identically-keyed tokens: `[data-theme="dark"]`,
`[data-theme="light"]`, and `:root:not([data-theme])` (the pre-JS default,
duplicating dark). **The `:not()` is load-bearing** — a plain `:root` has the
same specificity as `[data-theme="light"]` and, coming later in the file, would
permanently defeat light mode.

| Token | Dark | Light |
|---|---|---|
| `--bg` … `--bg4` | `#06080f #0b0f1a #121827 #1a2133 #252d42` | `#eef1f7 #f9fafd #e3e8f1 #d5dce8 #c3ccdb` |
| `--bd` / `--bd2` | `#1a2031` / `#39435a` | `#dce2ec` / `#aeb8c9` |
| `--t1` / `--t2` / `--t3` | `#f2f4f9` / `#a8b0c4` / `#8b94af` | `#121620` / `#4d5666` / `#525b6d` |
| `--acc` / `--acc2` | `#6f63e0` / `#9d93ff` | `#5449c9` / `#3b32a8` |
| `--acc-bg` / `--acc-bd` | `#1c1a38` / `#3b3480` | `#e8e6fb` / `#bfb9ee` |
| `--on-acc` | `#ffffff` | `#ffffff` |
| `--grn` / `--amb` / `--blu` / `--red` / `--coral` | `#4ad6a4 #efb45c #7cb4ec #ff7a72 #f0996f` | `#0c7a59 #96590f #1c6ca5 #b4261d #a8480f` |
| `--paper` / `--rule` / `--hair` | `#0b0f1a` / `#4a5570` / `#1a2031` | `#f9fafd` / `#9aa5b8` / `#dce2ec` |
| `--canvas-dot` | `#1a2031` | `#ccd5e3` |
| `--selection-bg` | `rgba(157,147,255,0.26)` | `rgba(84,73,201,0.18)` |

Light is a **cool** near-white, not warm paper: the same glass and the same
indigo sit on it, and warm paper under a cool blur goes muddy.

Each state hue ships `-bg` and `-bd` companions, so a state chip is a fill, an
edge and an ink from one family rather than an opacity guess.

### 1.3 Contrast is measured against the surface a tier sits on

Not against the darkest available ground. `--t3` is the quietest tier — section
labels, note metadata, inactive tabs, the status bar, empty-state hints — and it
was retuned until it clears 4.5:1 on **every** ground it is actually set on:

- dark `#8b94af`: 6.63 on `--bg`, 6.34 on `--bg1`, 5.86 on `--bg2`, 5.31 on `--bg3`
- light `#525b6d`: 6.03 on `--bg`, 6.54 on `--bg1`, 5.55 on `--bg2`, 4.95 on `--bg3`

`--on-acc` white clears 4.63:1 on dark `--acc` and 6.62:1 on light `--acc`, so a
filled button can carry it in either theme. `--acc2` is 7.67:1 on dark `--bg`,
so the lit accent can also just be text.

**A token enters the system with its ratio against the grounds it is used on, or
it does not enter.** This rule is inherited by anything new.

---

## 2. Glass — three grades, and the difference is the point

Glass is an effect with a job, not a finish sprayed on boxes.

| Grade | Fill | Lens | Carries |
|---|---|---|---|
| **CHROME** | `--glass-chrome-fill` `rgba(10,14,24,0.72)` | `blur(24px) saturate(180%)` | floats over everything; must stay light enough to see past |
| **PANE** | `--glass-pane-fill` `rgba(10,14,24,0.78)` | `blur(40px) saturate(160%)` | holds the argument; heavier blur, so the graph behind goes soft |
| **WELL** | `--well-fill` `rgba(8,11,20,0.90)` | **none** | a recessed opaque floor — where text actually lives |

**Fills are floored on the ground, not tinted with white.** A white-alpha fill
inherits whatever luminance drifts behind it, so text on it has no contrast
ratio at all. Basing the fill on `--ink-1` at 0.72–0.90 keeps the backdrop
visible as colour and movement while putting a **known floor** under every
glyph. The white sheen that makes it read as glass moves to the specular edge
and a top-light gradient:

- `--glass-specular` `inset 0 1px 0 rgba(255,255,255,0.18)` — the line along the
  top edge where the pane turns toward the light. This single inset is most of
  what separates glass from a translucent rectangle.
- `--glass-underside` `inset 0 -1px 0 rgba(0,0,0,0.35)`
- `--glass-edge` `rgba(255,255,255,0.10)`, `--glass-edge-strong` `0.16`
- `.g-pane` adds a top-light gradient: white at 5.5% → 1.2% at 42% → transparent
  at 70%.

The material classes `.g-chrome`, `.g-pane`, `.g-well` are declared once in the
token file, so a pane on `/landing` and a pane on `/auth` are literally the same
object.

### 2.1 The workspace chrome material

Operate does not use `.g-pane`. It uses three tokens the components reference
rather than re-declaring a material each:

| Token | Dark | Light |
|---|---|---|
| `--chrome` | `color-mix(in srgb, var(--bg1) 74%, transparent)` | `… var(--bg1) 80% …` |
| `--chrome-2` | `color-mix(in srgb, var(--bg2) 76%, transparent)` | `… var(--bg2) 82% …` |
| `--chrome-blur` | `blur(22px) saturate(170%)` | `blur(22px) saturate(150%)` |
| `--chrome-edge` | `inset 0 1px 0 rgba(255,255,255,0.055)` | `inset 0 1px 0 rgba(255,255,255,0.9)`, plus a bottom inset of `--bd2` at 70% |

On a light ground a white specular is invisible; a pane in daylight catches the
light as a **darker** line where it turns, so the light theme's top edge is a
tint of the ground with a soft under-line to seat it.

Applied as CHROME (`--chrome`): `IconRail`, `EditorBar`, `StatusBar`,
`ContextPanel`, `MobileTopBar`, `MobileTabBar`.
Applied as heavier floating chrome (`--chrome-2`): `NotesSidebar`,
`CommandPalette`, `AppDialog`, `ShareDialog`, `AskAIModal`, `MobileSheet`,
`SlashMenu`.

Overlays sit on `--scrim` with a `blur(3px)` of their own: `rgba(3,5,10,0.64)`
in dark, `rgba(18,22,32,0.30)` in light. A raw black scrim is two wrong things
at once — not the ground's hue, and the value that reads as "dimmed" over
graphite reads as "switched off" over paper.

### 2.2 State on glass

An opaque palette step used as a hover fill punches a hole in a translucent
pane. State tokens are **ink and light**, not surfaces — they tint whatever they
are laid on:

- dark: `--ink-hover` `rgba(255,255,255,0.065)`, `--ink-active` `rgba(255,255,255,0.115)`
- light: `--ink-hover` `rgba(18,22,32,0.055)`, `--ink-active` `rgba(18,22,32,0.092)`

An active **well** stays opaque, because a well is opaque by definition.

---

## 3. Text never sits on a backdrop-filter

The contrast of a blur is whatever happens to be behind it that second, and that
is not a ratio you can hold for an hour of reading. So:

- `EditorCanvas` — the writing surface — is opaque `var(--bg)`.
- `ReadingView` — the reader — is opaque `var(--bg)`.
- The `NotesSidebar` spine strip is opaque `var(--bg)`.
- On `/landing`, sustained reading happens in `.g-well`: the atomic-note
  demonstration, the file tree, the data cards. A WELL is never blurred.

Glass in Operate is chrome and nothing else — labels, icons, counts, a command
list. Prose never crosses onto it.

---

## 4. The luminance substrate

A `backdrop-filter` over flat colour is grey plastic. Both registers put deep,
soft colour under the glass, never seen directly as shapes, only ever as the
thing the panes are lifting.

**Persuade** — `/landing` `.wash` (fixed, z-index 0), three radial fields:
indigo `rgba(111,99,224,0.34)` at 72%/24%, blue `rgba(58,116,214,0.20)` at
14%/78%, periwinkle `rgba(157,147,255,0.16)` at 92%/88%. Above it `#field`, the
live force-directed graph canvas, masked by a slow vignette so the centre stays
brightest. `/auth` runs the same substrate with the light moved left
(`.auth-wash`) and a static field SVG at 0.6 opacity.

The wash **settles once and holds**: `animation: drift 2.4s var(--ease) 1 both`,
inside `prefers-reduced-motion: no-preference`. It used to drift on an infinite
alternate, and as a fixed element under four backdrop-filters, every step
invalidated all of them.

**Operate** — `.sb-app-shell::before`, static with no drift: accent at 30% from
`-4% 26%` and blue at 22% from `104% 72%`. Hard left behind the rail and the
notebook list, hard right behind the apparatus margin, and nothing spent on the
middle where the editor is opaque anyway. This is a surface someone stares at
for eight hours; Operate-mode motion conveys state or it does not happen.

---

## 5. Degradation — every glass surface degrades twice

Both are non-negotiable and both ship in both stylesheets.

1. `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))`
   — the fill carries the whole job alone. `.g-chrome` and `.g-pane` go to
   `rgba(10,14,24,0.95)`; `--chrome`/`--chrome-2` collapse to opaque
   `--bg1`/`--bg2`. Without it a "pane" is a translucent rectangle with the page
   legible straight through its labels.
2. `@media (prefers-reduced-transparency: reduce)` — the panes stay, because
   they are the composition, but they stop being see-through:
   `rgba(10,14,24,0.96)`/`0.97` with `backdrop-filter: none`;
   `--chrome-blur: none`.

Motion degrades too: `prefers-reduced-motion: reduce` flattens every transition
and animation to `0.01ms` across `*`, with `.sb-spin` exempt — a spinner is the
only thing saying a request is in flight, and freezing it mid-rotation reads as
"hung", the one state it exists to rule out.

---

## 6. Typography — split between the registers, on purpose

Both faces are self-hosted variable woff2 in `/public/fonts`, declared once in
`glass-tokens.css` with `font-display: swap` and a latin `unicode-range`, so
both consumers get them from the same place and `/landing` has no third-party
stylesheet on its critical path. The Next app additionally loads its faces via
`next/font` in `layout.tsx`; `@theme inline` is required in the Tailwind block
so the hashed family names resolve at runtime rather than build time.

**Persuade — Manrope** (`--face-ui`, 300–800). Tight apertures, near-geometric,
confident at display size, and not the face every generator reaches for. The
system stack is a fallback, never a choice.

**Operate — JetBrains Mono** (`--face-mono` / `--font-mono`, 400–600) as the
chrome's identity, applied by a blanket element rule with `!important`. This is
deliberate: the chrome is an instrument panel and reads as one, while prose gets
a face chosen by the person reading it.

**The prose face is the reader's.** `--editor-font` defaults to
`--font-reading-serif` (Iowan Old Style / Palatino / Charter / Georgia) —
**prose is prose** — with `[data-editor-font="mono"]` and `="sans"` one click
away in Settings. It governs `.sb-editor-textarea`/`.sb-editor-pre` (which must
share exact metrics or the caret drifts), `.sb-prose-input`, `.sb-reading`,
`.sb-preview-prose` and `.sb-reader-prose`. Code inside prose keeps the
typewriter face — it is not prose and should not pretend.

**The boundary.** The blanket mono rule shouts, so the storefront shouts back:
`.auth, .auth *` sets `--face-ui` with `!important` (a class beats an element
selector), `.auth .mono` restores the mono for its two jobs, and
`.auth .sb-caret` repaints the shared wordmark caret with `--accent-lum` so a
light-theme visitor does not get `#5449c9` on a near-black ground.

### 6.1 The shared ramp

Fluid, `clamp()`-based, in `glass-tokens.css`:

| Step | Value |
|---|---|
| `--step--1` | `clamp(0.80rem, 0.78rem + 0.10vw, 0.86rem)` |
| `--step-0` | `clamp(0.95rem, 0.92rem + 0.16vw, 1.06rem)` |
| `--step-1` | `clamp(1.13rem, 1.05rem + 0.38vw, 1.35rem)` |
| `--step-2` | `clamp(1.45rem, 1.27rem + 0.90vw, 2.00rem)` |
| `--step-3` | `clamp(1.95rem, 1.55rem + 2.00vw, 3.10rem)` |
| `--step-4` | `clamp(2.60rem, 1.75rem + 4.20vw, 4.75rem)` |

Persuade headings: weight 800, `letter-spacing: -0.035em`, `line-height: 1.04`,
`text-wrap: balance`. `h1` in the hero is `--step-4`; `h2` is `--step-3`; `h3` is
`--step-1` at `-0.02em`. `.lede` is `--step-1` at `line-height: 1.6`, capped at
`62ch`; `.body` at `70ch`.

Operate type is set in literal px (see §9.6); the reader's own ramp is
proportional to `--reader-fs` (default 18px, `line-height: 1.75`), so one
control moves the whole hierarchy: `h1` 1.7em, `h2` 1.32em, `h3` 1.12em.

### 6.2 The reading room

- Scrolling reading caps the measure at `68ch` (`ch`, so it tracks the reader's
  chosen size rather than running wide when they size down).
- `.sb-reader-page` is 920px max with a 218px right padding and a 190px outer
  margin for the reader's own marks — the proportions of a book page, not a
  centred web column. Below 1180px the margin is dropped and the marks move to a
  drawer.
- Paged reading (`.sb-book-flow`) is `column-fill: auto` with a 72px gutter,
  sliding `transform 260ms cubic-bezier(0.22,0.7,0.25,1)`. Body is justified
  **with** `hyphens: auto` and `hyphenate-limit-chars: 6 3 3` — the pair is the
  point, since justifying a 40-character column without hyphenation opens rivers
  down the page. Headings stay ranged left, `break-after: avoid-column`;
  paragraphs carry `orphans: 2; widows: 2`.
- A highlight is a mark on the page, not a chip: `mark` keeps its text colour
  and takes a wash behind it.

---

## 7. Elevation, radii, motion

**Elevation** — three layers, because one blurred drop shadow reads as a
sticker: a tight contact shadow, a mid shadow for the gap, a wide ambient one
for the room.

- `--lift-1` `0 1px 2px rgba(0,0,0,.30), 0 4px 12px -4px rgba(0,0,0,.40)`
- `--lift-2` adds `0 10px 28px -10px rgba(0,0,0,.50)` and `0 36px 72px -32px rgba(0,0,0,.60)`
- `--lift-glow` `0 8px 32px -8px rgba(111,99,224,.45)`
- Workspace overlays add `0 24px 64px -18…-20px rgba(0,0,0,0.6)` on top of
  `--chrome-edge`; the palette and the AI modal add `0 0 0 1px var(--acc-bd)`.

**Radii** — `--r-xs 8`, `--r-sm 12`, `--r-md 18`, `--r-lg 26`, `--r-xl 34`,
`--r-pill 999`. Nested radii stay concentric: a child's radius is the parent's
minus its inset, so corners run parallel instead of crossing. PANE is `--r-lg`,
WELL is `--r-md`.

**Motion** — one ease, used everywhere, so the whole surface moves like one
object: `--ease cubic-bezier(0.16, 1, 0.3, 1)` (leaves fast, lands slow, never
overshoots), with `--ease-in-out cubic-bezier(0.65,0,0.35,1)` for the
symmetrical cases. Durations `--t-fast 160ms`, `--t-mid 320ms`, `--t-slow 620ms`.
Theme changes cross-fade at `background-color 180ms`, `border-color 180ms`,
`color 100ms`. Hover lift is **1px** and nothing scales.

---

## 8. Browser surfaces and layout

`.world-ink` on `<html class="world-ink">` (`/landing`) and
`<div className="auth world-ink">` (`/auth`) claims the surfaces the browser
would otherwise paint with no design system at all: selection
`rgba(157,147,255,0.28)`, caret `--accent-lum`, an 11px scrollbar with an
`--ink-3` thumb clipped to its content box, `:focus-visible` as a 2px
`--accent-lum` outline at 2px offset, `.fig { font-variant-numeric: tabular-nums }`
for figures that get compared, and `text-underline-offset: 0.22em` so a link's
underline clears its descenders. Operate covers the same ground through
`color-scheme`, declared next to each palette so a new theme cannot be added
without one — otherwise the app runs dark with a white scrollbar down the side.

**Layout.** Persuade: `.wrap` is 1180px, `.sec` is
`padding: clamp(96px,13vh,172px) clamp(16px,4vw,40px)`, the hero pane is 560px
max at `clamp(28px,4vw,46px)` padding, `.narrow` is 720px. Breakpoints at 900px
and 700px. Operate: `body` and the shell are `100vh` then `100dvh` — `vh` is
measured against a hidden URL bar, so on a phone the last rows sit under the
browser chrome — with `overflow: hidden`, because the app is a desk that owns
the window. `/auth` opts out and becomes its own scroll container, because a
form can be taller than a phone. `touch-action: manipulation` on everything
clickable, in both registers: nothing here is a zoom target, so the ~300ms
double-tap wait is pure latency.

---

## 9. Named rules

1. **One world, two registers.** A surface picks Persuade or Operate; it does
   not mix their constraints. Persuade is always night because glass needs a
   dark ground and something worth looking through. Operate keeps both themes
   because it is stared at for eight hours.
2. **Glass needs something to look through.** No pane over flat colour; the
   wash, the field and `.sb-app-shell::before` are structural, not decoration.
3. **Three grades, chosen by job.** CHROME to float, PANE to argue, WELL to
   read. A WELL is never blurred.
4. **Text never sits on a backdrop-filter.** The writing surface and the reader
   are opaque `var(--bg)`. In Operate, glass is chrome only.
5. **Floored, not tinted.** A glass fill is the ground at high alpha, never
   white-alpha, so every glyph has a known floor. The sheen lives in the
   specular edge.
6. **Every glass surface degrades twice** — `@supports` and
   `prefers-reduced-transparency` — and the fill carries the job alone in both.
7. **Contrast is measured against the surface a tier actually sits on**, not the
   darkest one available. A tier enters the system with those numbers.
8. **The accent is for light, not for warning.** Amber, green, blue, coral and
   red keep their own reserved hues with `-bg`/`-bd` companions.
9. **State on glass is ink, not a surface.** `--ink-hover`/`--ink-active` tint;
   they never punch an opaque hole in a pane.
10. **One ease, three durations.** Hover lift is 1px; nothing scales; Persuade
    animates once on arrival; Operate animates only to convey state.
11. **Mono earns its place twice in Persuade only** — measured values and key
    caps — and is the whole chrome identity in Operate. Prose is never mono
    unless the reader chose it.
12. **One token file, two consumers.** Never a second copy of the palette; the
    landing route throws rather than shipping an unstyled page.
13. **The demo link survives every breakpoint.** It is the cheapest way in and
    the only one needing no email.

---

## 10. Prohibitions

Each checked against the world's own materials; none bans a device the build
itself uses natively.

- **No eyebrow or kicker text above a heading.** Format badges that name real
  data (`.src-kind`: EPUB / ARXIV / ARTICLE / PDF; `.md-codeblock-lang`) and
  column labels that name a real place (`.sb-shelf-head-label`, `.meta`) are not
  kickers — they carry information. A decorative line of small caps above a
  headline is.
- **No icon-heading-text card grid.** Persuade's evidence is arranged as
  demonstrations: a live wiki-link driving a backlink stack, a scrolling shelf, a
  transcript.
- **No section numbers in the product UI.**
- **No hard-offset shadows.** All elevation is soft and centred; this is not a
  neobrutalist world.
- **No glyph or emoji icons.** SVG only — `svg.ic` with `currentColor` stroke in
  Persuade, Lucide in Operate.
- **No system display face.** Manrope carries display; the system stack is a
  fallback, never a choice.
- **No blur as a finish.** If a surface is not CHROME, PANE or workspace chrome,
  it does not get a `backdrop-filter`.
- **No warm ground.** The light theme is a cool near-white. Warm paper under a
  cool blur goes muddy, and that is what retired slip-box.
- **No focus state without a visible ring.**
- **No claim that outruns the tree.** Copy names only shipped behaviour.

---

## 11. Not canonized, not repaired

Recorded as defects or divergences the build carries. None is a design-system
rule, and no future surface should inherit any of them.

1. **`--ink-t3` is 4.48:1 on `--ink-2`** — a hair under 4.5:1. It clears on
   `--ink-0` (5.05) and `--ink-1` (4.84). §1.1 records the measured numbers per
   ground rather than a blanket clearance; the token is **not** re-recorded at a
   rounder figure to make the shortfall disappear. Not retuned here.
2. **Body-adjacent copy reads on glass in Persuade.** The hero `.lede` and
   `.bl-quote` sit on `.g-pane` — a `backdrop-filter` — against the token file's
   own "body copy never sits on a backdrop-filter". The floored 0.78 fill and the
   two degradation paths make it survivable, and §3 records the rule as the build
   obeys it (sustained reading is in a WELL). The stricter reading is not
   recorded as satisfied.
3. **The workspace has no spacing, type-scale or radius tokens.** Font sizes are
   literal px across the stylesheet (6.5px–18px) and radii are ad-hoc 1–14px,
   with 3/4/5px accounting for most of ~160 declarations in the components while
   the shared scale starts at 8px. The `--r-*` and `--step-*` tokens exist and
   Operate does not use them. Real inconsistency; predates this pass and
   repairing it was not asked for.
4. **`--t3`'s two themes are not the same distance from their ground** (dark
   6.63:1 vs light 6.03:1 on `--bg`), so the quiet tier is slightly louder in
   dark. Within spec, recorded rather than tuned.
5. **Fixed from the previous record, confirmed in the build:** `/landing` no
   longer fetches faces from Google Fonts (self-hosted variable woff2, preloaded,
   same-origin), and `/auth`'s wordmark caret no longer leaks the workspace
   accent (`.auth .sb-caret` paints `--accent-lum`). The slip-box palette is gone
   entirely; the previous DESIGN.md's World 2 documented tokens that no longer
   exist in the build.
