# Task 1: Ebook Reader + Content Writer AI

## Agent
Z.ai Code (main agent)

## Scope
Implemented two features for the Second Brain PKM app:

1. **Proper Ebook Reader** — `src/components/second-brain/ReadingView.tsx`
   - Chapter-based pagination: content is split on `---` separators into chapters
   - Prev / Next chapter buttons in the reader topbar
   - TOC dropdown (table of contents) listing all chapters with active highlight
   - Font size controls (A- / A+) with three sizes: sm (12px), md (14px), lg (17px)
   - Per-chapter progress: progress = (currentChapter + 1) / totalChapters * 100
   - Chapter title is persisted to `LibraryItem.chapterTitle` so reopening a book returns to the same chapter (Kindle-style)
   - Single-chapter items still work — prev/next are disabled, TOC shows 1/1
   - All existing functionality preserved: highlights, selection toolbar, AI sidebar, news/papers feed, import modal

2. **Content Writer AI** — new `src/components/second-brain/WriterAI.tsx`
   - Floating "✨ write" button injected into the formatting toolbar
   - Click opens a fixed-position panel (anchored to the button) with:
     - 4 quick-action buttons: improve / summarize / expand / bullets
     - A custom-prompt textarea
     - Generate button (Enter to submit, Shift+Enter for newline)
   - Calls existing `/api/ai/ask` endpoint with `noteTitle`, `noteBody`, `noteTags`, `question`
   - Captures the editor's current text selection when opening — if selected text exists, the AI's response replaces it; otherwise the response is inserted at the cursor with newline padding
   - Shows the response in a preview pane with three actions: insert/replace, copy, regenerate
   - Loading state via spinner + "generating…" label
   - Error state with red callout
   - Esc to close; outside-click to close

## Files Modified
- `src/components/second-brain/ReadingView.tsx` — added chapter splitting, nav, TOC, font-size, progress persistence
- `src/components/second-brain/WriterAI.tsx` — NEW, the AI writing assistant component
- `src/components/second-brain/FormattingToolbar.tsx` — accepts `noteTitle`/`noteTags` props; renders `<WriterAI>` after the links group; changed wrapper overflow to visible
- `src/components/second-brain/EditorCanvas.tsx` — passes `noteTitle={editor.title}` and `noteTags={note.tags}` to FormattingToolbar; changed toolbar wrapper from `overflow: hidden` to `overflow: visible` so the WriterAI popover can extend below
- `src/app/globals.css` — `.sb-reader-prose` and its h1/h2/h3 now consume a `--reader-fs` CSS variable (default 13px) so the A-/A+ controls scale the entire reading view proportionally
- `src/utils/seedData.ts` — extended `lib_1` (Building a Second Brain) to have 4 chapters separated by `---` so the chapter navigation is visibly demonstrable; updated totalPages/currentPage to reflect chapter-based pagination

## Verification
- `bun run lint` → clean (no errors)
- `bun run tsc --noEmit` → 16 pre-existing errors in unrelated files (CanvasView, KanbanBoard, TodoList, useEditor, useNotes, websocket examples, skills/) — **zero errors in any file I touched**
- Dev server: `GET / 200` confirmed after edits

## Patterns Reused
- CSS variables (`--bg`, `--bg1`, `--bg2`, `--bd`, `--acc`, `--acc2`, `--acc-bg`, `--t1`, `--t2`, `--t3`, `--grn`, `--red`)
- JetBrains Mono throughout (forced via globals.css)
- Inline-style pattern with hover handlers (matches existing ToolButton / SelectionBtn / ImportModal style)
- `pendingSelection` ref + useLayoutEffect pattern from FormattingToolbar (mirrored in WriterAI for cursor restore after body updates)
- `getActiveTextarea` fallback (textareaRef → document.activeElement → querySelector) so WriterAI works in both the single-editor and segment-editor (embeds) cases
- `sb-fade-in` animation class for popover entrance
- `sb-scroll` / `sb-scroll-thin` for scrollable areas
- Lucide icons throughout
- API request via `fetch('/api/ai/ask?XTransformPort=3000', …)` matching the existing AskAIModal pattern

## Edge cases handled
- Single-chapter items (no `---` separator) — chapters array has 1 entry; prev/next are disabled
- Empty content — chapters array is empty; reader shows blank
- `chapterTitle` matching is fuzzy (starts-with either direction) so minor title drift doesn't break "return to last chapter"
- WriterAI with no textarea (rare edge case) — falls back to appending to end of body
- WriterAI with no selection — inserts at cursor with `\n\n` padding to avoid merging paragraphs
- Font-size CSS variable cascades to h1/h2/h3 via `calc(var(--reader-fs) * 1.38)` etc., so the whole reader scales proportionally
