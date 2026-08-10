'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useConvexAuth } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useNotes } from '@/hooks/useNotes';
import { useEditor } from '@/hooks/useEditor';
import { useBacklinks } from '@/hooks/useBacklinks';
import { Note } from '@/types';
import { SEED_FOLDER_IDS, todayDateKey } from '@/utils/seedData';
import { extractWikiLinks } from '@/utils/markdown';
import { IconRail, IconRailView } from '@/components/second-brain/IconRail';
import { FileTree } from '@/components/second-brain/FileTree';
import { CommandBar } from '@/components/second-brain/CommandBar';
import { EditorTabs } from '@/components/second-brain/EditorTabs';
import { EditorCanvas } from '@/components/second-brain/EditorCanvas';
import { ContextPanel, ContextTab } from '@/components/second-brain/ContextPanel';
import { AIMode } from '@/components/second-brain/AIChat';
import { StatusBar } from '@/components/second-brain/StatusBar';
import { CommandPalette } from '@/components/second-brain/CommandPalette';
import { AskAIModal } from '@/components/second-brain/AskAIModal';
import { AppDialog, DialogState } from '@/components/second-brain/AppDialog';
import { Dashboard } from '@/components/second-brain/Dashboard';
import { SearchView } from '@/components/second-brain/SearchView';
import { GraphView } from '@/components/second-brain/GraphView';
import { KanbanTodoPage } from '@/components/second-brain/KanbanTodoPage';
import { CanvasView } from '@/components/second-brain/CanvasView';
import { ReadingView } from '@/components/second-brain/ReadingView';
import { useKanbanTodos, useCanvas, useReading } from '@/hooks/useVaultData';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';

const TREE_COLLAPSED_KEY = 'second-brain-tree-collapsed';
const PANEL_COLLAPSED_KEY = 'second-brain-panel-collapsed';

/**
 * Edge toggle for the file tree / context panel. Sits in the editor tab row so
 * it stays reachable when the panel it controls is hidden — a control that
 * disappears with its panel leaves no way back.
 */
function PanelToggle({
  side,
  collapsed,
  onClick,
}: {
  side: 'left' | 'right';
  collapsed: boolean;
  onClick: () => void;
}) {
  const Icon = side === 'left'
    ? (collapsed ? PanelLeftOpen : PanelLeftClose)
    : (collapsed ? PanelRightOpen : PanelRightClose);
  const what = side === 'left' ? 'folder tree' : 'context panel';
  const label = `${collapsed ? 'Show' : 'Hide'} ${what}`;

  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={!collapsed}
      title={`${label}  ${side === 'left' ? '⌘\\' : '⌘⇧\\'}`}
      style={{
        width: 34,
        height: 38,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg1)',
        border: 'none',
        borderBottom: '1px solid var(--bd)',
        color: collapsed ? 'var(--t3)' : 'var(--t2)',
        cursor: 'pointer',
        transition: 'color 140ms, background 140ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg3)';
        e.currentTarget.style.color = 'var(--t1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--bg1)';
        e.currentTarget.style.color = collapsed ? 'var(--t3)' : 'var(--t2)';
      }}
    >
      <Icon size={15} />
    </button>
  );
}

interface HistoryEntry {
  id: string;
  noteId: string;
  text: string;
  timestamp: number;
}

