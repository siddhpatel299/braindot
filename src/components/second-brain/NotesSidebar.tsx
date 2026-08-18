'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Folder as FolderIcon, FolderPlus, Plus, Tag, Hash, X, Search,
  Menu, ChevronLeft, LayoutGrid,
} from 'lucide-react';
import { Note, Folder } from '@/types';
import { plural } from '@/utils/markdown';
import { NoteRow, FolderRow, SectionHeader, DrillRow } from './SidebarRows';
import { NotebookShelf } from './NotebookShelf';

export interface NotesSidebarProps {
  notes: Note[];
  folders: Folder[];
  activeId: string;
  filter: string;
  onFilterChange: (value: string) => void;
  view: 'folders' | 'tags';
  onViewChange: (v: 'folders' | 'tags') => void;
  onSelect: (id: string) => void;
  onCreateNote: (folderId: string) => void;
  onCreateFolder: (parentId: string | null) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onToggleFolder: (id: string) => void;
  onMoveNote: (noteId: string, folderId: string) => void;
  onTogglePinned: (noteId: string) => void;
  onDeleteNote: (noteId: string) => void;
}

const PARA_ORDER: Record<string, number> = { projects: 0, areas: 1, resources: 2, archives: 3 };

export type SidebarDisplay = 'notebooks' | 'folders';
const DISPLAY_KEY = 'sb-sidebar-display';

/**
 * One hue per notebook, from tokens already in globals.css.
 *
 * They appear only as a 3px spine edge, a 3px cover band, an 8.5px kicker and
 * a 3px header chip — never as a fill or as a colour for content.
 */
const PARA_COLOR: Record<string, string> = {
  projects: 'var(--acc)',
  areas: 'var(--amb)',
  resources: 'var(--grn)',
  archives: 'var(--t3)',
};
/** A notebook the user made takes the next hue, then the sequence repeats. */
const EXTRA_COLORS = ['var(--blu)', 'var(--coral)', 'var(--acc)', 'var(--grn)'];

/**
 * The notes sidebar.
 *
 * One vault, and the tree it holds is the same whichever way it is drawn —
 * nothing here moves, re-parents or reorganises anything.
 */
