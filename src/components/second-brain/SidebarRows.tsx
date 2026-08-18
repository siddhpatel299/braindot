'use client';

import {
  FileText, Plus, FolderPlus, Folder as FolderIcon,
  ChevronRight, ChevronDown, Pin, X,
} from 'lucide-react';
import { Note, Folder } from '@/types';
import { plural } from '@/utils/markdown';

/**
 * The rows both sidebar views are built from.
 *
 * Notebooks and Folders are two projections of one tree, so nothing below the
 * layout may differ between them: a note row behaves identically whether it is
 * indented under four folders or listed flat under a section header. Keeping
 * these in one place is what makes that true rather than merely intended.
 */

const ROW_HEIGHT = 26;
/** One indent step per level of nesting, in the Folders view only. */
export const INDENT = 14;

interface NoteRowProps {
  note: Note;
  /** Indent level. The Notebooks view always passes 0 — it has no indentation. */
  depth?: number;
  active: boolean;
  onSelect: (id: string) => void;
  onTogglePinned: (id: string) => void;
  onDelete: (id: string) => void;
}

export function NoteRow({ note, depth = 0, active, onSelect, onTogglePinned, onDelete }: NoteRowProps) {
  return (
    <div
      className="sb-note-row"
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/note-id', note.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => onSelect(note.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(note.id); }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onTogglePinned(note.id);
      }}
      style={{
        height: ROW_HEIGHT,
        paddingLeft: 12 + depth * INDENT,
        paddingRight: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: active ? 'var(--acc-bg)' : 'transparent',
        color: active ? 'var(--acc2)' : 'var(--t2)',
        borderLeft: active ? '2px solid var(--acc)' : '2px solid transparent',
        cursor: 'pointer',
        transition: 'background 0.1s, color 0.1s',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'var(--bg2)';
          e.currentTarget.style.color = 'var(--t1)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--t2)';
        }
      }}
      title={`${note.title}\nRight-click to ${note.pinned ? 'unpin' : 'pin'}`}
    >
      {note.pinned ? (
        <Pin size={12} style={{ flexShrink: 0, opacity: 0.7, color: 'var(--amb)' }} />
      ) : (
        <FileText size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
      )}
      <span style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {note.title}
      </span>
      {/* Backlink count — hidden on row hover to make room for delete. */}
      <span
        className="sb-note-badge"
        style={{
          fontSize: 10, background: 'var(--bg3)', color: 'var(--t3)',
          padding: '1px 6px', borderRadius: 3, minWidth: 18, textAlign: 'center',
        }}
      >
        {note.backlinks.length}
      </span>
      <button
        className="sb-note-del"
        title="Delete note"
        aria-label={`Delete ${note.title}`}
        onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}
        style={{
          flexShrink: 0, width: 18, height: 18, borderRadius: 3,
          background: 'transparent', border: 'none', color: 'var(--t3)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--red)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t3)'; }}
      >
        <X size={13} />
      </button>
    </div>
  );
}

interface FolderRowProps {
  folder: Folder;
  depth: number;
  expanded: boolean;
  /** Direct children, notes and folders together — what the count prints. */
  childCount: number;
  isDragOver: boolean;
  renaming: boolean;
  renameValue: string;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onStartRename: () => void;
  onToggle: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onCreateNote: () => void;
  onCreateFolder: () => void;
  onDelete: () => void;
}

export function FolderRow({
  folder, depth, expanded, childCount, isDragOver,
  renaming, renameValue, onRenameChange, onRenameCommit, onRenameCancel, onStartRename,
  onToggle, onDragOver, onDragLeave, onDrop, onCreateNote, onCreateFolder, onDelete,
}: FolderRowProps) {
  return (
    <div
      className="sb-folder-row"
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); }
      }}
      onDoubleClick={(e) => { e.stopPropagation(); onStartRename(); }}
      style={{
        height: ROW_HEIGHT,
        paddingLeft: 6 + depth * INDENT,
        paddingRight: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: isDragOver ? 'var(--acc-bg)' : 'transparent',
        borderLeft: isDragOver ? '2px solid var(--acc)' : '2px solid transparent',
        cursor: 'pointer',
        userSelect: 'none',
      }}
      title={`${folder.name}\nDouble-click to rename · Drag note here to move`}
    >
      <span style={{ fontSize: 8, color: 'var(--t3)', width: 10, display: 'inline-flex', justifyContent: 'center' }}>
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      </span>
      <FolderIcon
        size={11}
        style={{ flexShrink: 0, color: folder.paraType ? 'var(--acc2)' : 'var(--t3)' }}
        strokeWidth={1.5}
      />
      {renaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onRenameCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameCommit();
            if (e.key === 'Escape') onRenameCancel();
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1, background: 'var(--bg3)', border: '1px solid var(--acc)',
            color: 'var(--t1)', fontSize: 13, padding: '1px 5px', borderRadius: 2,
            outline: 'none', fontFamily: 'inherit',
          }}
        />
      ) : (
        <span
          style={{
            fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: 'var(--t2)',
            fontWeight: folder.paraType ? 600 : 400,
            textTransform: folder.paraType ? 'uppercase' : 'none',
            letterSpacing: folder.paraType ? '0.04em' : '0',
          }}
        >
          {folder.name}
        </span>
      )}
      <span style={{ fontSize: 10, color: 'var(--t3)', opacity: 0.6 }}>
        {childCount || ''}
      </span>
      <div className="sb-folder-actions" style={{ display: 'flex', gap: 2 }}>
        <IconAction label="New note in folder" onClick={onCreateNote}><Plus size={11} strokeWidth={2} /></IconAction>
        <IconAction label="New subfolder" onClick={onCreateFolder}><FolderPlus size={11} strokeWidth={2} /></IconAction>
        {/* A PARA folder is structural; deleting one would leave the vault
            without a place for the notes it holds. */}
        {!folder.paraType && (
          <IconAction label="Delete folder" onClick={onDelete}><X size={11} strokeWidth={2} /></IconAction>
        )}
      </div>
    </div>
  );
}

