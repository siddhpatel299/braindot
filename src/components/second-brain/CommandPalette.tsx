'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, FileText, Plus, Share2, Download, Hash, CornerDownLeft, ArrowUp, ArrowDown, X, FolderPlus, Sparkles } from 'lucide-react';
import { Note, Folder } from '@/types';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  notes: Note[];
  folders: Folder[];
  onOpenNote: (id: string) => void;
  onCreateNote: () => void;
  onOpenGraph: () => void;
  onExport: () => void;
  onCreateFolder: () => void;
  onAskAI: () => void;
  onStudyMode: () => void;
}

interface CommandItem {
  id: string;
  type: 'note' | 'command' | 'folder';
  label: string;
  hint?: string;
  icon: 'note' | 'new' | 'graph' | 'export' | 'folder-new' | 'ai' | 'folder';
  action: () => void;
}

export function CommandPalette({
  open,
  onClose,
  notes,
  folders,
  onOpenNote,
  onCreateNote,
  onOpenGraph,
  onExport,
  onCreateFolder,
  onAskAI,
  onStudyMode,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery('');
      setSelected(0);
      // focus after render
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  const items: CommandItem[] = useMemo(() => {
    const cmds: CommandItem[] = [
      {
        id: 'cmd-dashboard',
        type: 'command',
        label: 'Go to dashboard',
        hint: 'open the home screen',
        icon: 'new',
        action: () => {
          window.dispatchEvent(new CustomEvent('sb-go-dashboard'));
          onClose();
        },
      },
      {
        id: 'cmd-new',
        type: 'command',
        label: 'New note',
        hint: 'create blank note · ⌘T',
        icon: 'new',
        action: () => {
          onCreateNote();
          onClose();
        },
      },
      {
        id: 'cmd-folder',
        type: 'command',
        label: 'New folder',
        hint: 'create a new top-level folder',
        icon: 'folder-new',
        action: () => {
          onCreateFolder();
          onClose();
        },
      },
      {
        id: 'cmd-journal',
        type: 'command',
        label: 'Daily journal',
        hint: "open or create today's journal · ⌘J",
        icon: 'new',
        action: () => {
          // Reuse the journal handler via a custom event
          window.dispatchEvent(new CustomEvent('sb-create-journal'));
          onClose();
        },
      },
      {
        id: 'cmd-ai',
        type: 'command',
        label: 'Ask AI about this note',
        hint: 'open the AI chat modal',
        icon: 'ai',
        action: () => {
          onAskAI();
          onClose();
        },
      },
      {
        id: 'cmd-study',
        type: 'command',
        label: 'Study this note',
        hint: 'open study mode for the current note',
        icon: 'ai',
        action: () => {
          onStudyMode();
          onClose();
        },
      },
      {
        id: 'cmd-graph',
        type: 'command',
        label: 'Open graph view',
        hint: 'network of all notes',
        icon: 'graph',
        action: () => {
          onOpenGraph();
          onClose();
        },
      },
      {
        id: 'cmd-export',
        type: 'command',
        label: 'Export current note',
        hint: 'download as .md',
        icon: 'export',
        action: () => {
          onExport();
          onClose();
        },
      },
    ];

    const noteItems: CommandItem[] = notes.map((n) => ({
      id: `note-${n.id}`,
      type: 'note',
      label: n.title,
      hint: n.filename,
      icon: 'note',
      action: () => {
        onOpenNote(n.id);
        onClose();
      },
    }));

    return [...cmds, ...noteItems];
  }, [notes, onCreateNote, onOpenGraph, onExport, onOpenNote, onClose, onCreateFolder, onAskAI, onStudyMode]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (it) =>
        it.label.toLowerCase().includes(q) ||
        (it.hint?.toLowerCase().includes(q) ?? false),
    );
  }, [items, query]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const child = list.children[selected] as HTMLElement | undefined;
    if (child) {
      child.scrollIntoView({ block: 'nearest' });
    }
  }, [selected]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = filtered[selected];
      if (it) it.action();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(2px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        className="sb-fade-in"
        style={{
          width: 560,
          maxWidth: '90vw',
          maxHeight: '60vh',
          background: 'var(--bg2)',
          border: '1px solid var(--bd2)',
          borderRadius: 8,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(124,110,247,0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 14px',
            borderBottom: '1px solid var(--bd)',
          }}
        >
          <Search size={14} color="var(--t3)" strokeWidth={1.75} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search notes or run a command…"
            spellCheck={false}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--t1)',
              fontSize: 13,
              fontFamily: 'inherit',
              caretColor: 'var(--acc2)',
            }}
          />
          <button
            onClick={onClose}
            title="Close (Esc)"
            style={{
              width: 18,
              height: 18,
              borderRadius: 3,
              background: 'transparent',
              border: 'none',
              color: 'var(--t3)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={12} />
          </button>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          className="sb-scroll"
          style={{ overflowY: 'auto', padding: 4, maxHeight: 400 }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                padding: '24px 14px',
                fontSize: 11,
                color: 'var(--t3)',
                textAlign: 'center',
                fontStyle: 'italic',
              }}
            >
              no matches for "{query}"
            </div>
          ) : (
            filtered.map((it, i) => {
              const isSelected = i === selected;
              const Icon =
                it.icon === 'note' ? FileText :
                it.icon === 'new' ? Plus :
                it.icon === 'graph' ? Share2 :
                it.icon === 'folder-new' ? FolderPlus :
                it.icon === 'ai' ? Sparkles :
                it.icon === 'folder' ? FileText :
                Download;
              return (
                <div
                  key={it.id}
                  onMouseEnter={() => setSelected(i)}
                  onClick={it.action}
                  style={{
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: isSelected ? 'var(--acc-bg)' : 'transparent',
                    border: isSelected ? '1px solid #3d378a' : '1px solid transparent',
                    borderRadius: 4,
                    cursor: 'pointer',
                    color: isSelected ? 'var(--t1)' : 'var(--t2)',
                  }}
                >
                  <Icon size={13} strokeWidth={1.75} style={{ flexShrink: 0, opacity: 0.8 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        color: isSelected ? 'var(--t1)' : 'var(--t2)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {it.label}
                    </div>
                    {it.hint && (
                      <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 1 }}>
                        {it.hint}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 8,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: 'var(--t3)',
                      padding: '1px 5px',
                      background: 'var(--bg3)',
                      borderRadius: 2,
                    }}
                  >
                    {it.type}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: '1px solid var(--bd)',
            padding: '6px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            fontSize: 9,
            color: 'var(--t3)',
            background: 'var(--bg1)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ArrowUp size={9} />
            <ArrowDown size={9} />
            navigate
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <CornerDownLeft size={9} />
            select
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 8 }}>esc</span>
            close
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Hash size={9} />
            {filtered.length} results
          </span>
        </div>
      </div>
    </div>
  );
}
