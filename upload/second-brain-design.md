# Second Brain — Design Spec
> Command-palette-first PKM app · VSCode-inspired dark theme · Editor-as-homepage

---

## Concept

No traditional dashboard. No sidebar-first navigation.
The **editor is the homepage** — you land directly in a note, not a metrics page.
Navigation collapses into a thin 46px icon rail. The writing canvas owns 90% of the screen.

---

## Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  [⌘K] search notes, jump to, run command          + new note   │  ← Command bar
├────┬───────────────────────────────────────────┬────────────────┤
│    │  • zettelkasten-method.md  para-method.md │                │  ← Editor tabs
│    ├───────────────────────────────────────────┤                │
│ I  │                                           │  AI            │
│ C  │  File                                     │  Graph         │
│ O  │  Tree         EDITOR CANVAS               │  History       │
│ N  │                                           │                │
│    │  (hero area — max width)                  │  Context       │
│ R  │                                           │  Panel         │
│ A  │                                           │                │
│ I  ├───────────────────────────────────────────┤                │
│ L  │  autosaved · 12 links · 340 words · ⌘K   │                │  ← Status bar
└────┴───────────────────────────────────────────┴────────────────┘
```

### Columns

| Zone | Width | Purpose |
|---|---|---|
| Icon rail | 46px | Navigation — icons only, no labels |
| File tree | 200px | Note list grouped by collection |
| Editor | flex (fills space) | The hero. Writing canvas with tabs. |
| Context panel | 240px | Live AI suggestions + mini graph |

---

## Color Palette (Dark)

```
Background layers
  --bg:       #0c0c0e   ← base canvas
  --bg1:      #111113   ← panels, rails
  --bg2:      #171719   ← cards, callouts
  --bg3:      #1e1e21   ← inputs, hover
  --bg4:      #26262a   ← active chips

Borders
  --bd:       #252528   ← default hairline
  --bd2:      #333338   ← hover / emphasis

Text
  --t1:       #f0f0f2   ← primary
  --t2:       #888894   ← secondary / body
  --t3:       #444450   ← muted / labels

Accent — Purple
  --acc:      #7c6ef7
  --acc2:     #b0a8fb   ← lighter, for text on dark
  --acc-bg:   #1a1830   ← tinted background

Status
  --grn:      #34d399   ← evergreen / success
  --grn-bg:   #0a1f16
  --amb:      #fbbf24   ← unsaved / streak / warning
  --amb-bg:   #1c1608
  --red:      #f87171   ← danger
```

---

## Typography

```
Font stack: 'JetBrains Mono', 'Fira Mono', 'Cascadia Code', monospace

Sizes
  9px   → section labels (uppercase, letter-spacing: .09em)
  10px  → status bar, metadata, tags
  11px  → body text in panels, file tree items
  12px  → editor body prose
  14px  → editor h2 headings
  24px  → note title (h1)

Weights
  400   → body
  700   → titles, headings

Note: ALL text monospaced — this is intentional.
      It gives the app a "living document" / code-notebook feel.
```

---

## Components

### Icon Rail
- 46px wide, `#111113` background
- Icon-only navigation (no labels)
- Active state: `#1a1830` bg + `#b0a8fb` icon color + `#3d378a` border
- Logo mark: 28×28px, `#7c6ef7` fill, 6px border-radius
- User avatar at bottom (initials circle)

### Command Bar
- Full-width top bar, 44px height
- `⌘K` shortcut chip on the right of the search input
- Search input: `#1e1e21` bg, `#333338` border, blinking cursor animation
- Right: streak chip (amber), version badge, `+ new note` CTA

### Editor Tabs (VSCode style)
- Active tab: slightly lighter bg, top+side borders visible, 2px accent bottom border
- Inactive tabs: flat, muted text
- Unsaved indicator: amber dot `●` before filename
- `+` tab for new note

### File Tree
- 200px, grouped by collection
- 9px uppercase section labels
- Backlink count badge (right-aligned, `#1e1e21` bg)
- Active note: `#1a1830` bg + `#b0a8fb` text

### Editor Canvas
- `48px` horizontal padding (breathing room)
- `32px` top padding
- Note header: inline tags + date + word count + backlinks + status
- H1 title: 24px, weight 700, letter-spacing `-0.02em`
- Subtitle/tagline: 13px italic, muted
- H2 sections: 14px uppercase + full-width rule line after text
- Callout blocks: 2px left border (`#7c6ef7`) + `#1a1830` bg
- Backlinks section at bottom of every note

### Context Panel
- 3 tabs: AI / Graph / History
- Live AI suggestions: pulsing dot indicator, card per suggestion
- Suggestion cards: type label + description + action link
- Mini SVG knowledge graph showing current note's connections

### Status Bar
- 24px height, full width
- Left: autosave · link count · word count
- Right: AI status · keyboard shortcut hint · global stats

---

## Navigation Model

```
⌘K  →  Command palette (search, jump, run AI command)
Click icon rail  →  Switch between: Notes / Graph / Daily / AI Synthesis / Tags
Click file tree  →  Open note in new tab
⌘T  →  New tab
⌘W  →  Close tab
```

No "dashboard" view. Stats live in the status bar (one quiet line).
The note IS the entry point.

---

## AI Features (Context Panel)

| Suggestion type | Trigger |
|---|---|
| Missing link | Note references a concept that exists as another note but isn't linked |
| Synthesis ready | 5+ notes on same topic detected |
| Review due | Spaced repetition interval expired |
| Open question | Gap detected in current note's reasoning |

All suggestions are contextual to the **currently open note**.
No global AI dashboard — intelligence surfaces where you are.

---

## Note Anatomy

```markdown
---
tags: #strategy #learning
date: 2026-06-29
words: 340
backlinks: 12
status: evergreen
---

# Atomic notes and the Zettelkasten method
> one idea per note · link everything · write for your future self

## The core idea

Each note should express **one single idea** completely...

> [!callout]
> A note that links to 10 others is worth more than 10 isolated notes.

## Writing principles

- Write in your own words, never copy-paste
- Add the source reference, but restate the idea
- Ask: what does this connect to?
- Write for your future self — assume zero context

## Backlinks

← Progressive summarisation
← PARA method — organising by actionability
← Why expertise feels invisible from the inside
← (9 more)
```

---

## Motivation Design (How it keeps users writing)

| Mechanic | Where | Why it works |
|---|---|---|
| Streak counter | Command bar chip | Habit loop — daily pull |
| Backlink count | File tree badge | Social proof for your own notes |
| "Evergreen" status | Status bar | Aspiration — notes level up |
| AI: missing link | Context panel | FOMO — feels incomplete without linking |
| AI: synthesis ready | Context panel | Reward — your work becomes something bigger |
| Review due | Context panel | Urgency without shame |
| Word count | Status bar | Progress is visible, always |
| Version counter | Command bar | Feels like a living document, not a static file |

---

## What's intentionally absent

- No dashboard / home screen
- No notification feed
- No gamification badges
- No color-coded folder hierarchy
- No drag-and-drop reordering
- No "welcome" empty state

The blank note editor IS the welcome state.

---

*Design direction: command-palette-first · editor-as-homepage · VSCode dark · monospace throughout*
