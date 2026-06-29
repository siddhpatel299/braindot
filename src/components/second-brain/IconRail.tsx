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
} from 'lucide-react';

export type IconRailView = 'notes' | 'graph' | 'journal' | 'ai' | 'tags' | 'search';

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
        border: active ? '1px solid #3d378a' : '1px solid transparent',
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
        width: 46,
        minWidth: 46,
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
      {/* Logo */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: 'var(--acc)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 10,
          boxShadow: '0 0 0 1px rgba(124,110,247,0.4), 0 0 16px rgba(124,110,247,0.18)',
        }}
      >
        <Brain size={16} color="#0c0c0e" strokeWidth={2.25} />
      </div>

      <RailButton icon={StickyNote} label="Notes" active={active === 'notes'} onClick={() => onSelect('notes')} />
      <RailButton icon={Share2} label="Graph view" active={active === 'graph'} onClick={() => onSelect('graph')} />
      <RailButton icon={CalendarDays} label="Daily journal" active={active === 'journal'} onClick={() => onSelect('journal')} />
      <RailButton icon={Sparkles} label="AI synthesis" active={active === 'ai'} onClick={() => onSelect('ai')} />

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
      <RailButton icon={Search} label="Search" onClick={onOpenPalette} />

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* User avatar */}
      <div
        title="You"
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: '#1D9E75',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
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
