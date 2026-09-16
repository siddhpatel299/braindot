# Braindot — Design System

Recorded from the shipped code on 2026-09-16. Every value below was read out of
the build, not out of a brief. Where the direction contract and the build
disagree, the build is recorded and the divergence is named.

Sources of truth, in precedence order:

1. `src/app/glass-tokens.css` — the entry world's whole token layer and its
   material classes.
2. `src/app/globals.css` — the workspace world's palettes (`[data-theme]`
   blocks) and the `.auth*` rules.
3. `src/app/landing/landing.html` — the entry world's page-level rules.
4. `src/app/layout.tsx`, `src/app/landing/route.ts` — how faces and tokens
   reach each surface.

---

## 0. Two worlds, on purpose

Braindot ships **two** visual worlds. This is a decision, not drift, and it is
declared in code at the top of `glass-tokens.css`.

| World | Governs | Ground | Material |
|---|---|---|---|
| **Midnight ink** | `/landing`, `/auth` | blue-black `#05070d`, always night | real glass over a live graph |
| **Slip-box** | the entire workspace app, `/demo`, published pages | warm graphite (dark) or warm paper (light), user's choice | ink on paper, apparatus in the margin |

Neither world is deprecated. They are separated by job, not by age:

- The storefront is met once, by someone with no account and no theme
  preference. It is always dark because glass needs a dark ground and something
  worth looking through, or a `backdrop-filter` resolves to grey plastic.
- The workspace is stared at for eight hours and therefore gets a light/dark
  choice, a reading face, and a quiet ground that does not compete with prose.

**What holds them together is the ink.** `#6f63e0` iron-gall indigo is
`--accent` in the entry world and `--acc` in the workspace's dark theme — the
same hex, the one fixed piece of brand. The blinking block-caret wordmark is the
other: it appears as `.caret` on `/landing` and `.sb-caret` on `/auth` and in
the app.

**Crossing the boundary is a defect.** A surface is in exactly one world. Entry
surfaces carry the `world-ink` class (`<html class="world-ink">` on the landing
page; `<div className="auth world-ink">` on `/auth`) and use only `--ink-*`,
`--accent*`, `--glass-*`, `--r-*`, `--step-*`, `--face-*`. Workspace surfaces
use only `--bg*`, `--t*`, `--acc*`, `--paper`, `--rule`, `--hair`.

**One token file, two consumers.** `glass-tokens.css` is `@import`-ed by
`globals.css` for the bundler, and read off disk and inlined by
`src/app/landing/route.ts` at the `/*@design-tokens@*/` marker for the raw-HTML
route. `/landing` is served outside the Next layout because the app's `body` is
`overflow:hidden` and a marketing page must scroll, so it cannot import a
bundler-owned stylesheet. The route throws rather than serving an unstyled page
if the marker is missing. **Add an entry-world token to `glass-tokens.css` and
nowhere else** — the previous hand-copied palette is how `/landing` ended up a
generation behind the app.

---

# World 1 — Midnight ink

Governs `/landing` and `/auth` only.

## 1.1 Ground and ink

| Token | Value | Job |
|---|---|---|
| `--ink-0` | `#05070d` | the page itself |
| `--ink-1` | `#0a0e18` | a raised field |
| `--ink-2` | `#111726` | a well's floor |
| `--ink-3` | `#1a2133` | hairline, track, disabled fill, scrollbar thumb |
| `--ink-t1` | `#f2f4f9` | primary text — 18.3:1 on `--ink-0` |
| `--ink-t2` | `#a8b0c4` | secondary text, all body copy — 9.3:1 |
| `--ink-t3` | `#6f7994` | quietest tier — 4.64:1 on `--ink-0`, 4.53:1 on `--well-fill` |

The ground is blue-black and **never neutral grey**: a neutral ground under a
white-alpha fill gives the `saturate()` in the backdrop filter nothing to lift,
and the glass comes out grey.

`--ink-t3` is a measured floor, not an eyeballed one. It clears 4.5:1 on the two
grounds it is specified against (`--ink-0`, `--well-fill`). See §1.9 for where
it does not.

## 1.2 Accent and state

