// Onboarding templates for new users
// When a new user signs up, their vault starts empty with these template notes
// instead of the full seed data (which is for demo mode)

import { Note, Folder } from '@/types';
import { SEED_FOLDER_IDS, generateNoteId } from '@/utils/seedData';
import { countWords } from '@/utils/markdown';

const now = new Date().toISOString();

export const TEMPLATE_FOLDERS: Folder[] = [
  // PARA structure
  { id: SEED_FOLDER_IDS.projects, name: 'Projects', parentId: null, paraType: 'projects', createdAt: now, expanded: true },
  { id: SEED_FOLDER_IDS.areas, name: 'Areas', parentId: null, paraType: 'areas', createdAt: now, expanded: true },
  { id: SEED_FOLDER_IDS.resources, name: 'Resources', parentId: null, paraType: 'resources', createdAt: now, expanded: true },
  { id: SEED_FOLDER_IDS.archives, name: 'Archives', parentId: null, paraType: 'archives', createdAt: now, expanded: false },
  // Sub-folders
  { id: SEED_FOLDER_IDS.areasStrategy, name: 'Strategy', parentId: SEED_FOLDER_IDS.areas, createdAt: now, expanded: true },
  { id: SEED_FOLDER_IDS.resourcesPkm, name: 'PKM', parentId: SEED_FOLDER_IDS.resources, createdAt: now, expanded: true },
  { id: SEED_FOLDER_IDS.resourcesLearning, name: 'Learning', parentId: SEED_FOLDER_IDS.resources, createdAt: now, expanded: true },
  { id: SEED_FOLDER_IDS.resourcesReading, name: 'Reading', parentId: SEED_FOLDER_IDS.resources, createdAt: now, expanded: true },
  { id: SEED_FOLDER_IDS.resourcesResearch, name: 'Research', parentId: SEED_FOLDER_IDS.resources, createdAt: now, expanded: true },
  { id: SEED_FOLDER_IDS.journal, name: 'Journal', parentId: SEED_FOLDER_IDS.resources, createdAt: now, expanded: false },
];