export default function Home() {
  // Auth — Convex Auth session (server-verified) or local demo mode
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const [authMode, setAuthMode] = useState<'demo' | 'user' | 'loading'>('loading');

  useEffect(() => {
    const isDemo = localStorage.getItem('second-brain-demo') === 'true';
    /* eslint-disable react-hooks/set-state-in-effect */
    if (isDemo) {
      setAuthMode('demo');
      return;
    }
    if (authLoading) return;
    if (isAuthenticated) {
      setAuthMode('user');
    } else {
      /* eslint-enable react-hooks/set-state-in-effect */
      window.location.href = '/landing';
      return;
    }
  }, [authLoading, isAuthenticated]);

  const handleSignOut = useCallback(async () => {
    // Stop every debounced/pagehide localStorage flush from re-writing the
    // vault we are about to clear (the sign-out navigation fires pagehide).
    (window as unknown as { __sbSignout?: boolean }).__sbSignout = true;
    try { await signOut(); } catch {}
    // Clear the local mirror of the vault — otherwise the next account to
    // sign in on this machine would migrate this user's data into itself.
    for (const key of [
      'second-brain-user', 'second-brain-demo', 'second-brain-state-v2',
      'second-brain-ui-state', 'sb-kanban-cards', 'sb-todos',
      'sb-canvas-boards', 'sb-library-items', 'sb-highlights',
    ]) {
      localStorage.removeItem(key);
    }
    window.location.href = '/landing';
  }, [signOut]);

  const {
    state,
    hydrated,
    cloudSync,
    updateNote,
    createNote,
    deleteNote,
    moveNote,
    togglePinned,
    openTab,
    closeTab,
    setActiveTab,
    reorderTabs,
    createFolder,
    renameFolder,
    deleteFolder,
    toggleFolderExpanded,
  } = useNotes();

  // Kanban + Todos + Canvas + Reading state (localStorage)
  const kanbanTodos = useKanbanTodos();
  const canvas = useCanvas();
  const reading = useReading();

  const [iconView, setIconView] = useState<IconRailView>('dashboard');
  const [appView, setAppView] = useState<'dashboard' | 'notes' | 'search' | 'graph' | 'kanban' | 'canvas' | 'reading'>('dashboard');
  const [search, setSearch] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [contextTab, setContextTab] = useState<ContextTab>('info');
  const [aiMode, setAiMode] = useState<AIMode>('note');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [fileTreeView, setFileTreeView] = useState<'folders' | 'tags'>('folders');
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [askAIOpen, setAskAIOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toast, setToast] = useState<string | null>(null);

  const activeNote = useMemo(
    () => state.notes.find((n) => n.id === state.activeTab) || state.notes[0],
    [state.notes, state.activeTab],
  );

  const editor = useEditor(activeNote, updateNote);

  // ---------- Toast helper ----------
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  // ---------- History logging ----------
  const pushHistory = useCallback((noteId: string, text: string) => {
    setHistory((prev) => [
      { id: 'h_' + Math.random().toString(36).slice(2, 9), noteId, text, timestamp: Date.now() },
      ...prev,
    ].slice(0, 50));
  }, []);

  const linkedOpenRef = useRef<string | null>(null);
  const createdOpenRef = useRef<string | null>(null);

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
  const handleOpenNote = useCallback((id: string) => {
    openTab(id);
    setAppView('notes');
  }, [openTab]);

  const handleOpenNoteByTitle = useCallback((title: string) => {
    const n = state.notes.find(
      (x) => x.title.toLowerCase() === title.toLowerCase() ||
            x.filename.toLowerCase() === title.toLowerCase() + '.md',
    );
    if (n) {
      linkedOpenRef.current = n.id;
      openTab(n.id);
      setAppView('notes');
    }
  }, [openTab, state.notes]);

  const handleCreateNote = useCallback((folderId?: string) => {
    const fid = folderId || SEED_FOLDER_IDS.resourcesPkm;
    const n = createNote(fid);
    createdOpenRef.current = n.id;
    setAppView('notes');
    return n;
  }, [createNote]);

  const handleCreateJournal = useCallback(() => {
    // Create or find today's journal note in the Journal folder
    const today = todayDateKey();
    const existing = state.notes.find(
      (n) => n.folderId === SEED_FOLDER_IDS.journal && n.title === `Journal — ${today}`,
    );
    if (existing) {
      openTab(existing.id);
      setAppView('notes');
      showToast(`opened today's journal`);
      return;
    }
    const n = createNote(SEED_FOLDER_IDS.journal);
    updateNote(n.id, {
      title: `Journal — ${today}`,
      filename: `journal-${today}.md`,
      subtitle: 'Daily notes, fragments, observations.',
      body: `# ${today}\n\nMorning:\n\nAfternoon:\n\nEvening:\n\n---\n\nWhat did I learn today? \n\nWhat surprised me?\n\nWhat do I want to remember tomorrow?\n`,
      tags: [],
    });
    createdOpenRef.current = n.id;
    setAppView('notes');
    showToast(`created today's journal`);
  }, [state.notes, createNote, updateNote, openTab, showToast]);

  const handleCloseTab = useCallback((id: string) => {
    closeTab(id);
  }, [closeTab]);

  const handleToggleEvergreen = useCallback((id: string) => {
    const n = state.notes.find((x) => x.id === id);
    if (!n) return;
    const next = n.status === 'evergreen' ? 'draft' : 'evergreen';
    updateNote(id, { status: next });
    pushHistory(id, `marked ${next}`);
    showToast(`marked ${next}`);
  }, [state.notes, updateNote, pushHistory, showToast]);

  // ---------- Export note as .md ----------
  const handleExportNote = useCallback(() => {
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
    showToast(`downloaded ${activeNote.filename}`);
  }, [activeNote, pushHistory, showToast]);

  // ---------- Export as essay (note + linked notes compiled) ----------
  const handleExportEssay = useCallback(() => {
    if (!activeNote) return;
    const linkedTitles = extractWikiLinks(activeNote.body);
    const titleToNote = new Map<string, Note>();
    for (const n of state.notes) {
      titleToNote.set(n.title.toLowerCase(), n);
      titleToNote.set(n.filename.toLowerCase().replace(/\.md$/, ''), n);
    }
    const linkedNotes: Note[] = [];
    for (const t of linkedTitles) {
      const n = titleToNote.get(t.toLowerCase());
      if (n && n.id !== activeNote.id && !linkedNotes.find((x) => x.id === n.id)) {
        linkedNotes.push(n);
      }
    }

    const parts: string[] = [];
    parts.push(`# ${activeNote.title}\n`);
    if (activeNote.subtitle) parts.push(`*${activeNote.subtitle}*\n`);
    parts.push(`\n${activeNote.body}\n`);

    if (linkedNotes.length > 0) {
      parts.push('\n---\n');
      parts.push(`## Related Notes\n`);
      for (const ln of linkedNotes) {
        parts.push(`\n### ${ln.title}\n`);
        if (ln.subtitle) parts.push(`*${ln.subtitle}*\n`);
        parts.push(`\n${ln.body}\n`);
      }
    }

    const essayBody = parts.join('\n');
    const filename = activeNote.filename.replace(/\.md$/, '') + '-essay.md';
    const blob = new Blob([essayBody], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    pushHistory(activeNote.id, `exported essay (${linkedNotes.length} related notes)`);
    showToast(`exported essay with ${linkedNotes.length} related notes`);
  }, [activeNote, state.notes, pushHistory, showToast]);

  // ---------- Insert [[wiki-link]] at cursor ----------
  const editorTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const handleInsertLink = useCallback((linkTitle: string) => {
    if (!linkTitle || !activeNote) return;
    const ta = document.querySelector('.sb-editor-textarea') as HTMLTextAreaElement | null;
    if (!ta) {
      // fallback: append
      const newBody = activeNote.body + `\n\n[[${linkTitle}]]`;
      editor.updateBody(newBody);
      showToast(`appended [[${linkTitle}]]`);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const insert = ` [[${linkTitle}]] `;
    const newBody = activeNote.body.slice(0, start) + insert + activeNote.body.slice(end);
    editor.updateBody(newBody);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + insert.length;
      ta.selectionStart = ta.selectionEnd = pos;
    });
    pushHistory(activeNote.id, `inserted link to ${linkTitle}`);
    showToast(`linked to ${linkTitle}`);
  }, [activeNote, editor, pushHistory, showToast]);

  // ---------- Draft synthesis (new note listing related notes) ----------
  const handleDraftSynthesis = useCallback(() => {
    if (!activeNote) return;
    const sameTagNotes = state.notes.filter(
      (n) => n.id !== activeNote.id && n.tags.some((t) => activeNote.tags.includes(t)),
    );
    const n = createNote(activeNote.folderId);
    const tagList = activeNote.tags.length ? activeNote.tags.join(', ') : 'none';
    const body = `# Synthesis: ${activeNote.title}\n\nThis note collects ${sameTagNotes.length + 1} notes that share the tags [${tagList}] and explores how their core claims connect.\n\n## Source Notes\n\n${[activeNote, ...sameTagNotes].map((src) => `- [[${src.title}]] — ${src.subtitle}`).join('\n')}\n\n## Synthesis\n\n[Write the merged claim here. What do these notes collectively argue that none of them argue alone?]\n\n## Open Questions\n\n- \n- \n`;
    updateNote(n.id, {
      title: `Synthesis — ${activeNote.title}`,
      filename: `synthesis-${activeNote.filename}`,
      subtitle: `Synthesizing ${sameTagNotes.length + 1} notes sharing tags: ${tagList}`,
      tags: activeNote.tags,
      body,
    });
    createdOpenRef.current = n.id;
    pushHistory(n.id, `drafted synthesis from ${activeNote.title}`);
    showToast(`drafted synthesis of ${sameTagNotes.length + 1} notes`);
  }, [activeNote, state.notes, createNote, updateNote, pushHistory, showToast]);

  // ---------- Answer in new note ----------
  const handleAnswerInNewNote = useCallback((question: string) => {
    if (!activeNote) return;
    const n = createNote(activeNote.folderId);
    const body = `# Question\n\n${question}\n\n# Context\n\nThis question arose while working on [[${activeNote.title}]].\n\n# Answer\n\n[Write your answer here.]\n\n# Implications\n\n- \n- \n`;
    updateNote(n.id, {
      title: question.slice(0, 60) + (question.length > 60 ? '…' : ''),
      filename: `answer-${n.id.slice(-6)}.md`,
      subtitle: `Answering an open question from ${activeNote.title}.`,
      tags: activeNote.tags,
      body,
    });
    createdOpenRef.current = n.id;
    pushHistory(n.id, `opened new note for an open question`);
    showToast(`created note to answer the question`);
  }, [activeNote, createNote, updateNote, pushHistory, showToast]);

  // ---------- Save tutor output into the active note ----------
  const handleSaveToNote = useCallback((markdown: string) => {
    const block = markdown.trim();
    if (!block) return;
    if (activeNote) {
      const base = editor.body;
      const sep = base ? (base.endsWith('\n\n') ? '' : base.endsWith('\n') ? '\n' : '\n\n') : '';
      editor.updateBody(base + sep + block + '\n');
      showToast('saved to note');
    } else {
      const n = handleCreateNote();
      updateNote(n.id, { body: block + '\n' });
      showToast('saved to new note');
    }
  }, [activeNote, editor, handleCreateNote, updateNote, showToast]);

  // ---------- Schedule review ----------
  const handleScheduleReview = useCallback(() => {
    if (!activeNote) return;
    const reviewDate = new Date();
    reviewDate.setDate(reviewDate.getDate() + 7);
    const dateStr = reviewDate.toISOString().slice(0, 10);
    pushHistory(activeNote.id, `scheduled review for ${dateStr}`);
    showToast(`review scheduled for ${dateStr}`);
  }, [activeNote, pushHistory, showToast]);

  // ---------- Export vault as JSON ----------
  const handleExportVault = useCallback(() => {
    const data = {
      version: 2,
      exportedAt: new Date().toISOString(),
      notes: state.notes,
      folders: state.folders,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `braindot-vault-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`exported ${state.notes.length} notes`);
  }, [state.notes, state.folders, showToast]);

  // ---------- Import vault from JSON or Markdown ----------
  const handleImportVault = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) return;

      if (file.name.endsWith('.json')) {
        // Braindot JSON format
        try {
          const data = JSON.parse(content);
          if (data.notes && Array.isArray(data.notes)) {
            let imported = 0;
            for (const n of data.notes) {
              // Check if note already exists (by title)
              const exists = state.notes.find(
                (existing) => existing.title.toLowerCase() === n.title.toLowerCase(),
              );
              if (exists) continue;
              const newNote = createNote(n.folderId || SEED_FOLDER_IDS.resourcesPkm);
              updateNote(newNote.id, {
                title: n.title || 'Imported note',
                filename: n.filename || `imported-${newNote.id.slice(-6)}.md`,
                subtitle: n.subtitle || '',
                tags: n.tags || [],
                body: n.body || '',
                status: n.status || 'draft',
              });
              imported++;
            }
            showToast(`imported ${imported} notes from JSON`);
          }
        } catch {
          showToast('invalid JSON file');
        }
      } else if (file.name.endsWith('.md') || file.name.endsWith('.txt')) {
        // Obsidian/Markdown format — each file becomes a note
        const title = file.name.replace(/\.(md|txt)$/, '');
        const exists = state.notes.find(
          (n) => n.title.toLowerCase() === title.toLowerCase(),
        );
        if (exists) {
          showToast(`"${title}" already exists`);
          return;
        }
        const newNote = createNote(SEED_FOLDER_IDS.resourcesPkm);
        updateNote(newNote.id, {
          title,
          filename: file.name,
          subtitle: 'Imported from file',
          body: content,
          status: 'draft',
        });
        showToast(`imported "${title}"`);
      }
    };
    reader.readAsText(file);
  }, [state.notes, createNote, updateNote, showToast]);

  // ---------- Folder actions ----------
  const handleCreateFolder = useCallback((parentId: string | null) => {
    setDialog({
      type: 'prompt',
      title: parentId === null ? 'New folder' : 'New subfolder',
      label: 'Folder name',
      placeholder: 'e.g. Azure',
      confirmLabel: 'Create',
      onConfirm: (name) => {
        const f = createFolder(parentId, name || 'Untitled folder');
        showToast(`created folder "${f.name}"`);
      },
    });
  }, [createFolder, showToast]);

  const handleDeleteFolder = useCallback((id: string) => {
    const folder = state.folders.find((f) => f.id === id);
    setDialog({
      type: 'confirm',
      title: 'Delete folder',
      message: `Delete "${folder?.name || 'this folder'}"? Notes inside will be moved to Resources.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => { deleteFolder(id); showToast('folder deleted'); },
    });
  }, [state.folders, deleteFolder, showToast]);

  const handleDeleteNote = useCallback((id: string) => {
    const note = state.notes.find((n) => n.id === id);
    setDialog({
      type: 'confirm',
      title: 'Delete note',
      message: `Delete "${note?.title || 'this note'}"? This can't be undone.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => { deleteNote(id); showToast('note deleted'); },
    });
  }, [state.notes, deleteNote, showToast]);

  // Study is a tab in the editor's context panel now, so "open study" means
  // "put me in the editor with that tab showing".
  // Anything that targets a context-panel tab must also reveal the panel —
  // otherwise the action silently does nothing while it's hidden.
  const revealContext = useCallback((tab: ContextTab) => {
    setContextTab(tab);
    setPanelCollapsed((c) => {
      if (c) localStorage.setItem(PANEL_COLLAPSED_KEY, 'false');
      return false;
    });
  }, []);

  const openStudy = useCallback(() => {
    setAppView('notes');
    revealContext('ai');
    setAiMode('study');
  }, [revealContext]);

  // ---------- Icon rail actions ----------
  const handleIconSelect = useCallback((v: IconRailView) => {
    setIconView(v);
    if (v === 'search') {
      setAppView('search');
    } else if (v === 'dashboard') {
      setAppView('dashboard');
    } else if (v === 'graph') {
      setAppView('graph');
    } else if (v === 'kanban') {
      setAppView('kanban');
    } else if (v === 'canvas') {
      setAppView('canvas');
    } else if (v === 'reading') {
      setAppView('reading');
    } else if (v === 'tags') {
      setAppView('notes');
      setFileTreeView('tags');
      showToast('switched to tag view');
    } else if (v === 'notes') {
      setAppView('notes');
      setFileTreeView('folders');
    }
  }, [showToast]);

  // ---------- Panel visibility ----------
  // Restored from localStorage after mount so the server and first client
  // render agree (reading storage during render would desync hydration).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setTreeCollapsed(localStorage.getItem(TREE_COLLAPSED_KEY) === 'true');
    setPanelCollapsed(localStorage.getItem(PANEL_COLLAPSED_KEY) === 'true');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const toggleTree = useCallback(() => {
    setTreeCollapsed((c) => {
      localStorage.setItem(TREE_COLLAPSED_KEY, String(!c));
      return !c;
    });
  }, []);

  const togglePanel = useCallback(() => {
    setPanelCollapsed((c) => {
      localStorage.setItem(PANEL_COLLAPSED_KEY, String(!c));
      return !c;
    });
  }, []);

  // ---------- Keyboard shortcuts ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === '\\') {
        // ⌘\ tree, ⌘⇧\ context panel — VS Code muscle memory, and the only
        // meta combos still free (B/I/U/K/T/W/P/S/J are all taken).
        e.preventDefault();
        if (e.shiftKey) togglePanel();
        else toggleTree();
      } else if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (meta && e.key.toLowerCase() === 't') {
        e.preventDefault();
        handleCreateNote();
      } else if (meta && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (activeNote) handleCloseTab(activeNote.id);
      } else if (meta && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault();
        editor.flushSave();
        showToast('saved');
      } else if (meta && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        handleCreateJournal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeNote, editor, handleCreateNote, handleCloseTab, handleCreateJournal, showToast, toggleTree, togglePanel]);

  // Listen for journal event from command palette
  useEffect(() => {
    const handler = () => handleCreateJournal();
    window.addEventListener('sb-create-journal', handler);
    return () => window.removeEventListener('sb-create-journal', handler);
  }, [handleCreateJournal]);

  // Listen for dashboard event from command palette
  useEffect(() => {
    const handler = () => {
      setAppView('dashboard');
      setIconView('dashboard');
    };
    window.addEventListener('sb-go-dashboard', handler);
    return () => window.removeEventListener('sb-go-dashboard', handler);
  }, []);

  // ---------- Backlink + word count for status bar ----------
  const { backlinks, totalConnections } = useBacklinks(state.notes);

  const activeLinkCount = useMemo(() => {
    if (!activeNote) return 0;
    const re = /\[\[([^\]]+)\]\]/g;
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(activeNote.body)) !== null) {
      seen.add(m[1].toLowerCase());
    }
    return seen.size;
  }, [activeNote]);

  // ---------- Render ----------

  if (authMode === 'loading') {
    return (
      <div style={{
        height: '100vh', background: 'var(--bg)', color: 'var(--t3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
      }}>
        loading second brain…
      </div>
    );
  }

  if (!hydrated || (cloudSync.enabled && !cloudSync.ready)) {
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
        {cloudSync.enabled && !cloudSync.ready ? 'syncing your vault…' : 'loading second brain…'}
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
      {/* Top: command bar */}
      <CommandBar
        search={search}
        onSearchChange={setSearch}
        onOpenPalette={() => setPaletteOpen(true)}
        onCreate={() => handleCreateNote()}
        streak={state.streak}
        syncState={
          authMode === 'user'
            ? (cloudSync.syncing ? 'syncing' : 'synced')
            : 'local'
        }
        onSignOut={authMode === 'user' ? handleSignOut : undefined}
      />

      {/* Demo banner */}
      {authMode === 'demo' && (
        <div style={{
          height: 28, background: 'var(--amb-bg)', borderBottom: '1px solid #4a3010',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          fontSize: 11, color: 'var(--amb)', fontFamily: 'inherit', flexShrink: 0,
        }}>
          <span>⚡ demo mode — changes won't persist</span>
          <a href="/auth?mode=signup" style={{ color: 'var(--acc2)', textDecoration: 'underline', cursor: 'pointer', fontSize: 11 }}>sign up →</a>
          <button onClick={() => {
            localStorage.removeItem('second-brain-demo');
            window.location.href = '/landing';
          }} style={{
            background: 'transparent', border: '1px solid #4a3010', borderRadius: 3,
            padding: '2px 8px', color: 'var(--amb)', fontSize: 10, fontFamily: 'inherit', cursor: 'pointer',
          }}>exit</button>
        </div>
      )}

      {/* Middle: 4-zone horizontal flex */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <IconRail
          active={iconView}
          onSelect={handleIconSelect}
          onOpenPalette={() => setPaletteOpen(true)}
        />

        {appView === 'dashboard' ? (
          <Dashboard
            notes={state.notes}
            streak={state.streak}
            todos={kanbanTodos.todos}
            kanbanCards={kanbanTodos.kanbanCards}
            libraryItems={reading.libraryItems}
            highlights={reading.highlights}
            onOpenNote={handleOpenNote}
            onCreateNote={() => handleCreateNote()}
            onCreateJournal={handleCreateJournal}
            onAskAI={() => setAskAIOpen(true)}
            onStudyMode={openStudy}
            onViewGraph={() => {
              setAppView('graph');
              setIconView('graph');
            }}
            onExportVault={handleExportVault}
            onImportVault={handleImportVault}
            onToggleTodo={kanbanTodos.toggleTodo}
            onNavigate={handleIconSelect}
          />
        ) : appView === 'search' ? (
          <SearchView
            notes={state.notes}
            onOpenNote={handleOpenNote}
            onSynthesize={(notesToSynth) => {
              handleDraftSynthesis();
              setAppView('notes');
            }}
          />
        ) : appView === 'graph' ? (
          <GraphView
            notes={state.notes}
            folders={state.folders}
            onOpenNote={handleOpenNote}
            onBack={() => setAppView('dashboard')}
          />
        ) : appView === 'kanban' ? (
          <KanbanTodoPage
            notes={state.notes}
            folders={state.folders}
            kanbanCards={kanbanTodos.kanbanCards}
            todos={kanbanTodos.todos}
            onAddKanbanCard={kanbanTodos.addKanbanCard}
            onMoveKanbanCard={kanbanTodos.moveKanbanCard}
            onUpdateKanbanCard={kanbanTodos.updateKanbanCard}
            onDeleteKanbanCard={kanbanTodos.deleteKanbanCard}
            onAddTodo={kanbanTodos.addTodo}
            onToggleTodo={kanbanTodos.toggleTodo}
            onUpdateTodo={kanbanTodos.updateTodo}
            onDeleteTodo={kanbanTodos.deleteTodo}
            onOpenNote={handleOpenNote}
            onBack={() => setAppView('dashboard')}
          />
        ) : appView === 'canvas' ? (
          canvas.activeBoard ? (
            <CanvasView
              board={canvas.activeBoard}
              allBoards={canvas.boards}
              notes={state.notes}
              onOpenNote={handleOpenNote}
              onBack={() => setAppView('dashboard')}
              onUpdateBoard={canvas.updateBoard}
              onAddCard={canvas.addCard}
              onUpdateCard={canvas.updateCard}
              onDeleteCard={canvas.deleteCard}
              onAddGroup={canvas.addGroup}
              onDeleteGroup={canvas.deleteGroup}
              onAddConnector={canvas.addConnector}
              onDeleteConnector={canvas.deleteConnector}
              onSwitchBoard={canvas.setActiveBoardId}
              onCreateBoard={canvas.createBoard}
              onDeleteBoard={canvas.deleteBoard}
              onRenameBoard={canvas.renameBoard}
              onCreateNoteFromSynthesis={(title, subtitle) => {
                const n = handleCreateNote();
                updateNote(n.id, { title, subtitle });
                showToast('created note from synthesis');
              }}
            />
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', fontSize: 13 }}>
              <button
                onClick={() => canvas.createBoard('My First Canvas')}
                style={{
                  background: 'var(--acc)', color: '#fff', border: 'none', borderRadius: 5,
                  padding: '12px 24px', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600,
                }}
              >
                + create your first canvas
              </button>
            </div>
          )
        ) : appView === 'reading' ? (
          <ReadingView
            libraryItems={reading.libraryItems}
            highlights={reading.highlights}
            notes={state.notes}
            onBack={() => setAppView('dashboard')}
            onOpenNote={handleOpenNote}
            onAddLibraryItem={reading.addLibraryItem}
            onUpdateLibraryItem={reading.updateLibraryItem}
            onDeleteLibraryItem={reading.deleteLibraryItem}
            onAddHighlight={reading.addHighlight}
            onUpdateHighlight={reading.updateHighlight}
            onDeleteHighlight={reading.deleteHighlight}
            onCreateNoteFromHighlight={(highlight, sourceTitle) => {
              const n = handleCreateNote();
              updateNote(n.id, {
                title: `Highlight: ${highlight.text.slice(0, 50)}…`,
                subtitle: `From "${sourceTitle}"`,
                body: `> ${highlight.text}\n\n## Context\n\nThis highlight came from [[${sourceTitle}]].\n\n## Thoughts\n\n`,
              });
              showToast('created note from highlight');
            }}
          />
        ) : (
          <>
            {/* Hidden with display:none rather than unmounted — keeps panel
                state (AI thread, scroll, rename-in-progress) alive across a
                toggle, and takes the subtree out of the a11y tree for free. */}
            <div style={{ display: treeCollapsed ? 'none' : 'flex', flexShrink: 0 }}>
              <FileTree
                notes={state.notes}
                folders={state.folders}
                activeId={activeNote?.id || ''}
                filter={search}
                view={fileTreeView}
                onViewChange={setFileTreeView}
                onSelect={handleOpenNote}
                onCreateNote={(folderId) => handleCreateNote(folderId)}
                onCreateFolder={handleCreateFolder}
                onRenameFolder={renameFolder}
                onDeleteFolder={handleDeleteFolder}
                onToggleFolder={toggleFolderExpanded}
                onMoveNote={moveNote}
                onTogglePinned={togglePinned}
                onDeleteNote={handleDeleteNote}
              />
            </div>

            {/* Editor area: tabs + canvas */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'stretch', flexShrink: 0 }}>
                <PanelToggle side="left" collapsed={treeCollapsed} onClick={toggleTree} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <EditorTabs
                    notes={state.notes}
                    openTabs={state.openTabs}
                    activeTab={state.activeTab}
                    dirtyIds={dirtyIds}
                    onSelect={setActiveTab}
                    onClose={handleCloseTab}
                    onCreate={() => handleCreateNote()}
                    onReorder={reorderTabs}
                  />
                </div>
                <PanelToggle side="right" collapsed={panelCollapsed} onClick={togglePanel} />
              </div>
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
                  onDeleteNote={handleDeleteNote}
                  onImagesLocalOnly={() =>
                    showToast(
                      authMode === 'demo'
                        ? 'image saved in this browser only — sign up to sync it'
                        : 'image could not be uploaded — saved in this browser only',
                    )
                  }
                />
              )}
            </div>

            <div style={{ display: panelCollapsed ? 'none' : 'flex', flexShrink: 0 }}>
              <ContextPanel
                note={activeNote}
                allNotes={state.notes}
                activeTab={contextTab}
                onTabChange={setContextTab}
                aiMode={aiMode}
                onAiModeChange={setAiMode}
                onOpenNote={handleOpenNote}
                onOpenNoteByTitle={handleOpenNoteByTitle}
                onSaveToNote={handleSaveToNote}
                onExportEssay={handleExportEssay}
                onInsertLink={handleInsertLink}
                onDraftSynthesis={handleDraftSynthesis}
                onAnswerInNewNote={handleAnswerInNewNote}
                onScheduleReview={handleScheduleReview}
                history={history}
              />
            </div>
          </>
        )}
      </div>

      {/* Bottom: status bar */}
      <StatusBar
        wordCount={editor.wordCount}
        linkCount={activeLinkCount}
        dirty={editor.dirty}
        totalNotes={state.notes.length}
        totalConnections={state.totalConnections}
      />

      {/* Overlays */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        notes={state.notes}
        folders={state.folders}
        onOpenNote={handleOpenNote}
        onCreateNote={() => handleCreateNote()}
        onOpenGraph={() => revealContext('graph')}
        onExport={handleExportNote}
        onCreateFolder={() => handleCreateFolder(null)}
        onAskAI={() => setAskAIOpen(true)}
        onStudyMode={openStudy}
      />

      <AskAIModal
        open={askAIOpen}
        onClose={() => setAskAIOpen(false)}
        note={activeNote}
        allNotes={state.notes}
        onOpenNoteByTitle={handleOpenNoteByTitle}
      />

      <AppDialog dialog={dialog} onClose={() => setDialog(null)} />

      {/* Toast */}
      {toast && (
        <div
          className="sb-fade-in"
          style={{
            position: 'fixed',
            bottom: 40,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bg3)',
            border: '1px solid var(--bd2)',
            borderRadius: 4,
            padding: '8px 14px',
            color: 'var(--t1)',
            fontSize: 11,
            fontFamily: 'inherit',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            zIndex: 200,
            pointerEvents: 'none',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