| Token | Value | Job |
|---|---|---|
| `--accent` | `#6f63e0` | filled surfaces only — buttons, the skip link, pips. **Not a text colour** (4.35:1). |
| `--accent-lum` | `#9d93ff` | anything that emits: live node, focus ring, link, wiki-link, caret. 7.72:1, so it may also be text. |
| `--accent-deep` | `#4a3fb8` | declared; reserved. |
| `--on-accent` | `#ffffff` | ink on an accent fill — 4.63:1 on `--accent`. |
| `--amber` | `#efb45c` | state, and the reader's highlight |
| `--green` | `#4ad6a4` | state, live/ok, the lock glyph |
| `--red` | `#ff7a72` | state, error iconography |

State keeps its own reserved hues so the accent never has to double as a
warning. This rule is shared with the workspace world.

## 1.3 Glass — three grades, and the difference is the point

Glass is a specific effect here — a pane you look at the vault through — not a
finish sprayed on every box.

| Grade | Class | Fill | Filter | Edge / shadow |
|---|---|---|---|---|
| **CHROME** | `.g-chrome` | `rgba(255,255,255,.055)` | `blur(24px) saturate(180%)` | 1px `--glass-edge` bottom, `--glass-specular` |
| **PANE** | `.g-pane` | `rgba(255,255,255,.075)` | `blur(40px) saturate(160%)` | 1px `--glass-edge`, `--r-lg`, specular + underside + `--lift-2` |
| **WELL** | `.g-well` | `rgba(8,11,20,.90)` opaque | **none** | 1px `--glass-edge`, `--r-md`, `inset 0 1px 3px rgba(0,0,0,.5)` |

- `--glass-edge` `rgba(255,255,255,.10)` · `--glass-edge-strong` `rgba(255,255,255,.16)`
- `--glass-specular` `inset 0 1px 0 rgba(255,255,255,.18)` — the single inset
  highlight along a pane's top edge is most of what separates glass from a
  translucent rectangle. **A pane without it is not in this system.**
- `--glass-underside` `inset 0 -1px 0 rgba(0,0,0,.35)`

CHROME floats over everything and must stay light enough to see past. PANE holds
the argument; the heavier blur is what softens the graph behind it. WELL is a
recessed opaque floor and is **not glass** — the contrast of a blur is whatever
happens to be behind it that second, which is not a ratio anyone can hold.

**Two mandatory degradations, both shipped:**

- `@supports not (backdrop-filter)` → CHROME `rgba(10,14,24,.94)`, PANE
  `rgba(12,16,28,.92)`. Without this a "pane" is a 7% white rectangle with the
  graph legible straight through the type.
- `@media (prefers-reduced-transparency: reduce)` → CHROME `rgba(10,14,24,.96)`,
  PANE `rgba(12,16,28,.96)`, filters `none`. The panes stay, because they are
  the composition; they stop being transparent.

Any new glass surface inherits both fallbacks or it is not glass.

## 1.4 The luminance substrate

Glass in this world is never over flat colour. Both entry surfaces lay down the
same three-lobe wash before any pane:

```
radial-gradient(… rgba(111,99,224,.34) …)   the accent lobe
radial-gradient(… rgba(58,116,214,.20) …)   a cooler blue lobe
radial-gradient(… rgba(157,147,255,.14–.16) …) a luminous lobe
```

`.wash` on `/landing` (fixed, positions 72%/24%, 14%/78%, 92%/88%) and
`.auth-wash` on `/auth` (absolute, mirrored to 22%/26%, 84%/74%, 62%/8%). Never
seen as shapes; only ever as the thing the panes lift. `/landing` adds a
34s `drift` translate/scale animation, gated on `prefers-reduced-motion`.

Over that, `/landing` runs `#field`: a 44-node force-directed canvas graph of an
example vault, fixed, `pointer-events:none`, `aria-hidden`, masked by a
`radial-gradient(120% 95% at 62% 40%)` vignette. Four cluster hues
`#9d93ff #6f8fe0 #7fd6c0 #b89bf0`; edges as 1px hairlines at
`rgba(157,147,255,.30)` within a cluster and `.16` across; nodes sized by degree
with a `r*3.4` glow on hubs. It settles and stops, and stops when the page is
hidden. `/auth` carries the still SVG equivalent (`.auth-field-svg`, opacity
0.6, radially masked).

