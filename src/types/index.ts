// Second Brain — Core type definitions

export type NoteStatus = 'draft' | 'evergreen';
export type NoteCollection = 'pinned' | 'strategy' | 'learning' | 'reading' | 'research';
export type Tag = 'strategy' | 'learning' | 'reading' | 'research';

export interface Note {
  id: string;
  filename: string;       // e.g. "zettelkasten-method.md"
  title: string;
  subtitle: string;
  tags: string[];
  body: string;           // raw markdown
  backlinks: string[];    // array of note IDs that reference this note (computed at runtime; persisted as cache)
  createdAt: string;
  updatedAt: string;
  wordCount: number;
  status: NoteStatus;
  collection: NoteCollection;
}

export interface AppState {
  notes: Note[];
  openTabs: string[];          // array of note IDs
  activeTab: string;           // current note ID
  streak: number;              // days in a row
  totalConnections: number;
  lastEditDay: string;         // YYYY-MM-DD, used to compute streak
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

// Tag → color mapping for visual chips
export const TAG_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  strategy:  { color: '#b0a8fb', bg: 'rgba(124,110,247,0.12)', border: '#3d378a' },
  learning:  { color: '#34d399', bg: 'rgba(52,211,153,0.10)',  border: '#1a4a2a' },
  reading:   { color: '#fbbf24', bg: 'rgba(251,191,36,0.10)',  border: '#4a3010' },
  research:  { color: '#7dd3fc', bg: 'rgba(125,211,252,0.10)', border: '#1e3a5a' },
};

export const COLLECTION_LABELS: Record<NoteCollection, string> = {
  pinned:    'Pinned',
  strategy:  'Strategy',
  learning:  'Learning',
  reading:   'Reading',
  research:  'Research',
};

export const COLLECTION_ORDER: NoteCollection[] = ['pinned', 'strategy', 'learning', 'reading', 'research'];
