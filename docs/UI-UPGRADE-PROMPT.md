# Braindot UI Upgrade — Implementation Prompt

Copy everything below this line into your coding AI.

---

You are upgrading the existing Braindot application UI. Work directly in the current repository and implement the design shown in:

`docs/ui-mockup-upgraded.html`

Treat that file as the visual source of truth. Open and inspect it before changing code. Reproduce its layout, hierarchy, color system, spacing, proportions, typography, borders, shadows, and component states as closely as possible in the real Next.js application.

## Product context

Braindot is a local-first personal knowledge-management app for markdown notes, wiki-links, a knowledge graph, tasks, reading, and AI-assisted thinking. It should feel like a serious writing tool: quiet, compact, fast, and deliberate. It must not feel like a generic SaaS admin dashboard.

The codebase uses Next.js 16, React 19, TypeScript, Tailwind CSS, Radix UI, Lucide icons, Recharts, and existing components in `src/components/second-brain`.

## Core instruction

Implement the upgraded visual design without breaking or replacing existing product behavior. Preserve the current data flow, Convex integration, hooks, state, keyboard shortcuts, editor behavior, commands, drag-and-drop, AI behavior, and navigation. This is a UI and information-hierarchy upgrade, not a product rewrite.

Reuse existing components and dependencies. Do not install a new design system. Do not replace working components with static mock data. Do not copy the static mockup's inline SVG icon sprite into React; use the existing Lucide icon system.

## Visual direction

- Dark, local-first, desktop knowledge tool.
- JetBrains Mono for all application chrome.
- A serif stack only inside the note title and writing canvas:
  `Iowan Old Style`, `Palatino Linotype`, `Palatino`, `Charter`, `Georgia`, serif.
- Compact controls, 1 px hairline borders, 6–10 px corner radii.
- Violet is the single brand/action color.
- Surfaces should separate through subtle tonal shifts, not heavy shadows or bright borders.
- The writing canvas and AI conversation need more breathing room than navigation chrome.
- Avoid glassmorphism, giant rounded cards, gradients on every element, oversized headings, excessive animation, and decorative illustration.

## Required design tokens

Use these values as the dark-theme targets, preferably through shared CSS variables in `src/app/globals.css`:

```css
--bg: #0d0d10;
--surface-1: #121216;
--surface-2: #19191f;
--surface-3: #212128;
--surface-4: #2a2a33;
--border: #292931;
--border-strong: #3a3945;
--text-primary: #f7f6f9;
--text-secondary: #a5a2ad;
--text-muted: #696673;
--accent: #8474ff;
--accent-hover: #8f81ff;
--accent-text: #c2bbff;
--accent-surface: #1c1935;
--accent-border: #49419a;
--success: #34d399;
--warning: #fbbf24;
--danger: #f87171;
--info: #60a5fa;
```

Semantic color rules:

- Violet: active navigation, selected tabs, primary actions, links, and AI presence.
- Green: saved/success/healthy only.
- Amber: attention or aging content only.
- Red: errors, orphaned items, or destructive states only.
- Blue: neutral informational data only.
- Do not use color as the only state indicator; pair it with text, an icon, border, or position.

## Application shell

Match the proportions in the reference:

- Command bar: approximately 52 px high.
- Icon rail: approximately 54 px wide.
- File tree: approximately 238 px wide on a 1440 px viewport.
- Right context/AI panel: approximately 336 px wide.
- Status bar: approximately 30 px high.
- Main shell border radius: 12 px in the design-review mockup; inside the real full-window app, keep outer radii consistent with the existing window treatment.
- Use `min-width: 0` correctly so the editor can shrink without causing accidental overflow.
- If the app already supports resizable panels, preserve resizing and use these measurements as defaults.

The command/search field should be the dominant control in the top bar. The “new note” button is the single primary action. Local status, streak, theme, and other utilities remain visually secondary.

The active item in the icon rail and file tree needs both a tinted surface and a small violet edge marker. Icons should use consistent 16–18 px sizing with restrained stroke weight.

## Editor surface

- Keep application chrome compact.
- Give the document a maximum readable width around 720–760 px.
- Increase the note title to roughly 34 px with a tight line-height.
- Use approximately 14.5 px serif body text with about 1.9 line-height.
- Preserve the metadata, tags, note state, tabs, toolbar, backlinks, wiki-links, and editing behavior.
- Do not wrap the writing area in a card. It should remain an open canvas.
- Use a very subtle center-lightening background treatment at most; text must remain the focus.
- Selected editor tabs use a violet bottom indicator.

## Context and AI panel

The current narrow-inspector feeling must be removed.