**Rule: a PANE is only ever placed over the wash or the field.** A pane over
flat `--ink-0` is grey plastic and the material fails.

## 1.5 Elevation

Three layers, because one blurred drop shadow reads as a sticker: a tight
contact shadow, a mid shadow for the gap, a wide ambient one for the room.

| Token | Value |
|---|---|
| `--lift-1` | `0 1px 2px rgba(0,0,0,.30), 0 4px 12px -4px rgba(0,0,0,.40)` |
| `--lift-2` | `0 1px 2px rgba(0,0,0,.32), 0 10px 28px -10px rgba(0,0,0,.50), 0 36px 72px -32px rgba(0,0,0,.60)` |
| `--lift-glow` | `0 8px 32px -8px rgba(111,99,224,.45)` — accent-filled controls only |

All shadows are centred (no x offset) and soft. A hard offset shadow does not
exist in this world.

## 1.6 Radii

`--r-xs 8px` · `--r-sm 12px` · `--r-md 18px` · `--r-lg 26px` · `--r-xl 34px` ·
`--r-pill 999px`

Nested radii stay concentric: a child's radius is the parent's minus its inset,
so corners run parallel instead of crossing. Assignments as shipped: PANE
`--r-lg`, WELL and cards `--r-md`, inputs and nav items `--r-sm`, focus ring and
icon buttons `--r-xs`, every button, chip, tag and toggle `--r-pill`.

## 1.7 Type

| Token | Stack |
|---|---|
| `--face-ui` | `var(--font-manrope,'Manrope')`, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif |
| `--face-mono` | `var(--font-jetbrains,'JetBrains Mono')`, ui-monospace, 'Fira Mono', monospace |

Manrope carries everything read. The mono keeps exactly two jobs: **measured
values and key caps** — plus, as shipped, the `.meta` caption line, the
`.src-kind` format badges, the `.urlbar`, the `.tree`, and the `[[` brackets in
the wiki-link demo, all of which are machine-shaped text. It is not the display
voice and it is not decoration.

Fluid ramp, all `clamp()`:

| Step | min → max | Used by |
|---|---|---|
| `--step--1` | 0.80 → 0.86rem | captions, small buttons, quotes, nav |
| `--step-0` | 0.95 → 1.06rem | body |
| `--step-1` | 1.13 → 1.35rem | `.lede`, `h3`, auth sub |
| `--step-2` | 1.45 → 2.00rem | card titles, auth `h2` |
| `--step-3` | 1.95 → 3.10rem | section `h2` |
| `--step-4` | 2.60 → 4.75rem | hero `h1`, closing `h2` |

Headings: weight 800, `letter-spacing:-0.035em`, `line-height:1.04`,
`text-wrap:balance`. `h3` softens to `-0.02em / 1.2`. Body `line-height:1.65`;
`.lede` 1.6. Measure is capped: `.lede` 62ch, `.body` 70ch, auth sub 46ch, auth
`h1` 15ch.

Weights loaded: 300/400/500/600/800.

## 1.8 Motion

One ease everywhere, so the surface moves like one object.
`--ease cubic-bezier(.16,1,.3,1)` (exponential-out: leaves fast, lands slow,
never overshoots), `--ease-in-out cubic-bezier(.65,0,.35,1)` for loops.
Durations `--t-fast 160ms` (hover, focus, state), `--t-mid 320ms` (a component
reacting to another component), `--t-slow 620ms` (arrival).

**One authored motion on the page**: `.rise` — `translateY(26px)`, `opacity 0`,
`filter: blur(6px)` → settled, at `--t-slow`. The blur is load-bearing: it is
the page's own material coming into focus. Everything else is hover feedback.
Hover lift is exactly `translateY(-1px)`; nothing scales.

All decorative motion is inside `@media (prefers-reduced-motion: no-preference)`
and the default state is the **visible** one, so a failed observer or a reduced
-motion preference can never leave content hidden.

## 1.9 Text on glass — the rule as shipped

Declared rule: body copy never sits on a `backdrop-filter`; reading surfaces are
WELLs. As built, that holds for the sustained reading passages (`.note-well`,
the two `.capture` cells, the `.tree`, every `.auth-input`, which is a
`rgba(6,9,16,.72→.88)` well rather than glass).

