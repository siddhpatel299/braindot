'use client';

import { useState } from 'react';
import {
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  Undo2, Redo2, Type, Check, ImagePlus, Pilcrow,
} from 'lucide-react';
import { Note } from '@/types';
import { EditorTabs } from './EditorTabs';
import { EditorFont, EDITOR_FONT_OPTIONS } from '@/hooks/useEditorFont';

export type ViewMode = 'edit' | 'preview' | 'diff';

/** Named for what the writer is doing, not for what the renderer is doing. */
const MODES: { id: ViewMode; label: string; hint: string }[] = [
  { id: 'edit', label: 'write', hint: 'Edit the note' },
  { id: 'preview', label: 'read', hint: 'Read it as a finished document' },
  { id: 'diff', label: 'changes', hint: 'See what changed since the last save' },
];

interface EditorBarProps {
  notes: Note[];
  openTabs: string[];
  activeTab: string;
  dirtyIds: Set<string>;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onCreateNote: () => void;
  onReorderTabs: (fromId: string, toId: string) => void;

  treeCollapsed: boolean;
  onToggleTree: () => void;
  panelCollapsed: boolean;
  onTogglePanel: () => void;

  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;

  font: EditorFont;
  onFontChange: (f: EditorFont) => void;

  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;

  onInsertImage: () => void;
  imageBusy?: boolean;
  /** Reveals the Format inspector in the right panel. */
  onOpenFormat: () => void;
  /** No note open — mode, font and history have nothing to act on. */
  disabled?: boolean;
}

const ROW_HEIGHT = 34;

function IconButton({
  icon: Icon, label, onClick, active, disabled, danger,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      style={{
        width: 26,
        height: 26,
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        background: active ? 'var(--bg3)' : 'transparent',
        border: 'none',
        color: danger ? 'var(--red)' : active ? 'var(--t1)' : 'var(--t2)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.35 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--t1)'; } }}
      onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.background = active ? 'var(--bg3)' : 'transparent'; e.currentTarget.style.color = active ? 'var(--t1)' : 'var(--t2)'; } }}
    >
      <Icon size={14} strokeWidth={2} />
    </button>
  );
}

/**
 * One row of editor chrome.
 *
 * It used to be three: a global search bar, a tab strip, and a mode-plus-
 * formatting toolbar — around 120px of the window, permanently, on a surface
 * whose whole job is to hold text. Tabs, view mode and the note-level controls
 * are all "which note, shown how", so they belong on the same line.
 */