- Default width is approximately 336 px.
- Top tabs remain: info, AI, graph, history.
- AI subtabs remain: this note, vault, study.
- Use 15 px internal padding and 12–13 px answer text with comfortable line-height.
- User messages use a restrained violet-tinted bubble.
- AI answers remain mostly unboxed text.
- Suggestion cards receive a thin violet edge marker instead of a heavy colored container.
- Sources must look like compact citations and remain clearly associated with the answer.
- The composer stays pinned to the bottom and uses a 36 px minimum control height.
- Empty states should explain scope and provide 2–3 useful starter prompts; never show a large empty illustration.

## Dashboard hierarchy

The dashboard must stop reading as a wall of equally important cards. Order it by user intent:

1. Orientation hero: date, greeting, vault summary, streak.
2. “Pick up where you left off” and “Today.”
3. Quick actions.
4. Four summary metrics presented as one connected information band.
5. Activity heatmap.
6. Recently edited and knowledge graph.
7. Deeper analytics: tags, PARA folders, vault health/attention, hubs, recently created.

Specific requirements:

- The resume card is the strongest content block after the hero.
- The four statistics must share one outer container and use internal dividers. Do not render four floating cards.
- Use the existing real metrics and charts.
- Keep dense analytics below primary work.
- Panel headers should be small and quiet. Values and actions carry the hierarchy.
- Use approximately 20 px gaps between major dashboard groups.
- Use asymmetrical layouts where helpful: the resume area should be wider than “Today.”
- Do not remove existing dashboard information unless it is provably duplicated. Reorder and visually demote it instead.

## Interaction quality

The static HTML is a visual reference, but the real app must remain fully interactive.

- Use semantic buttons, inputs, tabs, lists, and headings.
- All icon-only buttons require accessible names and tooltips where the purpose is not obvious.
- Maintain visible `:focus-visible` states using the violet focus ring.
- Preserve keyboard navigation and existing shortcuts.
- Hover states should be subtle: a small surface or border shift, not movement.
- Respect `prefers-reduced-motion`.
- Do not add animation unless it communicates a state change; keep transitions around 120–180 ms.
- Maintain at least 4.5:1 contrast for normal text where practical.

## Responsive behavior

Desktop is primary, but the shell must degrade intentionally:

- At large desktop widths, show rail, tree, editor, and context panel together.
- At narrower laptop widths, reduce tree/context widths before collapsing them.
- On tablet/mobile, move the file tree and context panel into existing drawers/sheets if the app already has that behavior.
- Never solve responsiveness by applying a large fixed `min-width` to the production app.
- Avoid horizontal page scrolling.

## Codebase mapping

Inspect and update the relevant existing files rather than creating duplicate replacements:

- `src/app/globals.css`
- `src/app/page.tsx`
- `src/components/second-brain/CommandBar.tsx`
- `src/components/second-brain/IconRail.tsx`
- `src/components/second-brain/FileTree.tsx`
- `src/components/second-brain/EditorTabs.tsx`
- `src/components/second-brain/FormattingToolbar.tsx`
- `src/components/second-brain/EditorCanvas.tsx`
- `src/components/second-brain/ContextPanel.tsx`
- `src/components/second-brain/AIChat.tsx`
- `src/components/second-brain/Dashboard.tsx`
- `src/components/second-brain/StatusBar.tsx`

These filenames are guidance, not permission to rewrite every file. Change only what is necessary. Preserve unrelated user modifications already present in the worktree.

## Implementation sequence

1. Inspect the reference mockup and the existing components.
2. Identify the shared shell and theme tokens first.
3. Implement the shell proportions and color/typography system.
4. Implement editor and context-panel hierarchy.
5. Reorder and restyle the dashboard using existing live data.
6. Verify keyboard, hover, focus, empty, loading, and error states.
7. Run the existing lint and production build. Fix only issues caused by this work.
8. Compare the finished app against `docs/ui-mockup-upgraded.html` at a 1440 × 900 viewport and correct visible differences.

## Acceptance checklist

The task is complete only when:

- The real app clearly matches the reference's palette and proportions.
- The dashboard visual order matches the required hierarchy.
- The statistic area is one connected band.
- The context panel defaults to about 336 px and AI responses are comfortably readable.
- The writing canvas retains a 720–760 px readable measure and serif body.
- Violet is the only brand/action accent; semantic colors follow their rules.
- No working behavior or real data was replaced with static content.
- Icon-only controls have accessible names.
- Focus states are visible.
- No accidental horizontal overflow exists at supported widths.
- The existing production build succeeds.

When finished, summarize the files changed, the hierarchy improvements, and any behavior intentionally left unchanged. Do not claim visual parity unless you actually compared the implementation against the reference.