It does **not** hold for short display copy: the hero `h1`/`.lede`, the tutor
transcript, the `.auth-card`, the `.bl` backlink cards and the `.src` shelf
cards all read on PANE-family glass. That is what the two opaque fallbacks in
§1.3 exist to cover, and it is the working rule going forward:

> **Sustained prose sits on a WELL. Display copy and card-level copy may sit on
> a PANE, provided the pane carries both the `@supports` and the
> `prefers-reduced-transparency` opaque fallbacks.**

## 1.10 Browser surfaces

Scoped to `.world-ink`, because defaults here belong to no design system and are
the cheapest tell that a page was assembled rather than built:

- `::selection` `rgba(157,147,255,.28)` on `--ink-t1`
- `caret-color: --accent-lum`, `accent-color: --accent`
- scrollbar: thin, `--ink-3` thumb on transparent, `--r-pill`, 3px transparent
  border via `background-clip:content-box`, hover `#27304a`
- `:focus-visible` → `2px solid --accent-lum`, `outline-offset:2px`,
  `border-radius: --r-xs`. Never removed, never replaced with a shadow alone.
- `.fig` → `tabular-nums` on any figure meant to be compared
- links → `text-underline-offset:.22em`, `text-decoration-thickness:1px`

## 1.11 Controls

| Control | Shape |
|---|---|
| `.btn` base | pill, `min-height:48px`, `padding:0 22px`, `--step-0`/600, `gap:9px`, `touch-action:manipulation` |
| `.btn-primary` | `--accent` fill, `--on-accent`, `--lift-2` + `inset 0 1px 0 rgba(255,255,255,.24)`, hover `#7d71ee` + `-1px` |
| `.btn-glass` | `rgba(255,255,255,.07)`, `--glass-edge-strong`, `blur(18px) saturate(160%)`, specular; hover `.12` / edge `.26` |
| `.btn-sm` | `min-height:40px`, `padding:0 16px`, `--step--1` |
| `.auth-submit` | full-width pill, `min-height:50px`, `--lift-1` + `--lift-glow` + specular |
| `.auth-demo` | the `.btn-glass` recipe, full width, `min-height:48px` |

Every interactive target clears 40px of height, including inline ones: the
sign-in/sign-up switch in `.auth-foot` is a real 28px-min button with negative
margins so the sentence's spacing reads unchanged.

Icons are **inline Lucide SVG** — the same set the app renders — either inlined
as `<symbol>`s in the landing document or imported as React components on
`/auth`. `svg.ic` is `1em` square, `fill:none`, `stroke:currentColor`,
`stroke-width:1.75`, round caps and joins. No icon font, no emoji, no glyph
characters standing in for icons.

## 1.12 Layout and rhythm

- Page gutter: `clamp(16px, 4vw, 40px)`, used identically by the bar, sections
  and footer.
- Section padding: `clamp(96px, 13vh, 172px)` vertical. More room above a
  heading than below it, so a section reads as belonging to what follows.
- Measure: `.wrap` `max-width:1180px`, centred. Narrow passage `720px`.
- Two-column splits are `1.05fr / .95fr` with `clamp(28px,5vw,72px)` gutter,
  collapsing to one column at 900px.
- `/auth` is `1.02fr / .98fr`; below 940px the left-hand pitch is dropped
  entirely (it was made on the page before) and the form takes the width.
- Landing collapses nav anchors at 700px but never the demo link.
- Hero pane `max-width:616px`, `padding: clamp(28px,4vw,46px)`.

## 1.13 Named rules

1. **Glass needs something to look through.** No pane over flat colour; the wash
   and the field are structural, not decoration.
2. **The specular edge makes the glass.** Every pane carries
   `--glass-specular`.
3. **Three grades, chosen by job.** CHROME to float, PANE to argue, WELL to
   read. A WELL is never blurred.
4. **Every glass surface degrades twice** — `@supports` and
   `prefers-reduced-transparency`.
5. **The quiet tier is measured, not eyeballed.** A text colour enters the
   system with its ratio against the ground it actually sits on.
6. **The accent is for light, not for warning.** Amber, green and red keep
   their own reserved hues.
7. **One ease, three durations, one authored motion.** Hover lift is 1px;
   nothing scales; reduced-motion defaults to the visible state.
