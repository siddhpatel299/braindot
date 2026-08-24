// Braindot — Core type definitions

export type NoteStatus = 'draft' | 'evergreen';
export type NoteCollection = 'pinned' | 'strategy' | 'learning' | 'reading' | 'research'; // legacy, kept for migration
export type Tag = 'strategy' | 'learning' | 'reading' | 'research';
export type ParaType = 'projects' | 'areas' | 'resources' | 'archives';

export interface Folder {
  id: string;
  name: string;
  parentId: string | null; // null = top-level
  paraType?: ParaType;     // set for the 4 PARA root folders
  createdAt: string;
  expanded?: boolean;      // UI state: folder expanded by default?
}

export interface Note {
  id: string;
  filename: string;
  title: string;
  subtitle: string;
  tags: string[];
  body: string;
  backlinks: string[];    // computed at runtime
  createdAt: string;
  updatedAt: string;
  wordCount: number;
  status: NoteStatus;
  // Location
  folderId: string;       // canonical location in the folder tree
  pinned: boolean;        // shown in the Pinned section regardless of folder
  // Legacy (kept for migration from v1)
  collection?: NoteCollection;
}

export interface AppState {
  notes: Note[];
  folders: Folder[];
  openTabs: string[];
  activeTab: string;
  streak: number;
  totalConnections: number;
  lastEditDay: string;
}

export interface SuggestionCard {
  type: 'missing link' | 'synthesis ready' | 'review due' | 'open question';
  description: string;
  action: string;
}

export interface HistoryEntry {
  id: string;
  noteId: string;
  text: string;
  timestamp: number;
}

// Tag → color mapping for visual chips. Written as theme tokens rather than
// fixed hexes: these were light-on-dark values that stayed light-on-dark in
// light mode, which left tag chips barely readable there.
export const TAG_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  strategy:  { color: 'var(--acc2)', bg: 'var(--acc-bg)',   border: 'var(--acc-bd)' },
  learning:  { color: 'var(--grn)',  bg: 'var(--grn-bg)',   border: 'var(--grn-bd)' },
  reading:   { color: 'var(--amb)',  bg: 'var(--amb-bg)',   border: 'var(--amb-bd)' },
  research:  { color: 'var(--blu)',  bg: 'var(--blu-bg)',   border: 'var(--blu-bd)' },
};

// Legacy collection labels (used during migration only)
export const COLLECTION_LABELS: Record<NoteCollection, string> = {
  pinned:    'Pinned',
  strategy:  'Strategy',
  learning:  'Learning',
  reading:   'Reading',
  research:  'Research',
};

// PARA folder definitions — the 4 top-level organizational buckets
export const PARA_FOLDERS: { type: ParaType; name: string; description: string }[] = [
  { type: 'projects',  name: 'Projects',  description: 'Active work with a deadline' },
  { type: 'areas',     name: 'Areas',     description: 'Ongoing responsibilities' },
  { type: 'resources', name: 'Resources', description: 'Topical interest, no commitment' },
  { type: 'archives',  name: 'Archives',  description: 'Inactive items from the other three' },
];

// ============================================================
// Kanban + Todo types
// ============================================================
/* One task model, four axes.
 *
 * The screen used to run two: a card with status/tags/dueDate and a todo with
 * done/priority/dueGroup, both carrying linkedNoteId, both meaning "a thing I
 * have to do". These four fields are the four questions worth asking about
 * one, and each is a way of grouping the same list rather than a separate
 * system.
 */
export type TaskState = 'backlog' | 'doing' | 'review' | 'done';
export type TaskWhen = 'overdue' | 'today' | 'week' | 'later';
export type TaskEffort = 'quick' | 'deep' | 'waiting';
/** The artefact class a task produces — a bucket, not a note reference, so it
 *  groups into four columns instead of one column per note. */
export type TaskOutput = 'drafts' | 'evergreen' | 'marks' | 'none';

/** The axes the board can group by. Each is a field name on Task. */
export type TaskAxis = 'state' | 'when' | 'effort' | 'output';

export interface Task {
  id: string;
  title: string;
  state: TaskState;
  when: TaskWhen;
  effort: TaskEffort;
  output: TaskOutput;
  linkedNoteId: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
  /** Carried through from imported cards so nothing a user typed is thrown
   *  away. Nothing groups by it and the redesigned card does not show it. */
  description?: string;
  /** Display only. `when` is what groups. */
  dueDate?: string | null;
}

// ============================================================
// Canvas types
// ============================================================
/* A card is a note pinned to the table or a sticky you wrote on it. The
   synthesis card is gone: it was a sticky with a promote button, and promotion
   is now a selection action that works on any mixture of cards. */
export type CanvasCardType = 'note' | 'sticky';

export interface CanvasNoteCard {
  type: 'note';
  noteId: string;
  title: string;
  preview: string;
}

export interface CanvasSticky {
  type: 'sticky';
  text: string;
  /** A claim you are making, or an aside you want kept nearby. The selection
   *  bar sets both; there is no variant the UI cannot reach. */
  variant: 'claim' | 'aside';
}

export type CanvasCardData = CanvasNoteCard | CanvasSticky;

export interface CanvasCard {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data: CanvasCardData;
  groupId: string | null;
}

export interface CanvasGroup {
  id: string;
  label: string;
  color: string;
  cardIds: string[];
}

export interface CanvasConnector {
  id: string;
  fromCardId: string;
  toCardId: string;
  style: 'solid' | 'dashed';
  label?: string;
}

export interface CanvasBoard {
  id: string;
  name: string;
  cards: CanvasCard[];
  groups: CanvasGroup[];
  connectors: CanvasConnector[];
  // View state — required by CanvasView for all coordinate math
  zoom: number;
  panX: number;
  panY: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// Reading / Library types
// ============================================================
import type { ReadingPosition } from '@/utils/readingPosition';
export type { ReadingPosition };

export type LibraryItemType = 'epub' | 'pdf' | 'rss' | 'url' | 'paper' | 'news';
export type LibraryItemStatus = 'unread' | 'reading' | 'done';

export interface LibraryItem {
  id: string;
  title: string;
  author: string | null;
  type: LibraryItemType;
  source: string;        // URL or filename
  content: string;       // extracted text
  excerpt: string;
  status: LibraryItemStatus;
  progress: number;      // 0-100, for the shelf's progress bar
  coverUrl: string | null;
  addedAt: string;
  updatedAt: string;
  highlights: string[];  // highlight IDs
  /** Where you stopped, precisely enough to resume on another device.
   *  Optional: a book added before this existed has none, and falls back to
   *  the chapter `progress` implies. See utils/readingPosition.ts. */
  position?: ReadingPosition;
}

/** A place in a book worth coming back to. Unlike a highlight, it marks a
 *  location rather than a passage, and carries a name you chose. */
export interface Bookmark {
  id: string;
  libraryItemId: string;
  chapter: number;
  charOffset: number;
  /** What the reader called it, or the opening words if they named nothing. */
  label: string;
  createdAt: string;
}

export type HighlightColor = 'yellow' | 'purple' | 'green';

export interface Highlight {
  id: string;
  libraryItemId: string;
  /** Set once the mark has been promoted into a note of its own. */
  noteId: string | null;
  text: string;
  color: HighlightColor;
  page: number | null;
  createdAt: string;
  /** A line of your own against the passage.
   *
   *  Marginalia is mostly one sentence, and there was nowhere to put one: a
   *  mark could be silent or become a whole note, with nothing in between.
   *  Optional, so every mark written before this stays valid. */
  note?: string;
}
