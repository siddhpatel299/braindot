'use client';

import { LucideIcon } from 'lucide-react';
import {
  StickyNote,
  Share2,
  Tags,
  Search,
  LayoutDashboard,
  KanbanSquare,
  PenTool,
  BookOpen,
  Plus,
  Sun,
  Moon,
  LogOut,
} from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { LogoMark } from './Logo';

/** The rail is for switching *places*. Journal, Ask AI and Study mode are not
 *  places — they all land you back in the editor — so they live where they act:
 *  the editor's right-hand panel, the command palette, and the dashboard. */
export type IconRailView = 'dashboard' | 'notes' | 'graph' | 'tags' | 'search' | 'kanban' | 'canvas' | 'reading';

interface IconRailProps {
  active: IconRailView;
  onSelect: (view: IconRailView) => void;
  onOpenPalette: () => void;
  /** Was a button on the old top bar; it is an action, so it lives on the rail. */
  onCreateNote: () => void;
  onSignOut?: () => void;
}

interface RailButtonProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  muted?: boolean;
  onClick?: () => void;
}

function RailButton({ icon: Icon, label, active, muted, onClick }: RailButtonProps) {
  const idle = muted ? 'var(--t3)' : 'var(--t2)';
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      title={label}
      style={{
        width: 34,
        height: 34,
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        background: active ? 'var(--acc-bg)' : 'transparent',
        color: active ? 'var(--acc2)' : idle,
        border: 'none',
        cursor: 'pointer',
        transition: 'background 0.12s, color 0.12s',
      }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--t1)'; } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = idle; } }}
    >
      {/* The active place is marked in the rail's own edge, so the mark reads
          as "you are here" rather than as another button. */}
      {active && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', left: -8, top: 8, bottom: 8,
            width: 2, borderRadius: '0 2px 2px 0', background: 'var(--acc)',
          }}
        />
      )}
      <Icon size={17} strokeWidth={1.9} />
    </button>
  );
}

export function IconRail({ active, onSelect, onOpenPalette, onCreateNote, onSignOut }: IconRailProps) {
  const { theme, toggle } = useTheme();

  return (
    <div
      style={{
        width: 50,
        minWidth: 50,
        height: '100%',
        background: 'var(--bg1)',
        borderRight: '1px solid var(--bd)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '8px 0 10px',
        gap: 3,
        flexShrink: 0,
      }}
    >
      <button
        onClick={() => onSelect('dashboard')}
        title="Braindot — dashboard"
        aria-label="Braindot — dashboard"
        style={{
          width: 30,
          height: 30,
          borderRadius: 7,
          background: 'var(--acc-bg)',
          border: '1px solid var(--acc-bd)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 8,
          cursor: 'pointer',
        }}
      >
        <LogoMark size={18} />
      </button>

      <RailButton icon={LayoutDashboard} label="Dashboard" active={active === 'dashboard'} onClick={() => onSelect('dashboard')} />
      <RailButton icon={StickyNote} label="Notes" active={active === 'notes'} onClick={() => onSelect('notes')} />
      <RailButton icon={Share2} label="Graph view" active={active === 'graph'} onClick={() => onSelect('graph')} />
      <RailButton icon={KanbanSquare} label="Kanban + Todos" active={active === 'kanban'} onClick={() => onSelect('kanban')} />
      <RailButton icon={PenTool} label="Canvas" active={active === 'canvas'} onClick={() => onSelect('canvas')} />
      <RailButton icon={BookOpen} label="Reading" active={active === 'reading'} onClick={() => onSelect('reading')} />

      <div style={{ width: 20, height: 1, background: 'var(--bd)', margin: '5px 0' }} />

      <RailButton icon={Tags} label="Tags" active={active === 'tags'} onClick={() => onSelect('tags')} />
      <RailButton icon={Search} label="Search everything" active={active === 'search'} onClick={() => onSelect('search')} />
      <RailButton icon={Plus} label="New note  ⌘T" onClick={onCreateNote} />

      <div style={{ flex: 1 }} />

      {/* ⌘K used to be advertised by a permanent 720px-wide field across the
          top of the app. It is one key; the rail can say so in 34px. */}
      <button
        onClick={onOpenPalette}
        title="Command palette  ⌘K"
        aria-label="Open the command palette"
        style={{
          width: 34,
          height: 26,
          borderRadius: 5,
          background: 'var(--bg2)',
          border: '1px solid var(--bd)',
          color: 'var(--t2)',
          fontSize: 11,
          fontFamily: 'inherit',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 4,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--t1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--t2)'; }}
      >
        ⌘K
      </button>

      <RailButton
        icon={theme === 'dark' ? Sun : Moon}
        label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        muted
        onClick={toggle}
      />
      {onSignOut && <RailButton icon={LogOut} label="Sign out" muted onClick={onSignOut} />}
    </div>
  );
}
