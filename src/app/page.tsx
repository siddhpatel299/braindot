'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNotes } from '@/hooks/useNotes';
import { useEditor } from '@/hooks/useEditor';
import { useBacklinks } from '@/hooks/useBacklinks';
import { Note, NoteCollection } from '@/types';
import { IconRail, IconRailView } from '@/components/second-brain/IconRail';
import { FileTree } from '@/components/second-brain/FileTree';
import { CommandBar } from '@/components/second-brain/CommandBar';
import { EditorTabs } from '@/components/second-brain/EditorTabs';
import { EditorCanvas } from '@/components/second-brain/EditorCanvas';
import { ContextPanel } from '@/components/second-brain/ContextPanel';
import { StatusBar } from '@/components/second-brain/StatusBar';
import { CommandPalette } from '@/components/second-brain/CommandPalette';

interface HistoryEntry {
  id: string;
  noteId: string;
  text: string;
  timestamp: number;
}

export default function Home() {
  const {
    state,
    hydrated,
    updateNote,
    createNote,
    deleteNote,
    openTab,
    closeTab,
    setActiveTab,
    reorderTabs,
  } = useNotes();

  const [iconView, setIconView] = useState<IconRailView>('notes');
  const [search, setSearch] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [contextTab, setContextTab] = useState<'ai' | 'graph' | 'history'>('ai');
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const activeNote = useMemo(
    () => state.notes.find((n) => n.id === state.activeTab) || state.notes[0],
    [state.notes, state.activeTab],
  );

  const editor = useEditor(activeNote, updateNote);

  // Push history entries — declared early so effects can use it.
  const pushHistory = useCallback((noteId: string, text: string) => {
    setHistory((prev) => [
      { id: 'h_' + Math.random().toString(36).slice(2, 9), noteId, text, timestamp: Date.now() },
      ...prev,
    ].slice(0, 50));
  }, []);

  // We use refs to disambiguate "opened" vs "linked to" vs "created" events
  // so we don't double-log: the [activeNote] effect always logs an entry when
  // the active note changes, but the type of event is determined by which ref
  // was set by the originating handler.
  const linkedOpenRef = useRef<string | null>(null);
  const createdOpenRef = useRef<string | null>(null);

  // Track unsaved (dirty) note IDs to show amber dot on tabs
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!activeNote) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDirtyIds((prev) => {
      const next = new Set(prev);
      if (editor.dirty) next.add(activeNote.id);
      else next.delete(activeNote.id);
      return next;
    });
  }, [editor.dirty, activeNote]);

  // Push history entries when active note changes.
  // Skip the initial mount — history should reflect user actions, not the
  // automatic opening of the last active note on app load.
  const lastLoggedNote = useRef<string | undefined>(undefined);
  const skipInitialMount = useRef(true);
  useEffect(() => {
    if (!activeNote) return;
    if (skipInitialMount.current) {
      skipInitialMount.current = false;
      lastLoggedNote.current = activeNote.id;
      return;
    }
    if (lastLoggedNote.current !== activeNote.id) {
      lastLoggedNote.current = activeNote.id;
      let text: string;
      if (createdOpenRef.current === activeNote.id) {
        text = `created ${activeNote.title}`;
        createdOpenRef.current = null;
      } else if (linkedOpenRef.current === activeNote.id) {
        text = `linked to ${activeNote.title}`;
        linkedOpenRef.current = null;
      } else {
        text = `opened ${activeNote.title}`;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      pushHistory(activeNote.id, text);
    }
  }, [activeNote, pushHistory]);

  // Track edits → push history entries (debounced)
  const lastEditPushed = useRef<number>(0);
  useEffect(() => {
    if (!activeNote) return;
    if (!editor.dirty) return;
    const now = Date.now();
    if (now - lastEditPushed.current > 5000) {
      lastEditPushed.current = now;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      pushHistory(activeNote.id, `edited ${activeNote.title}`);
    }
  }, [editor.body, activeNote, editor.dirty, pushHistory]);

  // ---------- Actions ----------
  const handleOpenNote = useCallback(
    (id: string) => {
      openTab(id);
      // history is logged by the [activeNote] effect
    },
    [openTab],
  );

  const handleOpenNoteByTitle = useCallback(
    (title: string) => {
      const n = state.notes.find(
        (x) => x.title.toLowerCase() === title.toLowerCase() ||
              x.filename.toLowerCase() === title.toLowerCase() + '.md',
      );
      if (n) {
        linkedOpenRef.current = n.id;
        openTab(n.id);
      }
    },
    [openTab, state.notes],
  );

  const handleCreateNote = useCallback(
    (collection: NoteCollection = 'learning') => {
      const n = createNote(collection);
      createdOpenRef.current = n.id;
      // history is logged by the [activeNote] effect with "created X"
    },
    [createNote],
  );

  const handleCloseTab = useCallback(
    (id: string) => {
      closeTab(id);
    },
    [closeTab],
  );

  const handleToggleEvergreen = useCallback(
    (id: string) => {
      const n = state.notes.find((x) => x.id === id);
      if (!n) return;
      const next = n.status === 'evergreen' ? 'draft' : 'evergreen';
      updateNote(id, { status: next });
      pushHistory(id, `marked ${next}`);
    },
    [state.notes, updateNote],
  );

  const handleExport = useCallback(() => {
    if (!activeNote) return;
    const blob = new Blob([`# ${activeNote.title}\n\n${activeNote.body}`], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeNote.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    pushHistory(activeNote.id, `exported ${activeNote.filename}`);
  }, [activeNote]);

  // ---------- Keyboard shortcuts ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (meta && e.key.toLowerCase() === 't') {
        e.preventDefault();
        handleCreateNote('learning');
      } else if (meta && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (activeNote) handleCloseTab(activeNote.id);
      } else if (meta && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault();
        editor.flushSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeNote, editor, handleCreateNote, handleCloseTab]);

  // ---------- Backlink + word count for status bar ----------
  const { backlinks, totalConnections } = useBacklinks(state.notes);

  const activeLinkCount = useMemo(() => {
    if (!activeNote) return 0;
    // Count [[wiki-link]] occurrences in the body, deduped by target
    const re = /\[\[([^\]]+)\]\]/g;
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(activeNote.body)) !== null) {
      seen.add(m[1].toLowerCase());
    }
    return seen.size;
  }, [activeNote]);

  // ---------- Render ----------
  if (!hydrated) {
    return (
      <div
        style={{
          height: '100vh',
          background: 'var(--bg)',
          color: 'var(--t3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11,
        }}
      >
        loading second brain…
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        background: 'var(--bg)',
        color: 'var(--t1)',
        overflow: 'hidden',
      }}
    >
      {/* Top: command bar (full width) */}
      <CommandBar
        search={search}
        onSearchChange={setSearch}
        onOpenPalette={() => setPaletteOpen(true)}
        onCreate={() => handleCreateNote('learning')}
        streak={state.streak}
      />

      {/* Middle: 4-zone horizontal flex */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <IconRail
          active={iconView}
          onSelect={(v) => {
            setIconView(v);
            if (v === 'search') setPaletteOpen(true);
            if (v === 'ai') setContextTab('ai');
          }}
          onOpenPalette={() => setPaletteOpen(true)}
        />

        <FileTree
          notes={state.notes}
          activeId={activeNote?.id || ''}
          filter={search}
          onSelect={handleOpenNote}
          onCreate={(c) => handleCreateNote(c)}
        />

        {/* Editor area: tabs + canvas */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <EditorTabs
            notes={state.notes}
            openTabs={state.openTabs}
            activeTab={state.activeTab}
            dirtyIds={dirtyIds}
            onSelect={setActiveTab}
            onClose={handleCloseTab}
            onCreate={() => handleCreateNote('learning')}
            onReorder={reorderTabs}
          />
          {activeNote && (
            <EditorCanvas
              note={activeNote}
              allNotes={state.notes}
              dirty={editor.dirty}
              editor={editor}
              onSave={updateNote}
              onOpenNote={handleOpenNote}
              onOpenNoteByTitle={handleOpenNoteByTitle}
              onToggleEvergreen={handleToggleEvergreen}
            />
          )}
        </div>

        <ContextPanel
          note={activeNote}
          allNotes={state.notes}
          activeTab={contextTab}
          onTabChange={setContextTab}
          onOpenNote={handleOpenNote}
          history={history}
        />
      </div>

      {/* Bottom: status bar */}
      <StatusBar
        wordCount={editor.wordCount}
        linkCount={activeLinkCount}
        dirty={editor.dirty}
        totalNotes={state.notes.length}
        totalConnections={state.totalConnections}
      />

      {/* Command palette overlay */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        notes={state.notes}
        onOpenNote={handleOpenNote}
        onCreateNote={() => handleCreateNote('learning')}
        onOpenGraph={() => setContextTab('graph')}
        onExport={handleExport}
      />
    </div>
  );
}
