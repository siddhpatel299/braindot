// Second Brain — Core type definitions

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

// Tag → color mapping for visual chips
export const TAG_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  strategy:  { color: '#b0a8fb', bg: 'rgba(124,110,247,0.12)', border: '#3d378a' },
  learning:  { color: '#34d399', bg: 'rgba(52,211,153,0.10)',  border: '#1a4a2a' },
  reading:   { color: '#fbbf24', bg: 'rgba(251,191,36,0.10)',  border: '#4a3010' },
  research:  { color: '#7dd3fc', bg: 'rgba(125,211,252,0.10)', border: '#1e3a5a' },
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
