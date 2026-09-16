---
version: 1
slug: "src-app-landing-landing-html"
primary_target: "src/app/landing/landing.html"
related_targets: ["src/app/auth/page.tsx"]
---

Scope: `/landing` (raw HTML route) and `/auth`. Visitor mode: Persuade.

Audience: a writer or student who has outgrown a folder of text files and is
sceptical of another note app. Job: decide, in under a minute, whether this is
where their thinking will live. Action: open the demo — no account, the
strongest proof the product has. Proof on hand: the seed vault (six real,
genuinely cross-linked notes), the live graph, publishing, export. Constraints:
`/landing` cannot import `globals.css` and must carry its own tokens; no claim
may outrun the tree (the page shipped "Voice-to-note capture" for months with
no speech code anywhere).

## Direction contract

THESIS: The page *is* the vault. A live force-directed graph of a real vault
fills the field and the argument arrives on glass suspended over it. It refuses
the category arrangement — centred headline over a product screenshot, then a
three-by-three grid of icon-heading-text cards — because that composition
describes a product that connects your thinking without ever connecting
anything in front of you.

OWN-WORLD: Midnight-ink ground, a deep blue-black that is never neutral grey,
carrying a live graph: nodes as luminous indigo discs scaled by degree, edges as
hairlines that brighten when their pair wakes. Three real glass grades — CHROME
(blur 24px / saturate 180% / 6% white), PANE (blur 40px / saturate 160% / 8%,
1px specular top edge, contact shadow beneath), and WELL (recessed, inset
shadow, no blur). Text never sits on blur alone: every reading surface is a WELL
at ≥88% opacity. Accent is Braindot's iron-gall indigo pushed to a luminous
periwinkle where something emits light; amber stays reserved for state. Manrope
carries everything read; JetBrains Mono survives only for measured values and
keyboard keys. Continuous 20–28px radii. No eyebrow labels, no icon-card grid,
no section numbers.

STORY: They arrive expecting another text box. The first viewport shows a
mind's worth of notes already connected and slowly moving, and they understand
within seconds that the subject is the links, not the notes. Scrolling, the
graph holds and the panes do the work: linking, reading-in, the tutor,
publishing, the exit. They leave able to say "it connects my notes to each
other and I can try it without signing up", and they click into the demo.

FIRST VIEWPORT: Full-bleed graph, ~44 nodes, drifting, massed right of centre
and bleeding off all four edges. Over it at the left, a PANE 560px wide: the
wordmark with its blinking caret at 20px, a 76px/1.02 headline on two lines, a
17px sub set to 62ch, then two controls abreast — "Open the demo" filled
periwinkle as the primary, "Create a vault" as glass outline. At the pane's
foot, one mono line naming the vault on screen as an example. A CHROME strip
pins the top edge full width, wordmark left, three links and the demo CTA right.

FORM: "The link graph as the page" — index 3 of my ordered structural list,
dealt as lead by seed key 97dc1aca (deal 3, 1, 6). The graph is not a
decoration behind the pitch; it is the substrate the glass exists to look
through, which is what stops the material reading as flat grey.

FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its
provenance.

## Unresolved

- Whether the workspace shell adopts this world or stays "slip-box". Not
  decided here; this brief governs `/landing` and `/auth` only, and the token
  layer is written so the app can adopt it deliberately rather than by drift.
- PRODUCT.md was written without an interview; its `[inferred]` lines are the
  first things to correct when the user is available.