export function NotesSidebar({
  notes, folders, activeId, filter, onFilterChange, view, onViewChange,
  onSelect, onCreateNote, onCreateFolder, onRenameFolder, onDeleteFolder,
  onToggleFolder, onMoveNote, onTogglePinned, onDeleteNote,
}: NotesSidebarProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set(['all']));

  // ---------- Shared projections of the vault ----------

  /** Children by parent, PARA order first and then alphabetical. */
  const folderTree = useMemo(() => {
    const byParent = new Map<string | null, Folder[]>();
    for (const f of folders) {
      const arr = byParent.get(f.parentId) || [];
      arr.push(f);
      byParent.set(f.parentId, arr);
    }
    for (const arr of byParent.values()) {
      arr.sort((a, b) => {
        if (a.paraType && b.paraType) return PARA_ORDER[a.paraType] - PARA_ORDER[b.paraType];
        if (a.paraType) return -1;
        if (b.paraType) return 1;
        return a.name.localeCompare(b.name);
      });
    }
    return byParent;
  }, [folders]);

  /** Notes by folder, evergreen first and then most recently touched. */
  const notesByFolder = useMemo(() => {
    const m = new Map<string, Note[]>();
    for (const n of notes) {
      const arr = m.get(n.folderId) || [];
      arr.push(n);
      m.set(n.folderId, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'evergreen' ? -1 : 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    }
    return m;
  }, [notes]);

  const pinnedNotes = useMemo(() => notes.filter((n) => n.pinned), [notes]);

  /** null while the filter is empty; otherwise the ids that match it. */
  const filteredNoteIds = useMemo(() => {
    if (!filter.trim()) return null;
    const f = filter.toLowerCase();
    const ids = new Set<string>();
    for (const n of notes) {
      if (
        n.title.toLowerCase().includes(f) ||
        n.filename.toLowerCase().includes(f) ||
        n.tags.some((t) => t.toLowerCase().includes(f))
      ) {
        ids.add(n.id);
      }
    }
    return ids;
  }, [notes, filter]);

  const tagGroups = useMemo(() => {
    const m = new Map<string, Note[]>();
    for (const n of notes) {
      if (n.tags.length === 0) {
        const arr = m.get('untagged') || [];
        arr.push(n);
        m.set('untagged', arr);
      } else {
        for (const t of n.tags) {
          const arr = m.get(t) || [];
          arr.push(n);
          m.set(t, arr);
        }
      }
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [notes]);

  /** Does anything under this folder survive the filter? */
  const hasMatchInSubtree = useCallback((folder: Folder): boolean => {
    if (!filteredNoteIds) return true;
    const stack: Folder[] = [folder];
    while (stack.length) {
      const f = stack.pop()!;
      if ((notesByFolder.get(f.id) || []).some((n) => filteredNoteIds.has(n.id))) return true;
      stack.push(...(folderTree.get(f.id) || []));
    }
    return false;
  }, [filteredNoteIds, notesByFolder, folderTree]);

  // ---------- Notebooks ----------
  // A notebook is a root folder, a section is its direct child, and depth
  // below that is reached by drilling. No schema change: the only thing stored
  // is which of the two ways the user wants their notes drawn.
  const [display, setDisplay] = useState<SidebarDisplay>('notebooks');
  const [notebookId, setNotebookId] = useState<string | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);

  // Read the stored preference after mount, so the server render and the
  // stored value cannot disagree.
  useEffect(() => {
    const saved = localStorage.getItem(DISPLAY_KEY);
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    if (saved === 'notebooks' || saved === 'folders') setDisplay(saved);
  }, []);

  const chooseDisplay = useCallback((next: SidebarDisplay) => {
    setDisplay(next);
    setPath([]);
    setViewMenuOpen(false);
    try { localStorage.setItem(DISPLAY_KEY, next); } catch {}
  }, []);

  // Escape closes whichever overlay is open.
  useEffect(() => {
    if (!viewMenuOpen && !shelfOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setViewMenuOpen(false);
      setShelfOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewMenuOpen, shelfOpen]);

  const rootFolders = useMemo(() => folderTree.get(null) || [], [folderTree]);

  /** Every note beneath a folder, however deep — for a notebook's own count. */
  const countNotesUnder = useCallback((folderId: string): number => {
    let total = 0;
    const stack = [folderId];
    while (stack.length) {
      const id = stack.pop()!;
      total += (notesByFolder.get(id) || []).length;
      for (const child of folderTree.get(id) || []) stack.push(child.id);
    }
    return total;
  }, [notesByFolder, folderTree]);

  const notebooks = useMemo(() => rootFolders.map((folder, i) => ({
    folder,
    color: folder.paraType
      ? PARA_COLOR[folder.paraType]
      : EXTRA_COLORS[i % EXTRA_COLORS.length],
    noteCount: countNotesUnder(folder.id),
  })), [rootFolders, countNotesUnder]);

  /** null means "the first notebook in PARA order". */
  const currentNotebook = useMemo(
    () => notebooks.find((b) => b.folder.id === notebookId) ?? notebooks[0] ?? null,
    [notebooks, notebookId],
  );

  /** Walk the drill path, stopping early if a folder on it has gone away. */
  const currentNode = useMemo(() => {
    if (!currentNotebook) return null;
    let node = currentNotebook.folder;
    for (const id of path) {
      const next = (folderTree.get(node.id) || []).find((f) => f.id === id);
      if (!next) break;
      node = next;
    }
    return node;
  }, [currentNotebook, path, folderTree]);

  const openNotebook = useCallback((id: string) => {
    setNotebookId(id);
    setPath([]);
    setShelfOpen(false);
  }, []);

  // ---------- Renaming ----------
  const startRename = (folder: Folder) => {
    setRenamingId(folder.id);
    setRenameValue(folder.name);
  };
  const commitRename = () => {
    if (renamingId) onRenameFolder(renamingId, renameValue.trim() || 'Untitled folder');
    setRenamingId(null);
    setRenameValue('');
  };
  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  /** The drop handlers every folder-shaped target shares. */
  const dropTarget = (folderId: string) => ({
    isDragOver: dragOverFolder === folderId,
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes('text/note-id')) {
        e.preventDefault();
        setDragOverFolder(folderId);
      }
    },
    onDragLeave: () => setDragOverFolder((cur) => (cur === folderId ? null : cur)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const noteId = e.dataTransfer.getData('text/note-id');
      if (noteId) onMoveNote(noteId, folderId);
      setDragOverFolder(null);
    },
  });

  const noteRow = (n: Note, depth: number) => {
    if (filteredNoteIds && !filteredNoteIds.has(n.id)) return null;
    return (
      <NoteRow
        key={n.id}
        note={n}
        depth={depth}
        active={n.id === activeId}
        onSelect={onSelect}
        onTogglePinned={onTogglePinned}
        onDelete={onDeleteNote}
      />
    );
  };

  // ---------- Folders view ----------
  const renderFolder = (folder: Folder, depth: number): React.ReactNode => {
    const childFolders = folderTree.get(folder.id) || [];
    const childNotes = (notesByFolder.get(folder.id) || [])
      .filter((n) => !filteredNoteIds || filteredNoteIds.has(n.id));

    // While filtering, a folder shows itself only if something under it
    // matched — and shows itself open, so the match is not hidden behind a
    // collapsed parent.
    const matches = filteredNoteIds ? hasMatchInSubtree(folder) : true;
    if (!matches) return null;
    const expanded = filteredNoteIds ? true : folder.expanded !== false;

    return (
      <div key={folder.id}>
        <FolderRow
          folder={folder}
          depth={depth}
          expanded={expanded}
          childCount={childNotes.length + childFolders.length}
          renaming={renamingId === folder.id}
          renameValue={renameValue}
          onRenameChange={setRenameValue}
          onRenameCommit={commitRename}
          onRenameCancel={cancelRename}
          onStartRename={() => startRename(folder)}
          onToggle={() => onToggleFolder(folder.id)}
          onCreateNote={() => onCreateNote(folder.id)}
          onCreateFolder={() => onCreateFolder(folder.id)}
          onDelete={() => onDeleteFolder(folder.id)}
          {...dropTarget(folder.id)}
        />
        {expanded && (
          <>
            {childFolders.map((cf) => renderFolder(cf, depth + 1))}
            {childNotes.map((n) => noteRow(n, depth + 1))}
          </>
        )}
      </div>
    );
  };

  // ---------- Tag view ----------
  const toggleTag = (tag: string) => {
    setExpandedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const renderTagView = () => {
    if (tagGroups.length === 0) {
      return (
        <div style={{ padding: '20px 12px', fontSize: 10, color: 'var(--t3)', textAlign: 'center' }}>
          no tags yet
        </div>
      );
    }
    return tagGroups.map(([tag, tagNotes]) => {
      const visible = filteredNoteIds ? tagNotes.filter((n) => filteredNoteIds.has(n.id)) : tagNotes;
      if (filteredNoteIds && visible.length === 0) return null;
      const expanded = expandedTags.has(tag);
      return (
        <div key={tag} style={{ marginBottom: 2 }}>
          <button
            onClick={() => toggleTag(tag)}
            aria-expanded={expanded}
            style={{
              width: '100%', padding: '6px 12px 4px', background: 'transparent',
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
              gap: 6, color: 'var(--t3)', fontFamily: 'inherit',
            }}
          >
            <span style={{ fontSize: 8, opacity: 0.7 }}>{expanded ? '▾' : '▸'}</span>
            {tag === 'untagged'
              ? <Hash size={10} style={{ opacity: 0.6 }} />
              : <Tag size={10} style={{ opacity: 0.7 }} />}
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 600 }}>
              {tag}
            </span>
            <span style={{ fontSize: 11, color: 'var(--t3)', opacity: 0.6 }}>{tagNotes.length}</span>
          </button>
          {expanded && visible.map((n) => noteRow(n, 1))}
        </div>
      );
    });
  };

  // ---------- Notebooks view ----------
  /**
   * The current node's contents, grouped the way the panel prints them: notes
   * filed here first with no label, then one block per child folder.
   */
  const notebookContents = useMemo(() => {
    if (!currentNode) return { loose: [] as Note[], sections: [] as { folder: Folder; notes: Note[]; deeper: Folder[] }[] };
    const keep = (n: Note) => !filteredNoteIds || filteredNoteIds.has(n.id);
    return {
      loose: (notesByFolder.get(currentNode.id) || []).filter(keep),
      sections: (folderTree.get(currentNode.id) || []).map((folder) => ({
        folder,
        notes: (notesByFolder.get(folder.id) || []).filter(keep),
        deeper: folderTree.get(folder.id) || [],
      })),
    };
  }, [currentNode, notesByFolder, folderTree, filteredNoteIds]);

  const notebooksBody = () => {
    if (!currentNode || !currentNotebook) return null;
    const atRoot = path.length === 0;
    const { loose, sections } = notebookContents;
    // While filtering, a section with nothing left in it and nothing deeper
    // has no reason to take a line.
    const visibleSections = sections.filter(
      (s) => !filteredNoteIds || s.notes.length > 0 || s.deeper.some(hasMatchInSubtree),
    );
    const nothingHere = loose.length === 0 && visibleSections.length === 0;

    return (
      <>
        {pinnedNotes.length > 0 && atRoot && !filteredNoteIds && (
          <div style={{ marginBottom: 4 }}>
            <PinnedHeader count={pinnedNotes.length} />
            {pinnedNotes.map((n) => noteRow(n, 0))}
          </div>
        )}

        {loose.map((n) => noteRow(n, 0))}

        {visibleSections.map(({ folder, notes: sectionNotes, deeper }) => (
          <div key={folder.id}>
            <SectionHeader
              name={folder.name}
              count={sectionNotes.length + deeper.length}
              {...dropTarget(folder.id)}
              onCreateNote={() => onCreateNote(folder.id)}
              onCreateFolder={() => onCreateFolder(folder.id)}
              onDelete={() => onDeleteFolder(folder.id)}
              renaming={renamingId === folder.id}
              renameValue={renameValue}
              onRenameChange={setRenameValue}
              onRenameCommit={commitRename}
              onRenameCancel={cancelRename}
              onRenameStart={() => startRename(folder)}
            />
            {sectionNotes.map((n) => noteRow(n, 0))}
            {deeper.length > 0 && (
              <DrillRow
                folders={deeper}
                noteCount={countNotesUnder(deeper[0].id)}
                onDrill={() => setPath((p) => [...p, folder.id])}
              />
            )}
          </div>
        ))}

        {nothingHere && !filteredNoteIds && (
          <div style={{ padding: '20px 12px', fontSize: 11, lineHeight: 1.7, color: 'var(--t3)', textWrap: 'pretty' }}>
            Nothing in {currentNode.name} yet. Press ⌘T to start the first note.
          </div>
        )}
        {nothingHere && filteredNoteIds && (
          <div style={{ padding: '20px 12px', fontSize: 11, lineHeight: 1.7, color: 'var(--t3)', textWrap: 'pretty' }}>
            Nothing in {currentNode.name} matches &ldquo;{filter}&rdquo;.
            {filteredNoteIds.size > 0 && ' It may be in another notebook — switch to Folders to search the whole vault.'}
          </div>
        )}
      </>
    );
  };

  const notebooksMode = display === 'notebooks';
  /* Tags are a peer of "a notebook", not a peer of "how the list is drawn":
     they are another way to pick up a stack of notes. So in Notebooks view
     they sit at the foot of the spine rail rather than being reachable only
     by switching back to Folders. */
  const tagsMode = notebooksMode && view === 'tags';
  /** The panel's subject line: the notebook at root, the folder once drilled. */
  const headName = currentNode?.name ?? '';
  const headCount = currentNode
    ? (notesByFolder.get(currentNode.id) || []).length + (folderTree.get(currentNode.id) || []).length
    : 0;
  const parentName = path.length > 1
    ? folders.find((f) => f.id === path[path.length - 2])?.name
    : currentNotebook?.folder.name;

  return (
    <div style={{ display: 'flex', height: '100%', flexShrink: 0, position: 'relative' }}>
      {/* The spines. Additive chrome — the panel keeps its full 240px, so note
          titles have exactly the measure they had before. */}
      {notebooksMode && (
        <div
          className="sb-scroll"
          style={{
            width: 48, minWidth: 48, height: '100%', background: 'var(--bg)',
            borderRight: '1px solid var(--bd)', display: 'flex', flexDirection: 'column',
            alignItems: 'center', padding: '8px 0 10px', gap: 5, overflowY: 'auto', flexShrink: 0,
          }}
        >
          {notebooks.map(({ folder, color, noteCount }) => {
            const active = folder.id === currentNotebook?.folder.id && !tagsMode;
            return (
              <button
                key={folder.id}
                onClick={() => { onViewChange('folders'); openNotebook(folder.id); }}
                title={`${folder.name} — ${plural(noteCount, 'note')}`}
                aria-current={active && !tagsMode ? 'true' : undefined}
                style={{
                  width: 36, height: 116, borderRadius: '2px 5px 5px 2px', border: 'none',
                  borderLeft: `3px solid ${color}`,
                  background: active ? 'var(--bg1)' : 'transparent',
                  color: active ? 'var(--t1)' : 'var(--t3)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', padding: 0, flexShrink: 0,
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--bg2)'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{
                  writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 9.5,
                  letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600,
                  fontFamily: 'inherit', whiteSpace: 'nowrap',
                  // A notebook the user names at length ellipsises here and
                  // keeps its full name in the tooltip; the PARA four all set
                  // in full at this size.
                  overflow: 'hidden', textOverflow: 'ellipsis', maxHeight: 100,
                }}>
                  {folder.name}
                </span>
              </button>
            );
          })}
          <span style={{ width: 20, height: 1, background: 'var(--bd)', margin: '4px 0', flexShrink: 0 }} />
          <button
            onClick={() => onViewChange('tags')}
            title={`Tags — ${plural(tagGroups.length, 'tag')}`}
            aria-label="Tags"
            aria-current={tagsMode ? 'true' : undefined}
            style={{
              width: 36, height: 34, borderRadius: 4,
              background: tagsMode ? 'var(--bg1)' : 'transparent',
              border: 'none', borderLeft: `3px solid ${tagsMode ? 'var(--acc)' : 'transparent'}`,
              color: tagsMode ? 'var(--acc2)' : 'var(--t3)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, flexShrink: 0,
            }}
            onMouseEnter={(e) => { if (!tagsMode) { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--t1)'; } }}
            onMouseLeave={(e) => { if (!tagsMode) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--t3)'; } }}
          >
            <Tag size={14} strokeWidth={1.9} />
          </button>
          <button
            onClick={() => setShelfOpen(true)}
            title="All notebooks"
            aria-label="All notebooks"
            style={{
              width: 36, height: 26, borderRadius: 4, background: 'transparent',
              border: '1px dashed var(--bd2)', color: 'var(--t3)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, marginTop: 3, flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--acc2)'; e.currentTarget.style.borderColor = 'var(--acc-bd)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t3)'; e.currentTarget.style.borderColor = 'var(--bd2)'; }}
          >
            <LayoutGrid size={13} strokeWidth={1.9} />
          </button>
        </div>
      )}

      <div
        style={{
          width: 240, minWidth: 240, height: '100%',
          background: 'var(--bg1)', borderRight: '1px solid var(--bd)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            height: 34, padding: '0 8px 0 10px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', borderBottom: '1px solid var(--bd)', gap: 4,
          }}
        >
          {tagsMode ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <Tag size={11} strokeWidth={2} style={{ color: 'var(--acc2)', flexShrink: 0 }} />
              <span style={{
                fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                Tags
              </span>
              <span style={{ fontSize: 10, color: 'var(--t3)', opacity: 0.6, flexShrink: 0 }}>
                {tagGroups.length || ''}
              </span>
            </div>
          ) : notebooksMode ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              {path.length > 0 && (
                <button
                  onClick={() => setPath((p) => p.slice(0, -1))}
                  title={`Back to ${parentName ?? 'the notebook'}`}
                  aria-label={`Back to ${parentName ?? 'the notebook'}`}
                  style={{
                    width: 20, height: 20, borderRadius: 3, background: 'transparent', border: 'none',
                    color: 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', padding: 0, flexShrink: 0,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--t1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--t2)'; }}
                >
                  <ChevronLeft size={14} strokeWidth={2} />
                </button>
              )}
              <span style={{
                width: 3, height: 13, borderRadius: 1, flexShrink: 0,
                background: currentNotebook?.color ?? 'var(--bd2)',
              }} />
              <span style={{
                fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {headName}
              </span>
              <span style={{ fontSize: 10, color: 'var(--t3)', opacity: 0.6, flexShrink: 0 }}>
                {headCount || ''}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 2 }}>
              <ViewTab icon={FolderIcon} label="Folders" active={view === 'folders'} onClick={() => onViewChange('folders')} title="Folder view" />
              <ViewTab icon={Tag} label="Tags" active={view === 'tags'} onClick={() => onViewChange('tags')} title="Tag view" />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            {/* A note in whatever the panel is currently showing. Without it
                the only way into a freshly made section was to write the note
                elsewhere and drag it across. */}
            {notebooksMode && currentNode && !tagsMode && (
              <HeaderButton
                label={`New note in ${currentNode.name}`}
                onClick={() => onCreateNote(currentNode.id)}
              >
                <Plus size={13} strokeWidth={2} />
              </HeaderButton>
            )}
            {!tagsMode && (
              <HeaderButton
                label={notebooksMode ? 'New section' : 'New top-level folder'}
                onClick={() => onCreateFolder(notebooksMode ? (currentNode?.id ?? null) : null)}
              >
                <FolderPlus size={13} strokeWidth={2} />
              </HeaderButton>
            )}
            <HeaderButton
              label="How this list looks"
              active={viewMenuOpen}
              expanded={viewMenuOpen}
              onClick={() => setViewMenuOpen((o) => !o)}
            >
              <Menu size={13} strokeWidth={1.9} />
            </HeaderButton>
          </div>
        </div>

        {/* Filter. This narrows the tree below it, so it belongs on the tree —
            not stretched across the top of the whole app, where it read as a
            global search it never was. Searching everything is ⌘K. */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 7, height: 30,
            margin: '6px 8px 2px', padding: '0 8px', borderRadius: 4,
            background: 'var(--bg2)', flexShrink: 0,
            border: '1px solid ' + (filter ? 'var(--acc-bd)' : 'var(--bd)'),
          }}
        >
          <Search size={12} color="var(--t3)" strokeWidth={2} style={{ flexShrink: 0 }} />
          <input
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') onFilterChange(''); }}
            placeholder="Filter these notes"
            aria-label="Filter notes by name"
            style={{
              flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--t1)', fontSize: 11.5, fontFamily: 'inherit', caretColor: 'var(--acc2)',
            }}
          />
          {filter && (
            <button
              onClick={() => onFilterChange('')}
              title="Clear filter"
              aria-label="Clear filter"
              style={{
                width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                background: 'transparent', border: 'none', color: 'var(--t3)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--t1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t3)'; }}
            >
              <X size={11} strokeWidth={2.25} />
            </button>
          )}
        </div>

        {/* List */}
        <div className="sb-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 0' }}>
          {tagsMode ? renderTagView() : notebooksMode ? notebooksBody() : view === 'folders' ? (
            <>
              {pinnedNotes.length > 0 && !filteredNoteIds && (
                <div style={{ marginBottom: 4 }}>
                  <PinnedHeader count={pinnedNotes.length} />
                  {pinnedNotes.map((n) => noteRow(n, 0))}
                </div>
              )}
              {rootFolders.map((f) => renderFolder(f, 0))}
              {filteredNoteIds && filteredNoteIds.size === 0 && (
                <div style={{ padding: '20px 12px', fontSize: 10, color: 'var(--t3)', textAlign: 'center', lineHeight: 1.6 }}>
                  no notes match
                  <br />
                  &ldquo;{filter}&rdquo;
                </div>
              )}
            </>
          ) : (
            renderTagView()
          )}
        </div>

        <Footer
          text={tagsMode
            ? 'a note appears under each of its tags · right-click note to pin'
            : notebooksMode
              ? 'drag notes between sections · right-click note to pin'
              : 'drag notes between folders · double-click folder to rename · right-click note to pin'}
        />
      </div>

      {/* How this list looks */}
      {viewMenuOpen && (
        <>
          <div onClick={() => setViewMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div
            role="menu"
            aria-label="Show my notes as"
            style={{
              position: 'absolute', top: 36, right: 6, zIndex: 60, width: 212,
              background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 6,
              boxShadow: '0 10px 28px rgba(0,0,0,0.38)', padding: 4,
            }}
          >
            <div style={{
              fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em',
              color: 'var(--t3)', fontWeight: 600, padding: '6px 8px',
            }}>
              Show my notes as
            </div>
            {([
              { id: 'notebooks' as const, label: 'Notebooks', hint: 'One notebook at a time. Long names stay whole.' },
              { id: 'folders' as const, label: 'Folders', hint: 'The whole tree at once, nested as deep as you file.' },
            ]).map((opt) => {
              const on = display === opt.id;
              return (
                <button
                  key={opt.id}
                  role="menuitemradio"
                  aria-checked={on}
                  onClick={() => chooseDisplay(opt.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '7px 8px', borderRadius: 4,
                    background: on ? 'var(--acc-bg)' : 'transparent',
                    border: '1px solid ' + (on ? 'var(--acc-bd)' : 'transparent'),
                    color: 'var(--t1)', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'var(--bg3)'; }}
                  onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ width: 12, flexShrink: 0, color: 'var(--acc2)', fontSize: 11, paddingTop: 1 }}>
                    {on ? '✓' : ''}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600 }}>{opt.label}</span>
                    <span style={{ display: 'block', fontSize: 10, lineHeight: 1.5, color: 'var(--t3)', marginTop: 2, textWrap: 'pretty' }}>
                      {opt.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {shelfOpen && (
        <NotebookShelf
          notebooks={notebooks}
          currentId={currentNotebook?.folder.id ?? null}
          onOpen={openNotebook}
          onCreate={() => { setShelfOpen(false); onCreateFolder(null); }}
          onClose={() => setShelfOpen(false)}
        />
      )}
    </div>
  );
}

function ViewTab({ icon: Icon, label, active, onClick, title }: {
  icon: React.ComponentType<{ size?: number }>;
  label: string; active: boolean; onClick: () => void; title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      style={{
        height: 22, padding: '0 8px', borderRadius: 3,
        background: active ? 'var(--bg3)' : 'transparent',
        border: '1px solid ' + (active ? 'var(--bd2)' : 'transparent'),
        color: active ? 'var(--t1)' : 'var(--t3)',
        fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
        textTransform: 'uppercase', letterSpacing: '0.06em',
        display: 'flex', alignItems: 'center', gap: 3,
      }}
    >
      <Icon size={11} /> {label}
    </button>
  );
}

export function HeaderButton({ label, onClick, active, expanded, children }: {
  label: string; onClick: () => void; active?: boolean; expanded?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-haspopup={expanded === undefined ? undefined : 'menu'}
      aria-expanded={expanded}
      style={{
        width: 22, height: 22, borderRadius: 3, flexShrink: 0,
        background: active ? 'var(--bg2)' : 'transparent', border: 'none',
        color: active ? 'var(--t1)' : 'var(--t2)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--t1)'; }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = active ? 'var(--bg2)' : 'transparent';
        e.currentTarget.style.color = active ? 'var(--t1)' : 'var(--t2)';
      }}
    >
      {children}
    </button>
  );
}

export function PinnedHeader({ count }: { count: number }) {
  return (
    <div
      style={{
        padding: '6px 12px 4px', fontSize: 11, textTransform: 'uppercase',
        letterSpacing: '0.09em', color: 'var(--t3)', fontWeight: 600,
        display: 'flex', alignItems: 'center', gap: 4,
      }}
    >
      <PinGlyph />
      Pinned
      <span style={{ opacity: 0.6 }}>{count}</span>
    </div>
  );
}

function PinGlyph() {
  return (
    <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }} aria-hidden="true">
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </svg>
  );
}

export function Footer({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: '6px 12px', borderTop: '1px solid var(--bd)', flexShrink: 0,
        // 9px, not the 8px this replaced: 8px italic is below what the rest of
        // the app asks anyone to read.
        fontSize: 9, color: 'var(--t3)', fontStyle: 'italic', lineHeight: 1.5,
      }}
    >
      {text}
    </div>
  );
}
