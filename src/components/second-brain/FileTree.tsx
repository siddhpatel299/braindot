'use client';

import { useState, useMemo } from 'react';
import { FileText, Plus, FolderPlus, Folder as FolderIcon, ChevronRight, ChevronDown, Pin, Tag, Hash, X } from 'lucide-react';
import { Note, Folder } from '@/types';

interface FileTreeProps {
  notes: Note[];
  folders: Folder[];
  activeId: string;
  filter: string;
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
}

export function FileTree({
  notes,
  folders,
  activeId,
  filter,
  view,
  onViewChange,
  onSelect,
  onCreateNote,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onToggleFolder,
  onMoveNote,
  onTogglePinned,
}: FileTreeProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set(['all']));

  // ---------- Folder view ----------
  const folderTree = useMemo(() => {
    const byParent = new Map<string | null, Folder[]>();
    for (const f of folders) {
      const arr = byParent.get(f.parentId) || [];
      arr.push(f);
      byParent.set(f.parentId, arr);
    }
    // sort: PARA order first, then alphabetical
    const paraOrder: Record<string, number> = { projects: 0, areas: 1, resources: 2, archives: 3 };
    for (const arr of byParent.values()) {
      arr.sort((a, b) => {
        if (a.paraType && b.paraType) return paraOrder[a.paraType] - paraOrder[b.paraType];
        if (a.paraType) return -1;
        if (b.paraType) return 1;
        return a.name.localeCompare(b.name);
      });
    }
    return byParent;
  }, [folders]);

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

  // Filtered for search
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

  // ---------- Tag view ----------
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

  // ---------- Render helpers ----------
  const startRename = (folder: Folder) => {
    setRenamingId(folder.id);
    setRenameValue(folder.name);
  };

  const commitRename = () => {
    if (renamingId) {
      onRenameFolder(renamingId, renameValue.trim() || 'Untitled folder');
    }
    setRenamingId(null);
    setRenameValue('');
  };

  const renderNoteRow = (n: Note, depth: number) => {
    if (filteredNoteIds && !filteredNoteIds.has(n.id)) return null;
    const isActive = n.id === activeId;
    return (
      <div
        key={n.id}
        className="sb-note-row"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/note-id', n.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onClick={() => onSelect(n.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          onTogglePinned(n.id);
        }}
        style={{
          height: 26,
          paddingLeft: 12 + depth * 14,
          paddingRight: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: isActive ? 'var(--acc-bg)' : 'transparent',
          color: isActive ? 'var(--acc2)' : 'var(--t2)',
          borderLeft: isActive ? '2px solid var(--acc)' : '2px solid transparent',
          cursor: 'pointer',
          transition: 'background 0.1s, color 0.1s',
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'var(--bg2)';
            e.currentTarget.style.color = 'var(--t1)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--t2)';
          }
        }}
        title={`${n.title}\nRight-click to ${n.pinned ? 'unpin' : 'pin'}`}
      >
        {n.pinned ? (
          <Pin size={12} style={{ flexShrink: 0, opacity: 0.7, color: 'var(--amb)' }} />
        ) : (
          <FileText size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
        )}
        <span
          style={{
            fontSize: 13,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {n.title}
        </span>
        <span
          style={{
            fontSize: 10,
            background: 'var(--bg3)',
            color: 'var(--t3)',
            padding: '1px 6px',
            borderRadius: 3,
            minWidth: 18,
            textAlign: 'center',
          }}
        >
          {n.backlinks.length}
        </span>
      </div>
    );
  };

  const renderFolder = (folder: Folder, depth: number): React.ReactNode => {
    const childFolders = folderTree.get(folder.id) || [];
    const childNotes = (notesByFolder.get(folder.id) || []).filter((n) => {
      if (filteredNoteIds && !filteredNoteIds.has(n.id)) return false;
      return true;
    });

    // Filter-match propagation: if any descendant matches, show this folder expanded
    const hasMatchingDescendant = filteredNoteIds && (childNotes.length > 0 || childFolders.some((cf) => {
      const stack = [cf];
      while (stack.length) {
        const f = stack.pop()!;
        if ((notesByFolder.get(f.id) || []).some((n) => filteredNoteIds!.has(n.id))) return true;
        stack.push(...(folderTree.get(f.id) || []));
      }
      return false;
    }));

    const isExpanded = filteredNoteIds ? hasMatchingDescendant : folder.expanded !== false;
    const isDragOver = dragOverFolder === folder.id;

    // Hide folder entirely if filtering and no matches anywhere
    if (filteredNoteIds && !hasMatchingDescendant) return null;

    return (
      <div key={folder.id}>
        <div
          draggable
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('text/note-id')) {
              e.preventDefault();
              setDragOverFolder(folder.id);
            }
          }}
          onDragLeave={() => {
            setDragOverFolder((cur) => (cur === folder.id ? null : cur));
          }}
          onDrop={(e) => {
            e.preventDefault();
            const noteId = e.dataTransfer.getData('text/note-id');
            if (noteId) onMoveNote(noteId, folder.id);
            setDragOverFolder(null);
          }}
          style={{
            height: 26,
            paddingLeft: 6 + depth * 14,
            paddingRight: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: isDragOver ? 'var(--acc-bg)' : 'transparent',
            borderLeft: isDragOver ? '2px solid var(--acc)' : '2px solid transparent',
            cursor: 'pointer',
            userSelect: 'none',
          }}
          onClick={() => onToggleFolder(folder.id)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            startRename(folder);
          }}
          title={`${folder.name}\nDouble-click to rename · Drag note here to move`}
        >
          <span style={{ fontSize: 8, color: 'var(--t3)', width: 10, display: 'inline-flex', justifyContent: 'center' }}>
            {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </span>
          <FolderIcon
            size={11}
            style={{ flexShrink: 0, color: folder.paraType ? 'var(--acc2)' : 'var(--t3)' }}
            strokeWidth={1.5}
          />
          {renamingId === folder.id ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') {
                  setRenamingId(null);
                  setRenameValue('');
                }
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                flex: 1,
                background: 'var(--bg3)',
                border: '1px solid var(--acc)',
                color: 'var(--t1)',
                fontSize: 13,
                padding: '1px 5px',
                borderRadius: 2,
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          ) : (
            <span
              style={{
                fontSize: 13,
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: 'var(--t2)',
                fontWeight: folder.paraType ? 600 : 400,
                textTransform: folder.paraType ? 'uppercase' : 'none',
                letterSpacing: folder.paraType ? '0.04em' : '0',
              }}
            >
              {folder.name}
            </span>
          )}
          <span
            style={{
              fontSize: 10,
              color: 'var(--t3)',
              opacity: 0.6,
            }}
          >
            {childNotes.length + childFolders.length || ''}
          </span>
          {/* Hover actions */}
          <div style={{ display: 'flex', gap: 2, opacity: 0 }} className="sb-folder-actions">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCreateNote(folder.id);
              }}
              title="New note in folder"
              style={{
                width: 16, height: 16, borderRadius: 2, background: 'transparent',
                border: 'none', color: 'var(--t3)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
              }}
            >
              <Plus size={11} strokeWidth={2} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCreateFolder(folder.id);
              }}
              title="New subfolder"
              style={{
                width: 16, height: 16, borderRadius: 2, background: 'transparent',
                border: 'none', color: 'var(--t3)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
              }}
            >
              <FolderPlus size={11} strokeWidth={2} />
            </button>
            {!folder.paraType && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete folder "${folder.name}"? Notes inside will be moved to Resources.`)) {
                    onDeleteFolder(folder.id);
                  }
                }}
                title="Delete folder"
                style={{
                  width: 16, height: 16, borderRadius: 2, background: 'transparent',
                  border: 'none', color: 'var(--t3)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                }}
              >
                <X size={11} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
        {isExpanded && (
          <>
            {childFolders.map((cf) => renderFolder(cf, depth + 1))}
            {childNotes.map((n) => renderNoteRow(n, depth + 1))}
          </>
        )}
      </div>
    );
  };

  const rootFolders = folderTree.get(null) || [];

  // ---------- Tag view rendering ----------
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
      const visibleNotes = filteredNoteIds ? tagNotes.filter((n) => filteredNoteIds.has(n.id)) : tagNotes;
      if (filteredNoteIds && visibleNotes.length === 0) return null;
      const isExpanded = expandedTags.has(tag);
      return (
        <div key={tag} style={{ marginBottom: 2 }}>
          <button
            onClick={() => toggleTag(tag)}
            style={{
              width: '100%',
              padding: '6px 12px 4px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--t3)',
            }}
          >
            <span style={{ fontSize: 8, opacity: 0.7 }}>{isExpanded ? '▾' : '▸'}</span>
            {tag === 'untagged' ? (
              <Hash size={10} style={{ opacity: 0.6 }} />
            ) : (
              <Tag size={10} style={{ opacity: 0.7 }} />
            )}
            <span
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.09em',
                fontWeight: 600,
              }}
            >
              {tag}
            </span>
            <span style={{ fontSize: 11, color: 'var(--t3)', opacity: 0.6 }}>
              {tagNotes.length}
            </span>
          </button>
          {isExpanded && visibleNotes.map((n) => renderNoteRow(n, 1))}
        </div>
      );
    });
  };

  return (
    <div
      style={{
        width: 240,
        minWidth: 240,
        height: '100%',
        background: 'var(--bg1)',
        borderRight: '1px solid var(--bd)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 34,
          padding: '0 8px 0 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--bd)',
          gap: 4,
        }}
      >
        <div style={{ display: 'flex', gap: 2 }}>
          <button
            onClick={() => onViewChange('folders')}
            title="Folder view"
            style={{
              height: 22, padding: '0 8px', borderRadius: 3,
              background: view === 'folders' ? 'var(--bg3)' : 'transparent',
              border: '1px solid ' + (view === 'folders' ? 'var(--bd2)' : 'transparent'),
              color: view === 'folders' ? 'var(--t1)' : 'var(--t3)',
              fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              display: 'flex', alignItems: 'center', gap: 3,
            }}
          >
            <FolderIcon size={11} /> Folders
          </button>
          <button
            onClick={() => onViewChange('tags')}
            title="Tag view"
            style={{
              height: 22, padding: '0 8px', borderRadius: 3,
              background: view === 'tags' ? 'var(--bg3)' : 'transparent',
              border: '1px solid ' + (view === 'tags' ? 'var(--bd2)' : 'transparent'),
              color: view === 'tags' ? 'var(--t1)' : 'var(--t3)',
              fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              display: 'flex', alignItems: 'center', gap: 3,
            }}
          >
            <Tag size={11} /> Tags
          </button>
        </div>
        <button
          onClick={() => onCreateFolder(null)}
          title="New top-level folder"
          style={{
            width: 22, height: 22, borderRadius: 3,
            background: 'transparent', border: 'none',
            color: 'var(--t2)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--t1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--t2)'; }}
        >
          <FolderPlus size={13} strokeWidth={2} />
        </button>
      </div>

      {/* List */}
      <div className="sb-scroll" style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {view === 'folders' ? (
          <>
            {/* Pinned section */}
            {pinnedNotes.length > 0 && !filteredNoteIds && (
              <div style={{ marginBottom: 4 }}>
                <div
                  style={{
                    padding: '6px 12px 4px',
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.09em',
                    color: 'var(--t3)',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Pin size={9} style={{ opacity: 0.7 }} />
                  Pinned
                  <span style={{ opacity: 0.6 }}>{pinnedNotes.length}</span>
                </div>
                {pinnedNotes.map((n) => renderNoteRow(n, 0))}
              </div>
            )}

            {/* Folder tree */}
            {rootFolders.map((f) => renderFolder(f, 0))}

            {filteredNoteIds && filteredNoteIds.size === 0 && (
              <div
                style={{
                  padding: '20px 12px',
                  fontSize: 10,
                  color: 'var(--t3)',
                  textAlign: 'center',
                  lineHeight: 1.6,
                }}
              >
                no notes match
                <br />
                "{filter}"
              </div>
            )}
          </>
        ) : (
          renderTagView()
        )}
      </div>

      {/* Drag hint footer */}
      <div
        style={{
          padding: '6px 12px',
          borderTop: '1px solid var(--bd)',
          fontSize: 8,
          color: 'var(--t3)',
          fontStyle: 'italic',
          lineHeight: 1.4,
        }}
      >
        drag notes between folders · double-click folder to rename · right-click note to pin
      </div>

      {/* Inline style for hover-show actions */}
      <style>{`
        .sb-folder-actions { opacity: 0 !important; transition: opacity 0.1s; }
        div:hover > .sb-folder-actions { opacity: 0.8 !important; }
        div:hover > .sb-folder-actions button:hover { opacity: 1; background: var(--bg3); }
      `}</style>
    </div>
  );
}