export const TEMPLATE_NOTES: Note[] = [
  {
    id: 'tpl_welcome',
    filename: 'welcome-to-braindot.md',
    title: 'Welcome to Braindot',
    subtitle: 'Your knowledge, connected.',
    tags: ['strategy', 'learning'],
    body: `# Welcome to Braindot

This is your first note. It lives in your **Resources** folder under **PKM**.

## What is this app?

Braindot is a personal knowledge management (PKM) workspace. Think of it as a thinking environment — not a filing system. Your notes connect to each other, your reading flows into your vault, and AI helps you see patterns.

## How to get started

1. **Create a note** — click "+ new note" in the top bar, or press ⌘T
2. **Write in markdown** — use the formatting toolbar for bold, italic, headings, code blocks
3. **Link notes** — type [[note-title]] to create a wiki-link to another note
4. **Open the command palette** — press ⌘K to search notes, run commands, navigate
5. **Explore the dashboard** — click the brain logo (top-left) to see your stats

## Key features

- **Notes** — VSCode-style tabbed markdown editor with live preview
- **Graph** — living knowledge graph showing how your notes connect
- **Reading** — read epub/pdf/articles, highlight, and capture to your vault
- **Canvas** — freeform spatial workspace for brainstorming
- **Kanban** — task management linked to your notes
- **Mind maps** — type /mindmap inside any note to embed a visual map
- **AI** — ask questions about your notes, get writing help

> [!callout]
> The best way to learn is to start writing. Create a note about something you learned today. Link it to this welcome note with [[welcome-to-braindot]]. That's your first connection.

## Tips

- Press **⌘K** for the command palette — it's the fastest way to do anything
- Type **/** in the editor to insert mind maps, kanbans, and todo lists
- Switch between **edit**, **preview**, and **diff** modes using the tabs above the editor
- Right-click a note in the file tree to pin it

## What's next?

When you're ready, delete this note and start building your own vault. The PARA folders (Projects, Areas, Resources, Archives) are already set up for you.`,
    backlinks: [],
    createdAt: now,
    updatedAt: now,
    wordCount: 0,
    status: 'evergreen',
    folderId: SEED_FOLDER_IDS.resourcesPkm,
    pinned: true,
  },
  {
    id: 'tpl_how_to_use',
    filename: 'how-to-use-this-app.md',
    title: 'How to Use This App',
    subtitle: 'A quick tour of every feature.',
    tags: ['learning'],
    body: `# How to Use This App

## The Layout

The app has 4 zones, left to right:

1. **Icon Rail** (left edge) — navigate between Notes, Graph, Reading, Canvas, Kanban, and more
2. **File Tree** — your folder structure with PARA organization (Projects, Areas, Resources, Archives)
3. **Editor** — the main writing area with tabs, formatting toolbar, and live preview
4. **Context Panel** (right) — AI suggestions, graph, and history

## Keyboard Shortcuts

- **⌘K** — command palette (search notes, run commands)
- **⌘T** — new note
- **⌘W** — close current tab
- **⌘S** — save (autosave is on by default)
- **⌘J** — daily journal
- **⌘B** — bold
- **⌘I** — italic
- **⌘U** — underline
- **⌘Shift+K** — inline code
- **Tab** — indent

## Slash Commands

Type **/** in the editor to insert:
- **/mindmap** — embed an interactive mind map
- **/todo** — embed a checklist
- **/kanban** — embed a kanban preview

## Wiki-Links

Type [[note-title]] to link to another note. The link turns purple and becomes clickable (⌘+click to open). Backlinks are computed automatically — you'll see them at the bottom of every note.

## The Graph

Click the Graph icon to see your knowledge graph. Nodes pulse based on activity — recently edited notes glow orange, old notes fade. Filter by tag, links, or activity level.

## Reading Section

Click the Books icon to open the reading section:
- Upload epub/pdf files
- Fetch live tech news from Hacker News
- Fetch research papers from arXiv
- Highlight text in 3 colors
- Capture highlights as notes in your vault

## Canvas

Click the Box icon for the freeform canvas:
- Drag note cards anywhere
- Draw connectors between cards
- Create group regions
- Add sticky notes and synthesis cards
- Pan and zoom the infinite canvas

## AI Features

- **Ask AI** — click "ask AI about this" in the context panel to chat about your note
- **Content Writer** — click "✨ write" in the toolbar for writing help
- **Suggestions** — the AI panel shows missing links, synthesis opportunities, and review reminders`,
    backlinks: [],
    createdAt: now,
    updatedAt: now,
    wordCount: 0,
    status: 'evergreen',
    folderId: SEED_FOLDER_IDS.resourcesPkm,
    pinned: false,
  },
  {
    id: 'tpl_first_note',
    filename: 'my-first-note.md',
    title: 'My First Note',
    subtitle: 'Start here — write something you learned today.',
    tags: [],
    body: `# My First Note

Write something you learned today. It doesn't have to be profound — just one idea, in your own words.

## What did I learn?

[Start typing here. Delete this placeholder and write your thought.]

## How does this connect to other things?

Use [[wiki-links]] to connect this note to other notes. For example, link to [[welcome-to-braindot]] or [[how-to-use-this-app]].

> [!callout]
> The best notes answer one question: "What did I learn?" Write that, and the connections will follow.

## What's next?

- Add tags using the tag field above
- Try the formatting toolbar (bold, italic, headings)
- Switch to Preview mode to see the rendered version
- Press ⌘K to explore the command palette`,
    backlinks: [],
    createdAt: now,
    updatedAt: now,
    wordCount: 0,
    status: 'draft',
    folderId: SEED_FOLDER_IDS.resourcesPkm,
    pinned: false,
  },
].map(n => ({ ...n, wordCount: countWords(n.body) }));
