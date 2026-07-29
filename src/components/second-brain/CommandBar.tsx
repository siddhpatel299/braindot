'use client';

import { Search, Plus, Flame, Sun, Moon, LogOut, Cloud, CloudOff, Menu } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useDesktopShell } from '@/hooks/useDesktop';

/**
 * Room this bar leaves for the OS window controls when it doubles as the title
 * bar. Windows puts three 46px caption buttons on the right; macOS puts the
 * traffic lights on the left, positioned by `trafficLightPosition` in main.js.
 */
const CAPTION_BUTTONS_WIDTH = 146;
const TRAFFIC_LIGHTS_WIDTH = 78;

/** -webkit-app-region is not in React's CSSProperties, so it needs a cast. */
const drag = { WebkitAppRegion: 'drag' } as React.CSSProperties;
const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

interface CommandBarProps {
  search: string;
  onSearchChange: (s: string) => void;
  onOpenPalette: () => void;
  onCreate: () => void;
  streak: number;
  /** 'synced' | 'syncing' | 'local' — omit to hide the chip */
  syncState?: 'synced' | 'syncing' | 'local';
  onSignOut?: () => void;
}

export function CommandBar({ search, onSearchChange, onOpenPalette, onCreate, streak, syncState, onSignOut }: CommandBarProps) {
  const { theme, toggle } = useTheme();
  // In the desktop build this bar *is* the window title bar: it drags the
  // window, and it leaves room for the native window controls — on the right
  // on Windows, on the left on macOS.
  const { isDesktop, isMac } = useDesktopShell();

  return (
    <div
      style={{
        height: 48,
        background: 'var(--bg1)',
        borderBottom: '1px solid var(--bd)',
        display: 'flex',
        alignItems: 'center',
        padding: !isDesktop
          ? '0 14px'
          : isMac
            ? `0 14px 0 ${TRAFFIC_LIGHTS_WIDTH}px`
            : `0 ${CAPTION_BUTTONS_WIDTH}px 0 14px`,
        gap: 14,
        ...(isDesktop ? drag : {}),
      }}
    >
      {/* Application menu. Windows draws no menu bar for a window with a hidden
          title bar, so the app offers its own way in; macOS has a real menu bar
          at the top of the screen and needs no button. */}
      {isDesktop && !isMac && (
        <button
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            window.braindot?.popupMenu(Math.round(r.left), Math.round(r.bottom));
          }}
          aria-label="Open menu"
          title="Menu"
          style={{
            height: 30,
            width: 30,
            flexShrink: 0,
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: 4,
            color: 'var(--t3)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.12s, color 0.12s',
            ...noDrag,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg3)';
            e.currentTarget.style.color = 'var(--t1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--t3)';
          }}
        >
          <Menu size={15} strokeWidth={2} />
        </button>
      )}

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
          ...(isDesktop ? noDrag : {}),
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...(isDesktop ? noDrag : {}) }}>
        {/* Cloud sync status */}
        {syncState && (
          <div
            title={
              syncState === 'syncing' ? 'Saving to cloud…'
              : syncState === 'synced' ? 'All changes synced to cloud'
              : 'Local only — sign in to sync'
            }
            style={{
              height: 28,
              padding: '0 10px',
              background: 'var(--bg2)',
              border: '1px solid var(--bd2)',
              borderRadius: 4,
              color: syncState === 'local' ? 'var(--t3)' : 'var(--grn)',
              fontSize: 11,
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            {syncState === 'local'
              ? <CloudOff size={12} strokeWidth={2} />
              : <Cloud size={12} strokeWidth={2} />}
            {syncState === 'syncing' ? 'syncing…' : syncState === 'synced' ? 'synced' : 'local'}
          </div>
        )}

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

        {/* Sign out */}
        {onSignOut && (
          <button
            onClick={onSignOut}
            aria-label="Sign out"
            title="Sign out"
            style={{
              height: 32,
              width: 32,
              background: 'var(--bg2)',
              border: '1px solid var(--bd2)',
              borderRadius: 4,
              color: 'var(--t3)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg3)';
              e.currentTarget.style.color = 'var(--red)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--bg2)';
              e.currentTarget.style.color = 'var(--t3)';
            }}
          >
            <LogOut size={14} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}