function IconAction({ label, onClick, children }: {
  label: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={label}
      aria-label={label}
      style={{
        width: 16, height: 16, borderRadius: 2, background: 'transparent',
        border: 'none', color: 'var(--t3)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
      }}
    >
      {children}
    </button>
  );
}

/**
 * A section head in the Notebooks view: a folder's name, standing over its
 * notes without an indent. Also a drop target, so a note can be filed into a
 * section by dragging it onto the label.
 *
 * A section *is* a folder, so it carries the same actions a folder row does in
 * the tree: add a note, add a subfolder, rename on double-click, delete.
 * Without them the only way to fill a new section was to make the note
 * somewhere else and drag it in.
 */
export function SectionHeader({
  name, count, isDragOver, onDragOver, onDragLeave, onDrop,
  onCreateNote, onCreateFolder, onDelete,
  renaming, renameValue, onRenameChange, onRenameCommit, onRenameCancel, onRenameStart,
}: {
  name: string;
  count: number;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onCreateNote: () => void;
  onCreateFolder: () => void;
  onDelete: () => void;
  renaming: boolean;
  renameValue: string;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onRenameStart: () => void;
}) {
  return (
    <div
      className="sb-section-header"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDoubleClick={onRenameStart}
      title={`${name} — drag a note here to file it, double-click to rename`}
      style={{
        padding: '8px 12px 4px',
        fontSize: 11,
        textTransform: renaming ? 'none' : 'uppercase',
        letterSpacing: '0.09em',
        color: isDragOver ? 'var(--acc2)' : 'var(--t3)',
        background: isDragOver ? 'var(--acc-bg)' : 'transparent',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
      }}
    >
      {renaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onRenameCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameCommit();
            if (e.key === 'Escape') onRenameCancel();
          }}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Rename ${name}`}
          style={{
            flex: 1, minWidth: 0, background: 'var(--bg3)', border: '1px solid var(--acc-bd)',
            color: 'var(--t1)', fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
            padding: '1px 5px', borderRadius: 2, outline: 'none', letterSpacing: '0.04em',
          }}
        />
      ) : (
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </span>
      )}
      <span style={{ opacity: 0.6 }}>{count || ''}</span>
      <div className="sb-folder-actions" style={{ display: 'flex', gap: 2 }}>
        <IconAction label={`New note in ${name}`} onClick={onCreateNote}><Plus size={11} strokeWidth={2} /></IconAction>
        <IconAction label={`New subfolder in ${name}`} onClick={onCreateFolder}><FolderPlus size={11} strokeWidth={2} /></IconAction>
        <IconAction label={`Delete ${name}`} onClick={onDelete}><X size={11} strokeWidth={2} /></IconAction>
      </div>
    </div>
  );
}

/**
 * How depth survives without another indent level.
 *
 * A section that itself holds folders ends with this row; clicking it makes
 * that folder the panel's subject, so the fifth level of a vault reads at the
 * same width as the first.
 */
export function DrillRow({ folders, noteCount, onDrill }: {
  folders: Folder[];
  /** Notes beneath the single child folder, for its label. */
  noteCount: number;
  onDrill: () => void;
}) {
  const label = folders.length === 1
    ? `${folders[0].name} — ${plural(noteCount, 'note')}`
    : `${plural(folders.length, 'folder')} inside`;
  return (
    <button
      onClick={onDrill}
      title={label}
      style={{
        width: '100%', height: ROW_HEIGHT, padding: '0 8px 0 12px',
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'transparent', border: 'none', borderLeft: '2px solid transparent',
        color: 'var(--t3)', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer',
        transition: 'background 0.1s, color 0.1s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--acc2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--t3)'; }}
    >
      <FolderIcon size={11} strokeWidth={1.6} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <ChevronRight size={11} style={{ flexShrink: 0 }} />
    </button>
  );
}