8. **Mono earns its place twice only** — measured values and key caps (and the
   machine-shaped strings that are literally those: URLs, file trees, `[[`).
9. **One token file, two consumers.** Never a second copy of the palette.
10. **The demo link survives every breakpoint.** It is the cheapest way in and
    the only one needing no email.

## 1.14 Prohibitions

Checked against the world's own materials; none of these bans a device the build
itself uses.

- **No eyebrow or kicker text above a heading.** Format badges that name real
  data (`.src-kind`: EPUB / ARXIV / ARTICLE / PDF / EDITION) and caption labels
  that name a real place (`.meta`: "In the reader") are *not* kickers — they
  carry information. A decorative line of small caps above a headline is.
- **No icon-heading-text card grid.** The page's evidence is arranged as
  demonstrations: a live wiki-link driving a backlink stack, a horizontally
  scrolling shelf, a transcript. A three-by-three feature grid describes a
  product that connects your thinking without connecting anything in front of
  you.
- **No section numbers.**
- **No hard-offset shadows.** All elevation is soft and centred; this is not a
  neobrutalist world.
- **No glyph or emoji icons.** Lucide SVG only.
- **No system display face.** Manrope carries display; the system stack is a
  fallback, never a choice.
- **No blur as a finish.** If a surface is not CHROME, PANE or WELL, it does not
  get a `backdrop-filter`.
- **No focus state without a visible ring.**
- **No claim that outruns the tree.** Copy names only shipped behaviour;
  `/landing` carried "Voice-to-note capture" for months with no speech code
  anywhere.

---

# World 2 — Slip-box

Governs the workspace app, `/demo`, published pages, and the editor. Declared in
the header comment of `src/app/globals.css`. **Current, not deprecated.**

## 2.1 Direction

A note is a card under a desk lamp, not a console. The ground is warm graphite
(dark) or warm paper (light), never the blue-black of a terminal. The accent
stays in the iron-gall ink family — cool indigo against a warm ground, which is
what ink on paper actually is. Apparatus lives in the margin; one row of chrome;
vertical space in the editor is protected.

## 2.2 Palette

Three theme blocks ship identically-keyed tokens: `[data-theme="dark"]`,
`[data-theme="light"]`, and `:root:not([data-theme])` (the pre-JS default,
duplicating dark). The `:not()` is load-bearing — a plain `:root` would outrank
`[data-theme="light"]` and permanently defeat light mode.

| Token | Dark | Light |
|---|---|---|
| `--bg` … `--bg4` | `#141310 #1b1917 #23201d #2c2925 #363229` | `#efece4 #f8f6f1 #e6e2d8 #dbd6ca #cdc7b9` |
| `--bd` / `--bd2` | `#2a2723` / `#3b3630` | `#dcd7cb` / `#c4bdaf` |
| `--t1` / `--t2` / `--t3` | `#efeae0` / `#a19890` / `#8f867a` | `#1e1b16` / `#5b554b` / `#675f54` |
| `--acc` / `--acc2` | `#6f63e0` / `#a79ef5` | `#5449c9` / `#3b32a8` |
| `--acc-bg` / `--acc-bd` | `#1e1b33` / `#3b3480` | `#e9e7fa` / `#c0baef` |
| `--on-acc` | `#ffffff` | `#ffffff` |
| `--grn` / `--amb` / `--blu` / `--red` / `--coral` | `#43c495 #e9b14b #6fa8dc #e8746b #e8926f` | `#0f7a56 #9c5b12 #1d6fa4 #a8261f #b1470f` |
| `--paper` / `--rule` / `--hair` | `#181614 / #4a443c / #2a2723` | `#f8f6f1 / #9d9689 / #dcd7cb` |
| `--canvas-dot` | `#24211d` | `#d3cec1` |

Each state hue ships with its own `-bg` and `-bd` companions, so a state chip is
a fill, an edge and an ink from one family rather than an opacity guess.

`--t3` is the quietest tier — section labels, note metadata, inactive tabs, the
status bar, empty-state hints. It was retuned in both directions (dark
`#6e665c` → `#8f867a`, light `#8b8478` → `#675f54`) until it clears 4.5:1
against `--bg`, `--bg1` and `--bg2`. **This is the same measured-floor rule as
`--ink-t3`; it is the one law both worlds share besides the accent.**

