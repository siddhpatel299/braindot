# Braindot — Product Truth

> **Provenance.** Written 2026-09-16 without an interview: the user asked for the
> redesign to proceed unattended and explicitly declined questions. Every fact
> below is read off the repository — README.md, the Convex schema, the route
> tree, and the shipped components — rather than confirmed by a person. Lines
> marked **[inferred]** are reasoned from that evidence rather than stated
> anywhere; they are the first things to correct.

## Platform

web

## Stack

Next.js 16 (App Router, Turbopack), React 19, TypeScript. Convex for database,
auth and live sync. OpenAI for the AI surfaces, streamed. Tailwind v4 over a
hand-rolled CSS custom-property design system in `src/app/globals.css`.
Mermaid for diagrams. Deployed on Vercel from `main` only.

Notable constraint: `/landing` is served as raw HTML from a route handler
(`src/app/landing/route.ts`), deliberately outside the Next layout, because the
app's `body` is `height:100dvh; overflow:hidden` and a marketing page needs to
scroll. It therefore cannot import `globals.css` and must carry its own copy of
the design tokens.

## Users

People who write to think, and who have outgrown a folder of text files:
students working through a syllabus, researchers and writers accumulating
sources, practitioners keeping a working notebook. **[inferred]** — the
repository has no analytics, personas or research; this is read from the seed
vault's subject matter (Zettelkasten, spaced repetition, PARA, decision
fatigue), the reading layer's sources (arXiv, Hacker News, EPUB, PDF), and the
study-mode tutor.

Single-user throughout. There is no collaboration, sharing-with-edit, or team
concept anywhere in the schema; publishing is one-way and read-only.

## Product Purpose

A note is worth more for what it connects to than for what it contains. The
product exists to make that connection cheap: wiki-links with autocomplete,
backlinks computed across the vault, a force-directed graph of the whole thing,
and an AI that reads across every note rather than one at a time.

## Positioning

Against folder-and-textbox note apps. The README's own line: "Not a filing
cabinet. A thinking environment."

Three things competitors in this category generally do not have together:
an AI tutor that quizzes you back and draws diagrams you can save into the
note; a reading layer where EPUB, PDF, arXiv papers and news arrive in-app and
highlights flow into the vault; and publishing that turns a note or a whole
nested folder into a link needing no account.

## Operating Context

Desk-first, long sessions, both day and night — the app ships light and dark
themes and a time-of-day greeting that includes "still up" before 5am. The
phone is a real but secondary surface: below 768px the shell drops to one zone
at a time with a bottom tab bar, and the graph and canvas are desk-only by
design.

Local-first: every keystroke lands in local state immediately and syncs in the
background, so writing never waits on a network round trip. Demo mode runs the
whole app with no account and no persistence.

## Capabilities and Constraints

Real, shipped, verified in the tree:

- Markdown editor with a live syntax overlay, `[[wiki-links]]`, backlinks,
  slash commands, edit/preview/diff modes, per-user reading font
- PARA folders with nesting, drag-and-drop and pinning; tags; full-text and
  semantic search (Transformers.js, all-MiniLM-L6-v2, in-browser)
- Knowledge graph, freeform canvas, kanban board and todo list
- Reading: EPUB and PDF import, arXiv papers, Hacker News, article clipping,
  highlights that become notes
- AI: ask-this-note, ask-your-vault with citations, Socratic study mode that
  renders diagrams and calendars into the note
- Publishing: a note or a whole folder to an accountless link; snapshot
  semantics, unlisted by default, unpublished wiki-links degrade to plain text
- Whole-vault export as markdown, and JSON backup/restore

Does not exist, and must never be implied: voice capture, collaboration,
real-time multiplayer, mobile apps, a paid tier.

Beta. Free, no card. **[inferred]** from the landing page's "now in private
beta" and "Free while in beta. No card, no spam." on the auth page.

## Brand Commitments

- The name is lower-case **braindot** in product chrome; "Braindot" in prose
  and as the dashboard masthead.
- The wordmark carries a block caret — a text cursor — as its dot. It blinks.
  This is the one fixed mark.
- Iron-gall indigo is the accent, and it is load-bearing product identity:
  ink on paper, cool against a warm ground. Red, amber and green are reserved
  for state (danger, unsaved, saved) so the accent never competes with a
  warning.
- The app's own workspace runs the "slip-box" world documented in
  `globals.css`: warm graphite or warm paper ground, apparatus in the margin,
  one row of chrome. That world governs the workspace. It does not govern the
  marketing and entry surfaces.

## Evidence on Hand

- `docs/screenshots/` — editor, graph, study mode
- A seed vault of six real notes with genuine cross-links, usable as
  demonstration material at full fidelity
- Live demo at `/demo`, no signup, which is the strongest proof the product has
- `public/logo.svg`

## Product Principles

- Writing never waits on the network.
- The exit is not hidden: export is a first-class feature, not a settings-page
  afterthought.
- Unlisted by default; a published URL is treated as a credential.
- Claims are checkable. The landing page shipped "Voice-to-note capture" for
  months with no speech code anywhere in the tree; that is the failure mode to
  design against.

## Accessibility & Inclusion

Committed, and currently held: as of 2026-09-16 the app and landing page carry
zero WCAG AA text-contrast failures in either theme, verified by audit of the
running pages. Focus is visible and keyboard-only, `prefers-reduced-motion` is
honoured throughout with the loading spinner deliberately exempt, touch targets
clear 24px, and the published pages carry proper landmarks.

The bar for new work: do not regress any of that. Glass and translucency are
the specific risk — text belongs on opaque or near-opaque ground, never on a
blur that happens to be light enough today.
