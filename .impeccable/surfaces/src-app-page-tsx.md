---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/app/globals.css"]
---

Scope: the workspace shell — `src/app/page.tsx` and everything under
`src/components/second-brain/`. Visitor mode: Operate.

The task: writing, and moving between the things writing connects to. Long
sessions, day and night, desk-first with a real phone shell. The information
is dense by design — a rail, a notebook list, the page, and an apparatus
margin. Constraints that are product truth and do not move: the four-zone
composition, the 34px editor bar and 24px status bar (vertical space is the
scarce resource on a writing surface), the spine in the margin, mono as the
chrome's voice and serif as the reading face, and both themes.

## Direction contract

THESIS: The workspace joins the entry world's material without becoming a
marketing page. Same ground, same ink, same glass, same corners — but glass
is chrome here and nothing else. It refuses the arrangement this redesign
would default to, which is frosted panels everywhere: the page you write on
is opaque paper, and every pane that blurs is something that floats *over*
the work rather than being the work.

OWN-WORLD: Midnight ink, the same family as `/landing`: a blue-black ground
through `--bg`..`--bg4`, ink at `--t1`/`--t2`/`--t3`, iron-gall indigo accent
lit to periwinkle where something is live. Light theme is the same world in
daylight — a cool near-white, not the old warm paper. Chrome surfaces (rail,
notebook list, editor bar, status bar, apparatus panel, command palette,
dialogs, phone tab bar) are glass: translucent, blurred, with a specular top
edge. The writing measure and the reader are wells — opaque, no blur, because
prose is read for an hour and must not depend on what is behind it. Radii
step with the element: 8px on a control, 12px on a card, 18px on a panel.
Mono stays the chrome's voice; the reading face stays the reader's choice.

STORY: Someone signs up from a page made of glass over a graph, lands in the
workspace, and recognises it immediately as the same product — same dark, same
indigo, same corners, chrome that floats the same way. Then it gets out of the
way and they write.

FIRST VIEWPORT: The four zones as they are today, unmoved. The 50px rail is a
glass strip against the ground with the active icon carrying an accent well;
the 288px notebook list is a second glass plane, a shade lighter than the
rail; the page between them is opaque and the only opaque thing in view; the
apparatus margin is glass again on the right. A single quiet luminance field
sits behind the whole shell so the glass has something to lift — static, with
no drift, because this is a surface someone stares at all day.

FORM: Inherited. The composition is not up for redesign; it is the product's
own answer and the user has pushed back on chrome that costs height before.
This is a material and palette replacement inside a fixed structure, which is
new-work's "extend an existing surface" case rather than a concept round.

FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its
provenance.

## Unresolved

- Typography is the one axis deliberately held. Manrope carries the entry
  world; the workspace keeps JetBrains Mono for chrome and the reader's own
  choice for prose, because that is documented identity and Operate mode wants
  one consistent UI family rather than a display face in labels. It is a
  one-line change in `--font-mono` if the user wants the faces unified too.
- The old "slip-box" warm-graphite world is retired by this pass. DESIGN.md
  has to stop describing it as current.