## 2.3 Type

- **JetBrains Mono** is the chrome's identity and is applied by a blanket
  element rule with `!important`.
- **Source Serif 4** is the edition's face.
- The editor's prose face is user-selectable (Settings › reading font):
  `--font-reading-serif` (Iowan Old Style / Palatino / Charter / Georgia)
  **by default — prose is prose** — with mono and sans one click away. Only the
  writing surface changes; all chrome above stays monospace.
- Faces are loaded by `next/font` in `layout.tsx` and served from our own
  origin. They were once `@import`-ed, which cost a serialized round trip to a
  third party on every cold load. `@theme inline` is required in the Tailwind
  block so the hashed family names resolve at runtime rather than build time.

## 2.4 Surfaces

- `--paper` is the edition: a sheet lifted slightly off the app's ground.
- Two weights of rule: `--rule` separates sections, `--hair` divides columns.
- Radii are small and literal (2–8px) — this world has no radius scale token.
- Theme transition: `background-color 180ms`, `border-color 180ms`,
  `color 100ms`, all `ease`, declared on `*`.
- `color-scheme` is declared next to each palette, so a new theme cannot be
  added without one; otherwise the app runs dark with a white scrollbar.

## 2.5 The boundary rules

- The blanket mono rule is the workspace's identity and it shouts, so the
  storefront shouts back: `.auth, .auth *` sets `--face-ui` with `!important`
  (a class beats an element selector), and `.auth .mono` restores
  `--face-mono` for the two jobs mono keeps.
- `/auth` is the only part of the Next app inside midnight ink, and it is
  explicitly annotated as such in `globals.css`.
- The workspace adopting midnight ink is an open question, not a plan. The token
  layer is written so it *could*, deliberately — never by drift.

---

## 3. Not canonized, not repaired

The following are recorded as defects or divergences the build carries. None is
a design-system rule, and no future surface should inherit any of them.

1. **`/auth`'s wordmark caret uses the workspace token.** `page.tsx` renders
   `.sb-caret`, whose fill is `var(--acc)` — a slip-box token — inside a
   `world-ink` surface. Under `[data-theme="light"]` that resolves to `#5449c9`
   on a near-black ground. A cross-world token leak, not a permitted shortcut;
   the entry world's caret colour is `--accent-lum` (`.caret` on `/landing`).
2. **`--ink-t3` is below 4.5:1 on `--ink-2`** (4.12:1) and marginal on `--ink-1`
   (4.44:1). The token's own comment claims 4.6:1 and that is true only against
   `--ink-0` (4.64) and `--well-fill` (4.53). The higher number is **not**
   recorded as blanket clearance; §1.1 records the grounds it was actually
   validated against. Not retuned here.
3. **Body-adjacent copy reads on glass.** `.bl-quote`, `.src .by`, `.src h3`,
   the hero `.lede` and the tutor transcript sit on `backdrop-filter` surfaces,
   against the token file's own "body copy never sits on a backdrop-filter".
   §1.9 records what shipped and the fallback that makes it survivable; the
   stricter brief text ("every reading surface is a WELL at ≥88%") is **not**
   recorded as the rule, because the build does not obey it.
4. **`/landing` fetches Manrope and JetBrains Mono from Google Fonts** via a
   render-blocking third-party `<link>`, which is exactly the serialized
   third-party round trip `globals.css` documents `next/font` as having fixed.
   It is forced by the route having no bundler, and `layout.tsx` annotates it,
   but it is a divergence from the house rule, not an exception the system
   grants.
5. **The direction contract's numbers were not what shipped**, and the build
   wins throughout: CHROME/PANE fills are 5.5%/7.5% not 6%/8%; radii run
   8–34px not "continuous 20–28px"; the hero pane is 616px not 560px. Recorded
   as built.
6. **Pre-existing slip-box drift, reported not repaired:** the workspace world
   has no type-scale, spacing-scale or radius tokens. Font sizes are literal px
   across ~26 declarations (6.5px–16.5px) and radii are ad-hoc 2–8px values.
   That is a real inconsistency, but it predates this build and repairing it was
   not asked for.