export function EditorBar(props: EditorBarProps) {
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const { disabled } = props;

  const LeftToggleIcon = props.treeCollapsed ? PanelLeftOpen : PanelLeftClose;
  const RightToggleIcon = props.panelCollapsed ? PanelRightOpen : PanelRightClose;

  return (
    <div
      style={{
        height: ROW_HEIGHT,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 6px',
        background: 'var(--bg1)',
        borderBottom: '1px solid var(--bd)',
      }}
    >
      {/* The toggle lives here rather than on the panel it controls: a control
          that disappears with its panel leaves no way back. */}
      <IconButton
        icon={LeftToggleIcon}
        label={`${props.treeCollapsed ? 'Show' : 'Hide'} folders  ⌘\\`}
        onClick={props.onToggleTree}
      />

      <div style={{ flex: 1, minWidth: 0, alignSelf: 'stretch' }}>
        <EditorTabs
          notes={props.notes}
          openTabs={props.openTabs}
          activeTab={props.activeTab}
          dirtyIds={props.dirtyIds}
          onSelect={props.onSelectTab}
          onClose={props.onCloseTab}
          onCreate={props.onCreateNote}
          onReorder={props.onReorderTabs}
        />
      </div>

      {/* Mode */}
      <div
        role="group"
        aria-label="View mode"
        style={{
          display: 'flex',
          gap: 1,
          padding: 2,
          borderRadius: 5,
          background: 'var(--bg2)',
          flexShrink: 0,
          opacity: disabled ? 0.4 : 1,
        }}
      >
        {MODES.map((m) => {
          const active = props.viewMode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => props.onViewModeChange(m.id)}
              disabled={disabled}
              title={m.hint}
              aria-pressed={active}
              style={{
                height: 22,
                padding: '0 9px',
                borderRadius: 4,
                border: 'none',
                background: active ? 'var(--bg4)' : 'transparent',
                color: active ? 'var(--t1)' : 'var(--t3)',
                fontSize: 10.5,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                fontWeight: active ? 600 : 500,
                fontFamily: 'inherit',
                cursor: disabled ? 'default' : 'pointer',
              }}
              onMouseEnter={(e) => { if (!active && !disabled) e.currentTarget.style.color = 'var(--t2)'; }}
              onMouseLeave={(e) => { if (!active && !disabled) e.currentTarget.style.color = 'var(--t3)'; }}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      <span style={{ width: 1, height: 16, background: 'var(--bd)', flexShrink: 0 }} />

      {/* The way in for anyone who does not want to learn markdown: opens the
          Format inspector, where every command is spelled out in words. */}
      <IconButton
        icon={Pilcrow}
        label="Format — headings, lists, links"
        onClick={props.onOpenFormat}
        disabled={disabled}
      />

      <IconButton
        icon={ImagePlus}
        label={props.imageBusy ? 'Adding picture…' : 'Add a picture'}
        onClick={props.onInsertImage}
        disabled={disabled || props.imageBusy}
      />

      {/* Reading font */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <IconButton
          icon={Type}
          label="Reading font"
          onClick={() => setFontMenuOpen((o) => !o)}
          active={fontMenuOpen}
          disabled={disabled}
        />
        {fontMenuOpen && (
          <>
            <div onClick={() => setFontMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
            <div
              style={{
                position: 'absolute', top: 30, right: 0, zIndex: 50, width: 224,
                background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 6,
                boxShadow: '0 10px 28px rgba(0,0,0,0.36)', padding: 4,
              }}
            >
              <div style={{
                fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em',
                color: 'var(--t3)', fontWeight: 600, padding: '5px 8px 6px',
              }}>
                reading font
              </div>
              {EDITOR_FONT_OPTIONS.map((opt) => {
                const active = props.font === opt.id;
                // <samp> escapes the global monospace rule, so each label
                // previews the face it names.
                const stack =
                  opt.id === 'serif'
                    ? "'Iowan Old Style','Palatino Linotype',Palatino,Charter,Georgia,serif"
                    : opt.id === 'sans'
                      ? "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif"
                      : "'JetBrains Mono','Fira Mono',monospace";
                return (
                  <button
                    key={opt.id}
                    onClick={() => { props.onFontChange(opt.id); setFontMenuOpen(false); }}
                    style={{
                      width: '100%', textAlign: 'left', padding: '7px 8px', borderRadius: 4,
                      background: active ? 'var(--acc-bg)' : 'transparent',
                      border: active ? '1px solid var(--acc-bd)' : '1px solid transparent',
                      color: 'var(--t1)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--bg3)'; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ width: 14, flexShrink: 0, color: 'var(--acc2)' }}>
                      {active && <Check size={13} />}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <samp style={{ fontFamily: stack, fontSize: 14, color: active ? 'var(--t1)' : 'var(--t2)', display: 'block' }}>
                        {opt.label} — Aa
                      </samp>
                      <span style={{ fontSize: 10, color: 'var(--t3)' }}>{opt.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <IconButton icon={Undo2} label="Undo  ⌘Z" onClick={props.onUndo} disabled={disabled || !props.canUndo} />
      <IconButton icon={Redo2} label="Redo  ⌘⇧Z" onClick={props.onRedo} disabled={disabled || !props.canRedo} />

      <span style={{ width: 1, height: 16, background: 'var(--bd)', flexShrink: 0 }} />

      <IconButton
        icon={RightToggleIcon}
        label={`${props.panelCollapsed ? 'Show' : 'Hide'} context  ⌘⇧\\`}
        onClick={props.onTogglePanel}
      />
    </div>
  );
}
