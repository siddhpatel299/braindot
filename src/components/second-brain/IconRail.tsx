'use client';

import { LucideIcon } from 'lucide-react';
import {
  StickyNote,
  Share2,
  CalendarDays,
  Sparkles,
  Tags,
  Search,
  Brain,
  LayoutDashboard,
  KanbanSquare,
  PenTool,
  BookOpen,
  GraduationCap,
} from 'lucide-react';

export type IconRailView = 'dashboard' | 'notes' | 'graph' | 'journal' | 'ai' | 'study' | 'tags' | 'search' | 'kanban' | 'canvas' | 'reading';

interface IconRailProps {
  active: IconRailView;
  onSelect: (view: IconRailView) => void;
  onOpenPalette: () => void;
}

interface RailButtonProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

function RailButton({ icon: Icon, label, active, onClick }: RailButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        width: 36,
        height: 36,
        borderRadius: 5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active ? 'var(--acc-bg)' : 'transparent',
        color: active ? 'var(--acc2)' : 'var(--t2)',
        border: active ? '1px solid var(--acc-bd)' : '1px solid transparent',
        cursor: 'pointer',
        transition: 'background 0.12s, color 0.12s, border 0.12s',
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
    >
      <Icon size={18} strokeWidth={1.75} />
    </button>
  );
}

export function IconRail({ active, onSelect, onOpenPalette }: IconRailProps) {
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
        padding: '8px 0',
        gap: 6,
      }}
    >
      {/* Logo — clickable to go to dashboard */}
      <button
        onClick={() => onSelect('dashboard')}
        title="Dashboard"
        aria-label="Dashboard"
        style={{
          width: 32,
          height: 32,
          borderRadius: 7,
          background: 'var(--acc)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 8,
          boxShadow: '0 0 0 1px rgba(124,110,247,0.4), 0 0 16px rgba(124,110,247,0.18)',
          cursor: 'pointer',
          border: 'none',
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.05)';
          e.currentTarget.style.boxShadow = '0 0 0 1px rgba(124,110,247,0.6), 0 0 20px rgba(124,110,247,0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 0 0 1px rgba(124,110,247,0.4), 0 0 16px rgba(124,110,247,0.18)';
        }}
      >
        <Brain size={18} color="#0c0c0e" strokeWidth={2.25} />
      </button>

      <RailButton icon={LayoutDashboard} label="Dashboard" active={active === 'dashboard'} onClick={() => onSelect('dashboard')} />
      <RailButton icon={StickyNote} label="Notes" active={active === 'notes'} onClick={() => onSelect('notes')} />
      <RailButton icon={Share2} label="Graph view" active={active === 'graph'} onClick={() => onSelect('graph')} />
      <RailButton icon={KanbanSquare} label="Kanban + Todos" active={active === 'kanban'} onClick={() => onSelect('kanban')} />
      <RailButton icon={PenTool} label="Canvas" active={active === 'canvas'} onClick={() => onSelect('canvas')} />
      <RailButton icon={BookOpen} label="Reading" active={active === 'reading'} onClick={() => onSelect('reading')} />
      <RailButton icon={CalendarDays} label="Daily journal" active={active === 'journal'} onClick={() => onSelect('journal')} />
      <RailButton icon={Sparkles} label="Ask AI" active={active === 'ai'} onClick={() => onSelect('ai')} />
      <RailButton icon={GraduationCap} label="Study mode" active={active === 'study'} onClick={() => onSelect('study')} />

      {/* Divider */}
      <div
        style={{
          width: 22,
          height: 1,
          background: 'var(--bd)',
          margin: '6px 0',
        }}
      />

      <RailButton icon={Tags} label="Tags" active={active === 'tags'} onClick={() => onSelect('tags')} />
      <RailButton icon={Search} label="Search" active={active === 'search'} onClick={() => onSelect('search')} />

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* User avatar */}
      <div
        title="You"
        style={{
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: '#1D9E75',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.04em',
          cursor: 'pointer',
        }}
      >
        ZA
      </div>
    </div>
  );
}
