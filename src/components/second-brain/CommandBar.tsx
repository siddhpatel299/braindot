'use client';

import { Search, Plus, Flame, Sun, Moon } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

interface CommandBarProps {
  search: string;
  onSearchChange: (s: string) => void;
  onOpenPalette: () => void;
  onCreate: () => void;
  streak: number;
}

export function CommandBar({ search, onSearchChange, onOpenPalette, onCreate, streak }: CommandBarProps) {
  const { theme, toggle } = useTheme();

  return (
    <div
      style={{
        height: 48,
        background: 'var(--bg1)',
        borderBottom: '1px solid var(--bd)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        gap: 14,
      }}
    >
      {/* Search input */}
      <div
        style={{
          flex: 1,
          height: 34,
          background: 'var(--bg3)',
          border: '1px solid var(--bd2)',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: 10,
          maxWidth: 720,
        }}
      >
        <Search size={15} color="var(--t3)" strokeWidth={1.75} />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={onOpenPalette}
          placeholder="search notes, jump to, run command"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--t1)',
            fontFamily: 'inherit',
            caretColor: 'var(--acc2)',
          }}
        />
        {search && (
          <span
            className="sb-blink"
            style={{
              width: 1,
              height: 13,
              background: 'var(--acc2)',
            }}
          />
        )}
        <button
          onClick={onOpenPalette}
          title="Open command palette (⌘K)"
          style={{
            height: 22,
            padding: '0 8px',
            background: 'var(--bg4)',
            border: '1px solid var(--bd2)',
            borderRadius: 3,
            color: 'var(--t2)',
            fontSize: 11,
            fontFamily: 'inherit',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          ⌘K
        </button>
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Streak */}
        <div
          title="Writing streak"
          style={{
            height: 28,
            padding: '0 10px',
            background: 'var(--amb-bg)',
            border: '1px solid var(--amb-bd)',
            borderRadius: 4,
            color: 'var(--amb)',
            fontSize: 12,
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontWeight: 600,
          }}
        >
          <Flame size={13} strokeWidth={2} />
          {streak}d
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          aria-label="Toggle theme"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            height: 32,
            width: 32,
            background: 'var(--bg2)',
            border: '1px solid var(--bd2)',
            borderRadius: 4,
            color: 'var(--t2)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.12s, color 0.12s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg3)';
            e.currentTarget.style.color = 'var(--t1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg2)';
            e.currentTarget.style.color = 'var(--t2)';
          }}
        >
          {theme === 'dark' ? <Sun size={15} strokeWidth={2} /> : <Moon size={15} strokeWidth={2} />}
        </button>

        {/* New note */}
        <button
          onClick={onCreate}
          style={{
            height: 32,
            padding: '0 14px',
            background: 'var(--acc)',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            fontSize: 13,
            fontFamily: 'inherit',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontWeight: 600,
            boxShadow: '0 0 0 1px rgba(124,110,247,0.3)',
            transition: 'background 0.12s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--acc2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--acc)';
          }}
        >
          <Plus size={14} strokeWidth={2.5} />
          new note
        </button>
      </div>
    </div>
  );
}
